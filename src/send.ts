import debugFn from 'debug'
import got, { HTTPError, Response as GotResponse, Options } from 'got'
import queryString from 'query-string'
import { isDate } from './utils/is.js'
import {
  Action,
  Response,
  Headers,
  EndpointOptions,
  Connection,
} from './types.js'

type URLSearchArray = readonly [string, string][]
type KeyVal = [string, string]

const debug = debugFn('integreat:transporter:http')

const isGotResponse = (response: unknown): response is GotResponse =>
  !!response &&
  typeof response === 'object' &&
  typeof (response as GotResponse).statusCode === 'number'

function prepareLogUrl(url: string, query: URLSearchParams) {
  const searchIndex = url.indexOf('?')
  const bareUrl = searchIndex >= 0 ? url.slice(0, searchIndex) : url
  const querystring = query.toString()
  return querystring ? `${bareUrl}?${querystring}` : bareUrl
}

const logRequest = (request: Partial<Options>) => {
  const message = `Sending ${request.method} ${request.url}`
  debug('%s: %o %s', message, request.headers, request.body)
}

const logResponse = (response: Response, { url, method }: Partial<Options>) => {
  const { status, error } = response
  const message =
    status === 'ok'
      ? `Success from ${method} ${url}`
      : `Error '${status}' from ${method} ${url}: ${error}`
  debug('%s: %o', message, response)
}

const extractFromError = (
  error: unknown
): [number | undefined, string | undefined, unknown] =>
  isGotResponse(error)
    ? [error.statusCode, error.statusMessage, error.body]
    : error instanceof HTTPError
    ? [error.response.statusCode, error.response.statusMessage, undefined]
    : error instanceof Error
    ? [undefined, error.message, undefined] // TODO: Return error.message in debug mode only?
    : [undefined, 'Unknown response', undefined]

const createResponse = (
  action: Action,
  status: string,
  data: unknown,
  error?: string,
  headers?: Headers
): Response => ({
  ...action.response,
  status,
  ...(data !== undefined && data !== '' ? { data } : {}),
  ...(error !== undefined ? { error } : {}),
  ...(headers ? { headers } : {}),
})

function createResponseWithError(action: Action, url: string, err: unknown) {
  const [statusCode, statusMessage, data] = extractFromError(err)

  const response = {
    status: 'error',
    error: `Server returned ${statusCode} for ${url}`,
  }

  if (statusCode === undefined) {
    response.error = `Server returned '${statusMessage}' for ${url}`
  } else {
    switch (statusCode) {
      case 400:
        response.status = 'badrequest'
        break
      case 401:
      case 403:
        response.status = 'noaccess'
        response.error = action.meta?.auth
          ? 'Not authorized'
          : 'Service requires authentication'
        break
      case 404:
        response.status = 'notfound'
        response.error = `Could not find the url ${url}`
        break
      case 408:
        response.status = 'timeout'
    }
  }

  return createResponse(action, response.status, data, response.error)
}

const removeLeadingSlashIf = (uri: string | undefined, doRemove: boolean) =>
  doRemove && typeof uri === 'string' && uri.startsWith('/')
    ? uri.slice(1)
    : uri

const generateUrl = ({ uri, baseUri }: EndpointOptions = {}) =>
  removeLeadingSlashIf(uri, !!baseUri)

function extractQueryParamsFromUri(uri?: string) {
  if (typeof uri === 'string') {
    const position = uri.indexOf('?')
    if (position > -1) {
      return queryString.parse(uri.slice(position))
    }
  }
  return {}
}

const prepareQueryValue = (value: unknown): string =>
  isDate(value)
    ? value.toISOString()
    : value === null
    ? ''
    : ['string', 'number', 'boolean'].includes(typeof value)
    ? String(value)
    : JSON.stringify(value)

const prepareQueryParams = (params: Record<string, unknown>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([_key, value]) => value !== undefined)
      .reduce(
        (params, [key, value]) =>
          Array.isArray(value)
            ? [
                ...params,
                ...value.map((val) => [key, prepareQueryValue(val)] as KeyVal),
              ]
            : [...params, [key, prepareQueryValue(value)] as KeyVal],
        [] as KeyVal[]
      ) as URLSearchArray
  )

const generateQueryParams = (
  { queryParams, authAsQuery, uri }: EndpointOptions = {},
  auth?: Record<string, unknown> | boolean | null
) =>
  prepareQueryParams({
    ...extractQueryParamsFromUri(uri),
    ...queryParams,
    ...(authAsQuery && auth && auth !== true ? auth : {}),
  })

const removeContentTypeIf = (headers: Headers, doRemove: boolean) =>
  doRemove
    ? Object.entries(headers).reduce(
        (headers, [key, value]) =>
          key.toLowerCase() === 'content-type'
            ? headers
            : { ...headers, [key]: value },
        {}
      )
    : headers

const createHeaders = (
  options?: EndpointOptions,
  data?: unknown,
  headers?: Headers,
  auth?: Record<string, unknown> | boolean | null
): Record<string, string | string[]> => ({
  'user-agent': 'integreat-transporter-http/0.1',
  ...(typeof data === 'string'
    ? { 'Content-Type': 'text/plain' }
    : { 'Content-Type': 'application/json' }), // Will be removed later on if GET
  ...options?.headers,
  ...headers,
  ...(auth === true || options?.authAsQuery ? {} : auth),
})

const selectMethod = (options?: EndpointOptions, data?: unknown) =>
  options?.method || (data ? ('PUT' as const) : ('GET' as const))

const prepareBody = (data: unknown) =>
  typeof data === 'string' || data === undefined ? data : JSON.stringify(data)

function optionsFromEndpoint({
  payload,
  meta: { options, auth } = {},
}: Action) {
  const method = selectMethod(options, payload.data)
  return {
    prefixUrl: options?.baseUri || '',
    url: generateUrl(options),
    searchParams: generateQueryParams(options, auth),
    method,
    body: method === 'GET' ? undefined : prepareBody(payload.data),
    headers: removeContentTypeIf(
      createHeaders(options, payload.data, payload.headers, auth),
      method === 'GET'
    ),
    retry: { limit: 0 },
    throwHttpErrors: false,
  }
}

const isOkResponse = (gotResponse: GotResponse) =>
  gotResponse.statusCode >= 200 && gotResponse.statusCode < 400

function extractResponseData(response: GotResponse, format: string) {
  if (format === 'base64') {
    return response.rawBody.toString('base64')
  } else {
    return response.body
  }
}

export default async function send(
  action: Action,
  _connection: Connection | null
): Promise<Response> {
  const { url, ...options } = optionsFromEndpoint(action)
  const { responseFormat = 'string' } = action.meta?.options || {}

  if (!url) {
    return createResponse(
      action,
      'badrequest',
      undefined,
      'No uri is provided in the action'
    )
  }

  const logOptions = {
    url: prepareLogUrl(url, options.searchParams),
    ...options,
  }

  try {
    logRequest(logOptions)
    const gotResponse = await got<string>(url, options)
    const response = isOkResponse(gotResponse)
      ? createResponse(
          action,
          'ok',
          extractResponseData(gotResponse, responseFormat),
          undefined,
          gotResponse.headers
        )
      : createResponseWithError(action, url, gotResponse)
    logResponse(response, logOptions)
    return response
  } catch (error) {
    return createResponseWithError(action, url, error)
  }
}
