import debugFn from 'debug'
import got, { Response as GotResponse, Options as GotOptions } from 'got'
import queryString from 'query-string'
import { createResponse, createResponseWithError } from './utils/response.js'
import { isDate } from './utils/is.js'
import type { Action, Response, Headers } from 'integreat'
import { ServiceOptions, Connection } from './types.js'

type URLSearchArray = readonly [string, string][]
type KeyVal = [string, string]

const debug = debugFn('integreat:transporter:http')

function prepareLogUrl(url: string, query: URLSearchParams) {
  const searchIndex = url.indexOf('?')
  const bareUrl = searchIndex >= 0 ? url.slice(0, searchIndex) : url
  const querystring = query.toString()
  return querystring ? `${bareUrl}?${querystring}` : bareUrl
}

const logRequest = (request: Partial<GotOptions>) => {
  const message = `Sending ${request.method} ${request.url}`
  debug('%s: %o %s', message, request.headers, request.body)
}

const logResponse = (
  response: Response,
  { url, method }: Partial<GotOptions>,
) => {
  const { status, error } = response
  const message =
    status === 'ok'
      ? `Success from ${method} ${url}`
      : `Error '${status}' from ${method} ${url}: ${error}`
  debug('%s: %o', message, response)
}

const removeLeadingSlashIf = (uri: string | undefined, doRemove: boolean) =>
  doRemove && typeof uri === 'string' && uri.startsWith('/')
    ? uri.slice(1)
    : uri

const generateUrl = ({ uri, baseUri }: ServiceOptions = {}) =>
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
        [] as KeyVal[],
      ) as URLSearchArray,
  )

const generateQueryParams = (
  { queryParams, authAsQuery, uri }: ServiceOptions = {},
  auth?: Record<string, unknown> | boolean | null,
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
        {},
      )
    : headers

const createHeaders = (
  options?: ServiceOptions,
  data?: unknown,
  headers?: Headers,
  auth?: Record<string, unknown> | boolean | null,
): Record<string, string | string[]> => ({
  'user-agent': 'integreat-transporter-http/1.1',
  ...(typeof data === 'string'
    ? { 'Content-Type': 'text/plain' }
    : { 'Content-Type': 'application/json' }), // Will be removed later on if GET
  ...options?.headers,
  ...headers,
  ...(auth === true || options?.authAsQuery || options?.authInData ? {} : auth),
})

const selectMethod = (options?: ServiceOptions, data?: unknown) =>
  options?.method || (data ? ('PUT' as const) : ('GET' as const))

const prepareBody = (data: unknown) =>
  typeof data === 'string' || data === undefined ? data : JSON.stringify(data)

function optionsFromEndpoint({
  payload,
  meta: { options, auth } = {},
}: Action) {
  const method = selectMethod(options, payload.data)
  return {
    prefixUrl: typeof options?.baseUri === 'string' ? options.baseUri : '',
    url: generateUrl(options),
    searchParams: generateQueryParams(options, auth),
    method,
    body: method === 'GET' ? undefined : prepareBody(payload.data),
    headers: removeContentTypeIf(
      createHeaders(options, payload.data, payload.headers, auth),
      method === 'GET',
    ),
    retry: { limit: 0 },
    throwHttpErrors: false,
    timeout: {
      response: typeof options?.timeout === 'number' ? options.timeout : 120000,
    },
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

function responseFormatFromAction(action: Action) {
  const format = action.meta?.options?.responseFormat
  return typeof format === 'string' ? format : 'string'
}

const responseFromGotResponse = (
  gotResponse: GotResponse,
  url: string,
  action: Action,
) =>
  isOkResponse(gotResponse)
    ? createResponse(
        action,
        'ok',
        extractResponseData(gotResponse, responseFormatFromAction(action)),
        undefined,
        gotResponse.headers,
      )
    : createResponseWithError(action, url, gotResponse)

export default async function send(
  action: Action,
  connection: Connection | null,
): Promise<Response> {
  const { url, ...options } = optionsFromEndpoint(action)

  if (!url) {
    return createResponse(
      action,
      'badrequest',
      undefined,
      'No uri is provided in the action',
    )
  }

  const logOptions = {
    url: prepareLogUrl(url, options.searchParams),
    ...options,
  }

  if (connection?.waitFn) {
    // This is present when we have throttle setting, and will cause us to wait
    // if the limit is reaching within the set interval.
    await connection.waitFn()
  }

  try {
    logRequest(logOptions)
    const gotResponse = await got<string>(url, options)
    const response = responseFromGotResponse(gotResponse, url, action)
    logResponse(response, logOptions)
    return response
  } catch (error) {
    return createResponseWithError(action, url, error)
  }
}
