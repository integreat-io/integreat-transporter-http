import got, { HTTPError, Response as GotResponse } from 'got'
import queryString = require('query-string')
import { Action, Response, EndpointOptions, Connection } from './types'

const extractFromError = (error: HTTPError | Error) =>
  error instanceof HTTPError
    ? {
        statusCode: error.response.statusCode,
        statusMessage: error.response.statusMessage,
      }
    : {
        statusCode: undefined,
        statusMessage: error.message, // TODO: Return error.message in debug mode only?
      }

const createResponse = (
  action: Action,
  status: string,
  data: unknown,
  error?: string
): Response => ({
  ...action.response,
  status,
  ...(data !== undefined ? { data } : {}),
  ...(error !== undefined ? { error } : {}),
})

function createResponseWithError(
  action: Action,
  error: HTTPError | Error,
  url: string
) {
  const { statusCode, statusMessage } = extractFromError(error)
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

  return createResponse(action, response.status, undefined, response.error)
}

const removeLeadingSlashIf = (uri: string | undefined, doRemove: boolean) =>
  doRemove && typeof uri === 'string' && uri.startsWith('/')
    ? uri.substr(1)
    : uri

const generateUrl = ({ uri, baseUri }: EndpointOptions = {}) =>
  removeLeadingSlashIf(uri, !!baseUri)

function extractQueryParamsFromUri(uri?: string) {
  if (typeof uri === 'string') {
    const position = uri.indexOf('?')
    if (position > -1) {
      return queryString.parse(uri.substr(position))
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
  }
}

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
    // Type hack, as the CancelableRequest type returned by got is not identified as a Promise
    const response = await ((got(url, options) as unknown) as Promise<
      GotResponse<string>
    >)
    return createResponse(action, 'ok', response.body)
  } catch (error) {
    return createResponseWithError(action, error, url)
  }
}
