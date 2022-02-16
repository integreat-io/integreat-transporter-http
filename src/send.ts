import debugFn from 'debug'
import got, { HTTPError, Response as GotResponse, Options } from 'got'
import queryString = require('query-string')
import { Action, Response, EndpointOptions, Connection } from './types'

const debug = debugFn('great:transporter:http')

const isGotResponse = (response: unknown): response is GotResponse =>
  !!response &&
  typeof response === 'object' &&
  typeof (response as GotResponse).statusCode === 'number'

const logRequest = (request: Options) => {
  const message = `Sending ${request.method} ${request.url}`
  debug('%s: %o', message, request.headers, request.body)
}

const logResponse = (response: Response, { url, method }: Options) => {
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
  error?: string
): Response => ({
  ...action.response,
  status,
  ...(data !== undefined && data !== '' ? { data } : {}),
  ...(error !== undefined ? { error } : {}),
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

const isValidQueryValue = (value: unknown) =>
  ['string', 'number', 'boolean'].includes(typeof value) || value === null

const prepareQueryValue = (value: unknown) =>
  value instanceof Date
    ? value.toISOString()
    : isValidQueryValue(value)
    ? value
    : JSON.stringify(value)

const prepareQueryParams = (params: Record<string, unknown>) =>
  Object.entries(params).reduce(
    (params, [key, value]) =>
      value === undefined
        ? params // Don't include undefined
        : { ...params, [key]: prepareQueryValue(value) },
    {}
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

const removeContentTypeIf = (
  headers: Record<string, string>,
  doRemove: boolean
) =>
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
  headers?: Record<string, unknown>,
  auth?: Record<string, unknown> | boolean | null
) => ({
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
    prefixUrl: options?.baseUri as string | undefined,
    url: generateUrl(options),
    searchParams: generateQueryParams(options, auth),
    method,
    body: prepareBody(payload.data),
    headers: removeContentTypeIf(
      createHeaders(options, payload.data, payload.headers, auth),
      method === 'GET'
    ),
    retry: 0,
    throwHttpErrors: false,
  }
}

const isOkResponse = (gotResponse: GotResponse) =>
  gotResponse.statusCode >= 200 && gotResponse.statusCode < 400

export default async function send(
  action: Action,
  _connection: Connection | null
): Promise<Response> {
  const { url, ...options } = optionsFromEndpoint(action)

  if (!url) {
    return createResponse(
      action,
      'badrequest',
      undefined,
      'No uri is provided in the action'
    )
  }

  try {
    logRequest({ url, ...options })
    // Type hack, as the CancelableRequest type returned by got is not identified as a Promise
    const gotResponse = await (got(url, options) as unknown as Promise<
      GotResponse<string>
    >)
    const response = isOkResponse(gotResponse)
      ? createResponse(action, 'ok', gotResponse.body)
      : createResponseWithError(action, url, gotResponse)
    logResponse(response, { url, ...options })
    return response
  } catch (error) {
    return createResponseWithError(action, url, error)
  }
}
