import http = require('http')

export interface IncomingOptions {
  host?: string | string[]
  path?: string | string[]
  port?: number
}

export interface EndpointOptions extends Record<string, unknown> {
  baseUri?: string
  uri?: string
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  queryParams?: Record<string, unknown>
  headers?: Record<string, string>
  incoming?: IncomingOptions
}

export interface Ident {
  id?: string
  root?: boolean
  withToken?: string
  roles?: string[]
  tokens?: string[]
}

export type Params = Record<string, unknown>

export interface Paging {
  next?: Payload
  prev?: Payload
}

export interface Payload<T = unknown> extends Record<string, unknown> {
  type?: string | string[]
  id?: string | string[]
  data?: T
  sourceService?: string
  targetService?: string
  service?: string // For backward compability, may be removed
  endpoint?: string
  page?: number
  pageSize?: number
  pageAfter?: string
  pageBefore?: string
  pageId?: string
}

export type Meta = Record<string, unknown>

export interface Payload<T = unknown> extends Record<string, unknown> {
  type?: string | string[]
  id?: string | string[]
  data?: T
  sourceService?: string
  targetService?: string
  params?: Params
  uri?: string
  method?: string
  headers?: Record<string, string>
  page?: number
  pageSize?: number
  pageAfter?: string
  pageBefore?: string
  pageId?: string
}

export interface ActionMeta extends Record<string, unknown> {
  id?: string
  ident?: Ident
  auth?: Record<string, unknown> | null
  options?: EndpointOptions
}

export interface Response<T = unknown> {
  status: string | null
  data?: T
  reason?: string
  error?: string
  warning?: string
  paging?: Paging
  params?: Params
  headers?: Record<string, string>
}

export interface Action<P extends Payload = Payload, ResponseData = unknown> {
  type: string
  payload: P
  response?: Response<ResponseData>
  meta?: ActionMeta
}

export interface ConnectionIncomingOptions {
  host: string[]
  path: string[]
  port: number
}

export interface Connection extends Record<string, unknown> {
  status: string
  server?: http.Server
  incoming?: ConnectionIncomingOptions
}

export interface Transporter {
  authentication: string | null
  prepareOptions: (options: EndpointOptions) => EndpointOptions
  connect: (
    options: EndpointOptions,
    authentication: Record<string, unknown> | null,
    connection: Connection | null
  ) => Promise<Connection | null>
  send: (action: Action, connection: Connection | null) => Promise<Response>
  listen?: (
    dispatch: Dispatch,
    connection: Connection | null
  ) => Promise<Response>
  disconnect: (connection: Connection | null) => Promise<void>
}

export interface Dispatch<T = unknown> {
  (action: Action | null): Promise<Response<T>>
}
