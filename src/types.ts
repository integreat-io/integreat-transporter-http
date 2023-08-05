import type http from 'http'
import type { Headers } from 'integreat'

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
}

export interface ConnectionIncomingOptions {
  host: string[]
  path: string[]
  port: number
  sourceService?: string
  challenges?: HttpChallenge[]
}

export interface Connection extends Record<string, unknown> {
  status: string
  server?: http.Server
  incoming?: ConnectionIncomingOptions
}
