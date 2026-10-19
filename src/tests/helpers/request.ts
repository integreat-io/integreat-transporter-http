import http from 'http'

export interface RequestOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface TestResponse {
  statusCode?: number
  headers: http.IncomingHttpHeaders
  body: string
}

// We use a raw http request rather than an http client, as clients will
// normalize the url and headers, and we need to send invalid requests too.
export const sendRequest = (
  url: string,
  { method = 'GET', headers = {}, body }: RequestOptions = {},
) =>
  new Promise<TestResponse>((resolve, reject) => {
    const req = http.request(
      url,
      {
        method,
        headers: {
          ...headers,
          ...(body !== undefined && {
            'content-length': String(Buffer.byteLength(body)),
          }),
        },
        agent: false,
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => (data += chunk))
        res.on('end', () =>
          resolve({
            statusCode: res.statusCode,
            headers: res.headers,
            body: data,
          }),
        )
      },
    )
    req.on('error', reject)
    req.end(body)
  })
