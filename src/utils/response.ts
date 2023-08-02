import type { Action, Response, Headers } from 'integreat'
import {
  HTTPError,
  Response as GotResponse,
  RequestError as GotRequestError,
} from 'got'

export const dataFromResponse = (response: Response) =>
  typeof response.data === 'string'
    ? response.data
    : response.data === null || response.data === undefined
      ? undefined
      : JSON.stringify(response.data)

export function statusCodeFromResponse(response: Response) {
  switch (response.status) {
    case 'ok':
      return 200
    case 'queued':
      return 201
    case 'badrequest':
      return 400
    case 'autherror':
      return 401
    case 'noaccess':
      return 403
    case 'notfound':
    case 'noaction':
      return 404
    case 'timeout':
      return 408
    default:
      return 500
  }
}

export const normalizeHeaders = (
  headers?: Record<string, string | string[] | undefined>
) =>
  headers
    ? Object.fromEntries(
      Object.entries(headers)
        .filter(([, value]) => value !== undefined)
        .map(([key, value]) => [key.toLowerCase(), value])
    )
    : undefined

export const createResponse = (
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

const isGotResponse = (response: unknown): response is GotResponse =>
  !!response &&
  typeof response === 'object' &&
  typeof (response as GotResponse).statusCode === 'number'

const isGetRequestError = (error: Error): error is GotRequestError =>
  typeof (error as GotRequestError).code === 'string'

const getStatusCodeFromError = (error: Error) =>
  isGetRequestError(error) && error.code === 'ETIMEDOUT' ? 408 : undefined

const extractFromError = (
  error: unknown
): [number | undefined, string | undefined, unknown] =>
  isGotResponse(error)
    ? [error.statusCode, error.statusMessage, error.body]
    : error instanceof HTTPError
      ? [error.response.statusCode, error.response.statusMessage, undefined]
      : error instanceof Error
        ? [getStatusCodeFromError(error), error.message, undefined] // TODO: Return error.message in debug mode only?
        : [undefined, 'Unknown response', undefined]

function responseStatusFromCode(statusCode?: number) {
  switch (statusCode) {
    case 400:
      return 'badrequest'
    case 401:
    case 403:
      return 'noaccess'
    case 404:
      return 'notfound'
    case 408:
      return 'timeout'
    default:
      return 'error'
  }
}

function errorFromStatus(
  status: string,
  hasAuth: boolean,
  url: string,
  statusCode?: number,
  statusMessage?: string
) {
  if (statusCode === undefined) {
    return `Server returned '${statusMessage}' for ${url}`
  } else {
    switch (status) {
      case 'noaccess':
        return hasAuth
          ? `Not authorized (${statusCode})`
          : `Service requires authentication (${statusCode})`
      case 'notfound':
        return `Could not find the url ${url}`
      default:
        return `Server returned ${statusCode} for ${url}`
    }
  }
}

export function createResponseWithError(
  action: Action,
  url: string,
  err: unknown
) {
  const [statusCode, statusMessage, data] = extractFromError(err)

  const status = responseStatusFromCode(statusCode)
  const error = errorFromStatus(
    status,
    !!action.meta?.auth,
    url,
    statusCode,
    statusMessage
  )

  return createResponse(action, status, data, error)
}
