import type http from 'http'
import type { Headers, Dispatch, AuthenticateExternal } from 'integreat'

export interface HttpChallenge {
  scheme: string
  realm?: string
  params: Record<string, string>
}

export interface IncomingOptions {
  host?: string | string[]
  path?: string | string[]
  port?: number
  sourceService?: string
  challenges?: HttpChallenge[]
  caseSensitivePath?: boolean
}

export interface ServiceOptions extends Record<string, unknown> {
  baseUri?: string
  uri?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  queryParams?: Record<string, unknown>
  headers?: Headers
  incoming?: IncomingOptions
  responseFormat?: string
  timeout?: number
  authAsQuery?: boolean
  authInData?: boolean
  throttle?: {
    limit: number
    interval: number
  }
}

export interface HandlerCase {
  options: ConnectionIncomingOptions
  dispatch: Dispatch
  authenticate: AuthenticateExternal
}

export interface ConnectionIncomingOptions {
  host: string[]
  path: string[]
  port: number
  sourceService?: string
  challenges?: HttpChallenge[]
  caseSensitivePath?: boolean
}

export interface Connection extends Record<string, unknown> {
  status: string
  server?: http.Server
  incoming?: ConnectionIncomingOptions
  handlerCases?: Map<ConnectionIncomingOptions, HandlerCase>
  waitFn?: () => Promise<void>
}
