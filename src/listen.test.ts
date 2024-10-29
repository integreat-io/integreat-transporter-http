import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import http from 'http'
import got from 'got'
import type { Action, Headers } from 'integreat'
import type { Connection, HandlerCase } from './types.js'

import listen from './listen.js'

// Setup

const options = {
  method: 'GET' as const,
  headers: { 'Content-Type': 'application/json' },
  throwHttpErrors: false,
  retry: { limit: 0 },
}

const authenticate = async () => ({
  status: 'ok',
  access: { ident: { id: 'userFromIntegreat' } },
})

const stripIrrelevantHeaders = ({
  connection,
  ['accept-encoding']: _ae,
  ['user-agent']: _ua,
  ...headers
}: Headers) => headers

const stripIrrelevantHeadersFromAction = (action: Action) => ({
  ...action,
  payload: {
    ...action.payload,
    headers: stripIrrelevantHeaders(action.payload.headers || {}),
  },
})

const removeIdentAndSourceService = ({
  type,
  payload: { sourceService, ...payload },
  meta: { ident, ...meta } = {},
}: Action) => ({
  type,
  payload,
  meta,
})

const portHandlers = new Map<number, Set<HandlerCase>>()

// Tests

test('should return ok on listen and set handler cases on connection', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const connection: Connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9001 },
  }
  t.after(() => {
    connection.server?.close()
  })

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 0) // No dispatching without requests
  assert(connection.handlerCase, 'Should have a handler case')
})

test('should dispatch GET request as GET action and respond with response', async (t) => {
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: responseData })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9002,
      sourceService: 'mainApi',
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9002/entries?filter=all&format=json'
  const expectedRawAction = {
    type: 'GET',
    payload: {
      method: 'GET',
      hostname: 'localhost',
      port: 9002,
      path: '/entries',
      queryParams: {
        filter: 'all',
        format: 'json',
      },
      contentType: 'application/json',
      headers: {
        'content-type': 'application/json',
        host: 'localhost:9002',
      },
    },
    meta: {},
  }
  const expectedAction = {
    ...expectedRawAction,
    payload: {
      ...expectedRawAction.payload,
      sourceService: 'mainApi',
    },
    meta: { ident: { id: 'userFromIntegreat' } },
  }
  const expectedAuthentication = { status: 'granted' }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(authenticate.callCount, 1)
  assert.deepEqual(authenticate.args[0][0], expectedAuthentication)
  assert.deepEqual(
    stripIrrelevantHeadersFromAction(authenticate.args[0][1]),
    expectedRawAction,
  )
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(
    stripIrrelevantHeadersFromAction(dispatch.args[0][0]),
    expectedAction,
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData)
})

test('should dispatch POST request as SET action', async (t) => {
  const requestData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: null })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9003 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9003/entries'
  const options = {
    method: 'POST' as const,
    headers: { 'Content-Type': 'application/json' },
    body: requestData,
  }
  const expectedAction = {
    type: 'SET',
    payload: {
      data: requestData,
      method: 'POST',
      hostname: 'localhost',
      port: 9003,
      path: '/entries',
      queryParams: {},
      contentType: 'application/json',
      headers: {
        'content-type': 'application/json',
        'content-length': '15',
        host: 'localhost:9003',
      },
    },
    meta: { ident: { id: 'userFromIntegreat' } },
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(
    stripIrrelevantHeadersFromAction(dispatch.args[0][0]),
    expectedAction,
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, '')
})

test('should dispatch PUT request as SET action', async (t) => {
  const requestData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: requestData })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9004 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9004/entries'
  const options = {
    method: 'PUT' as const,
    headers: { 'Content-Type': 'application/json' },
    body: requestData,
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  const dispatchedAction = dispatch.args[0][0]
  assert.equal(dispatchedAction.type, 'SET')
  assert.equal(dispatchedAction.payload.method, 'PUT')
})

test('should dispatch OPTIONS request as GET action', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: null })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9025 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9025/entries'
  const options = {
    method: 'OPTIONS' as const,
  }
  const expectedAction = {
    type: 'GET',
    payload: {
      method: 'OPTIONS',
      hostname: 'localhost',
      port: 9025,
      path: '/entries',
      queryParams: {},
      contentType: undefined,
      headers: {
        host: 'localhost:9025',
      },
    },
    meta: { ident: { id: 'userFromIntegreat' } },
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(
    stripIrrelevantHeadersFromAction(dispatch.args[0][0]),
    expectedAction,
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
})

test('should match the most specific path before a less specific', async (t) => {
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: responseData })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const server = http.createServer()
  t.after(() => {
    server.close()
  })
  const connection0 = {
    status: 'ok',
    server,
    incoming: {
      host: ['localhost'],
      path: ['/'],
      port: 9037,
      sourceService: 'wrongApi',
    },
  }
  const connection1 = {
    status: 'ok',
    server,
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9037,
      sourceService: 'mainApi',
    },
  }
  const url = 'http://localhost:9037/entries?filter=all&format=json'

  const ret0 = await listen(portHandlers)(dispatch, connection0, authenticate)
  const ret1 = await listen(portHandlers)(dispatch, connection1, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret0, { status: 'ok' })
  assert.deepEqual(ret1, { status: 'ok' })
  assert.equal(dispatch.callCount, 1, `Dispatched ${dispatch.callCount} times`)
  const dispatchedAction = dispatch.args[0][0]
  assert.equal(dispatchedAction.payload.sourceService, 'mainApi')
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData)
})

test('should match to a hostname over non-hostname', async (t) => {
  const port = 9038
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: responseData })
  const authenticate = sinon
    .stub()
    .resolves({ status: 'ok', access: { ident: { id: 'userFromIntegreat' } } })
  const server = http.createServer()
  t.after(() => {
    server.close()
  })
  const connection0 = {
    status: 'ok',
    server,
    incoming: {
      host: [],
      path: ['/'],
      port,
      sourceService: 'wrongApi',
    },
  }
  const connection1 = {
    status: 'ok',
    server,
    incoming: {
      host: ['localhost'],
      path: ['/'],
      port,
      sourceService: 'mainApi',
    },
  }
  const url = `http://localhost:${port}`

  const ret0 = await listen(portHandlers)(dispatch, connection0, authenticate)
  const ret1 = await listen(portHandlers)(dispatch, connection1, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret0, { status: 'ok' })
  assert.deepEqual(ret1, { status: 'ok' })
  assert.equal(dispatch.callCount, 1, `Dispatched ${dispatch.callCount} times`)
  const dispatchedAction = dispatch.args[0][0]
  assert.equal(dispatchedAction.payload.sourceService, 'mainApi')
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData)
})

test('should lowercase host and path in dispatched action', async (t) => {
  // Note: This test does not really check that we lowercast the host and path,
  // as Got will do it for us anyway. See next test for the real verification.
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: responseData })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { port: 9030, host: [], path: [] },
  }
  t.after(() => connection.server.close())
  const url = 'http://LOCALHOST:9030/Entries?filter=all&format=json'
  const options = { headers: { 'Content-Type': 'application/json' } }
  const expectedAction = {
    type: 'GET',
    payload: {
      method: 'GET',
      hostname: 'localhost',
      port: 9030,
      path: '/entries',
      queryParams: {
        filter: 'all',
        format: 'json',
      },
      contentType: 'application/json',
      headers: {
        'content-type': 'application/json',
        host: 'localhost:9030',
      },
    },
    meta: { ident: { id: 'userFromIntegreat' } },
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(
    stripIrrelevantHeadersFromAction(dispatch.args[0][0]),
    expectedAction,
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData)
})

test('should not lowercase path when caseSensitivePath is true', async (t) => {
  // Note: This test does not really check that we lowercast the host and path,
  // as Got will do it for us anyway. See next test for the real verification.
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: responseData })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { port: 9036, host: [], path: [], caseSensitivePath: true },
  }
  t.after(() => connection.server.close())
  const url = 'http://LOCALHOST:9036/Entries?filter=all&format=json'
  const options = { headers: { 'Content-Type': 'application/json' } }
  const expectedAction = {
    type: 'GET',
    payload: {
      method: 'GET',
      hostname: 'localhost',
      port: 9036,
      path: '/Entries',
      queryParams: {
        filter: 'all',
        format: 'json',
      },
      contentType: 'application/json',
      headers: {
        'content-type': 'application/json',
        host: 'localhost:9036',
      },
    },
    meta: { ident: { id: 'userFromIntegreat' } },
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(
    stripIrrelevantHeadersFromAction(dispatch.args[0][0]),
    expectedAction,
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData)
})

test('should dispatch other content-type', async (t) => {
  const requestData = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SomeWeirdSoapAction />
  </soap:Body>
</soap:Envelope>
`
  const responseData = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    <SomeWeirdSoapActionResponse />
  </soap:Body>
</soap:Envelope>`
  const dispatch = sinon.stub().resolves({
    status: 'ok',
    data: responseData,
    headers: {
      'content-type': 'text/xml;charset=utf-8',
    },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/soap11'], port: 9005 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9005/soap11'
  const options = {
    method: 'POST' as const,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: 'http://api.net/SomeWeirdSoapAction',
    },
    body: requestData,
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  const dispatchedAction = dispatch.args[0][0]
  assert.equal(dispatchedAction.type, 'SET')
  assert.equal(dispatchedAction.payload.method, 'POST')
  assert.equal(dispatchedAction.payload.contentType, 'text/xml')
  assert.equal(
    dispatchedAction.payload.headers['content-type'],
    'text/xml; charset=utf-8',
  )
  assert.equal(
    dispatchedAction.payload.headers.soapaction,
    'http://api.net/SomeWeirdSoapAction',
  )
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'text/xml;charset=utf-8')
  assert.equal(response.body, responseData)
})

test('should stringify response data', async (t) => {
  const responseData = [{ id: 'ent1' }, { id: 'ent2' }]
  const dispatch = sinon.stub().resolves({
    status: 'ok',
    data: responseData,
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9006 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9006/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, JSON.stringify(responseData))
})

test('should respond with response headers', async (t) => {
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({
    status: 'ok',
    data: responseData,
    headers: { 'X-SPECIAL': 'We are' },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9026 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9026/entries?filter=all&format=json'
  const options = {
    headers: { 'Content-Type': 'application/json' },
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['x-special'], 'We are')
})

test('should skip response headers with value undefined', async (t) => {
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({
    status: 'ok',
    data: responseData,
    headers: {
      'X-SPECIAL': 'We are',
      'Access-Control-Allow-Origin': undefined,
    },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9028 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9028/entries'
  const options = { retry: { limit: 0 }, throwHttpErrors: false }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 200)
  assert(!response.headers.hasOwnProperty('access-control-allow-origin'))
})

test('should use content type from response headers', async (t) => {
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({
    status: 'ok',
    data: responseData,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9027 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9027/entries?filter=all&format=json'
  const options = {}

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(
    response.headers['content-type'],
    'application/x-www-form-urlencoded',
  )
})

test.todo('should remove response headers with value undefined')

test('should call authenticate with authentication and action', async (t) => {
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon.stub().resolves({ status: 'ok', data: responseData })
  const authenticate = sinon.stub().resolves({
    status: 'ok',
    access: { ident: { id: 'johnf' } },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9035,
      sourceService: 'mainApi',
      challenges: [
        {
          scheme: 'Basic',
          realm: 'Our wonderful API',
          params: { charset: 'UTF-8' },
        },
      ],
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9035/entries?filter=all&format=json'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  const dispatchedAction = dispatch.args[0][0]
  assert.equal(authenticate.callCount, 1)
  assert.deepEqual(authenticate.args[0][0], { status: 'granted' })
  assert.deepEqual(
    authenticate.args[0][1],
    removeIdentAndSourceService(dispatchedAction),
  )
  assert.equal(response.statusCode, 200)
})

test('should respond with 201 on queued', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'queued',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9012 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9012/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 201)
})

test('should respond with 500 on error', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'error',
    error: 'What just happened?',
    data: { error: 'Everything is under control' },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9007 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9007/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 500)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(
    response.body,
    JSON.stringify({ error: 'Everything is under control' }),
  )
})

test('should respond with 400 on badrequest', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'badrequest',
    error: 'Please read the documentation',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9008 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9008/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 400)
})

test('should respond with 401 on autherror', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'autherror',
    error: 'Invalid credentials',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9024 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9024/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 401)
})

test('should respond with 403 on noaccess', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'noaccess',
    error: 'Above your paygrade',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9009 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9009/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 403)
})

test('should respond with 403 when authentication with Integreat fails', async (t) => {
  const authResponse = { status: 'noaccess', error: 'Not set up right' }
  const responseData = JSON.stringify([{ id: 'ent1' }])
  const dispatch = sinon
    .stub()
    .resolves({ ...authResponse, data: responseData })
  const authenticate = sinon.stub().resolves(authResponse)
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9031,
      sourceService: 'mainApi',
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9031/entries?filter=all&format=json'
  const expectedBody = responseData

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(authenticate.callCount, 1)
  assert.equal(response.statusCode, 403)
  assert.deepEqual(response.body, expectedBody)
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(dispatch.args[0][0].response, authResponse)
})

test('should respond with 401 when authentication with Integreat returns noaccess and reason noauth', async (t) => {
  const authResponse = {
    status: 'noaccess',
    reason: 'noauth',
    error: 'No auth info provided',
  }
  const dispatch = sinon.stub().resolves(authResponse)
  const authenticate = sinon.stub().resolves(authResponse)
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9032,
      sourceService: 'mainApi',
      challenges: [
        {
          scheme: 'Basic',
          realm: 'Our wonderful API',
          params: { charset: 'UTF-8' },
        },
      ],
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9032/entries?filter=all&format=json'
  const expectedHeader = 'Basic realm="Our wonderful API", charset="UTF-8"'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.equal(authenticate.callCount, 1)
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.headers['www-authenticate'], expectedHeader)
  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(dispatch.args[0][0].response, authResponse)
})

test('should respond with 401 when a regular response has noaccess and reason noauth', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'noaccess',
    reason: 'noauth',
    error: 'Auth invalidated in mutation',
  })
  const authenticate = sinon.stub().resolves({
    status: 'ok',
    access: { ident: { id: 'userFromIntegreat' } },
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9033,
      sourceService: 'mainApi',
      challenges: [
        {
          scheme: 'Basic',
          realm: 'Our wonderful API',
          params: { charset: 'UTF-8' },
        },
      ],
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9033/entries?filter=all&format=json'
  const expectedHeader = 'Basic realm="Our wonderful API", charset="UTF-8"'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.equal(authenticate.callCount, 1)
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.headers['www-authenticate'], expectedHeader)
  assert.deepEqual(ret, { status: 'ok' })
})

test('should respond with 403 when authentication with Integreat returns autherror and reason invalidauth', async (t) => {
  const authResponse = {
    status: 'noaccess',
    reason: 'noauth',
    error: 'No auth info provided',
  }
  const dispatch = sinon.stub().resolves(authResponse)
  const authenticate = sinon.stub().resolves(authResponse)
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/entries'],
      port: 9034,
      sourceService: 'mainApi',
      challenges: [
        {
          scheme: 'Basic',
          realm: 'Our wonderful API',
          params: { charset: 'UTF-8' },
        },
      ],
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9034/entries?filter=all&format=json'
  const expectedHeader = 'Basic realm="Our wonderful API", charset="UTF-8"'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.equal(authenticate.callCount, 1)
  assert.equal(response.statusCode, 401)
  assert.deepEqual(response.headers['www-authenticate'], expectedHeader)
  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.deepEqual(dispatch.args[0][0].response, authResponse)
})

test('should respond with 404 on notfound', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'notfound',
    error: 'Where is it?',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9010 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9010/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 404)
})

test('should respond with 200 on noaction', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'noaction',
    error: 'Not supported',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9013 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9013/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 200)
})

test('should respond with 408 on timeout', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'timeout',
    error: 'Too slow',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9011 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9011/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 408)
})

test('should respond with 429 on toomany', async (t) => {
  const dispatch = sinon.stub().resolves({
    status: 'toomany',
    error: 'Please wait a bit ...',
  })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9039 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9039/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 429)
})

test('should return with status badrequest when no connection', async () => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const connection = null

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)

  assert.deepEqual(ret, {
    status: 'badrequest',
    error: 'Cannot listen to server. No connection',
  })
})

test('should return 404 when path pattern does not match', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9014 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9014/unknown'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 0)
  assert.equal(response.statusCode, 404)
  assert(!response.headers['content-type'])
})

test('should accept url with different casing than path pattern', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9029 },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9029/Entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 1)
  assert.equal(response.statusCode, 200)
})

test('should return 404 when host pattern does not match', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['shining.api', 'newest.api'],
      path: ['/entries'],
      port: 9015,
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9015/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(dispatch.callCount, 0)
  assert.equal(response.statusCode, 404)
  assert(!response.headers['content-type'])
})

test('should dispatch when path pattern is root', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: ['/'],
      port: 9016,
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9016/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(response.statusCode, 200)
  assert.equal(dispatch.callCount, 1)
})

test('should dispatch when no path pattern', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: ['localhost'],
      path: [],
      port: 9017,
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9017/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(response.statusCode, 200)
  assert.equal(dispatch.callCount, 1)
})

test('should dispatch when no host pattern', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: '[]' })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: {
      host: [],
      path: ['/entries'],
      port: 9018,
    },
  }
  t.after(() => connection.server.close())
  const url = 'http://localhost:9018/entries'

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret, { status: 'ok' })
  assert.equal(response.statusCode, 200)
  assert.equal(dispatch.callCount, 1)
})

test('should dispatch to matching service', async () => {
  const responseData0 = JSON.stringify([{ id: 'ent1' }])
  const responseData1 = JSON.stringify([{ id: 'ent2' }])
  const dispatch0 = sinon.stub().resolves({ status: 'ok', data: responseData0 })
  const dispatch1 = sinon.stub().resolves({ status: 'ok', data: responseData1 })
  const server = http.createServer()
  const connection0 = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9019 },
  }
  const connection1 = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/accounts'], port: 9019 },
  }
  const url = 'http://localhost:9019/accounts'

  const ret0 = await listen(portHandlers)(dispatch0, connection0, authenticate)
  const ret1 = await listen(portHandlers)(dispatch1, connection1, authenticate)
  const response = await got(url, options)

  assert.deepEqual(ret0, { status: 'ok' })
  assert.deepEqual(ret1, { status: 'ok' })
  assert.equal(dispatch0.callCount, 0)
  assert.equal(dispatch1.callCount, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData1)

  server.close()
})

test('should keep port setups seperate', async (t) => {
  const responseData0 = JSON.stringify([{ id: 'ent1' }])
  const responseData1 = JSON.stringify([{ id: 'ent2' }])
  const dispatch0 = sinon.stub().resolves({ status: 'ok', data: responseData0 })
  const dispatch1 = sinon.stub().resolves({ status: 'ok', data: responseData1 })
  const server0 = http.createServer()
  const server1 = http.createServer()
  t.after(() => {
    server0.close()
    server1.close()
  })
  const connection0 = {
    status: 'ok',
    server: server0,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9020 },
  }
  const connection1 = {
    status: 'ok',
    server: server1,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9021 },
  }
  const url = 'http://localhost:9021/entries'

  const ret0 = await listen(portHandlers)(dispatch0, connection0, authenticate)
  assert.equal(server0.listening, true)
  const ret1 = await listen(portHandlers)(dispatch1, connection1, authenticate)
  assert.equal(server1.listening, true)
  const response = await got(url, options)

  assert.deepEqual(ret0, { status: 'ok' })
  assert.deepEqual(ret1, { status: 'ok' })
  assert.equal(dispatch0.callCount, 0)
  assert.equal(dispatch1.callCount, 1)
  assert.equal(response.statusCode, 200)
  assert.equal(response.headers['content-type'], 'application/json')
  assert.equal(response.body, responseData1)
})

test('should return error from server.listen()', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9022 },
  }
  t.after(() => {
    connection.server.close()
  })
  sinon
    .stub(connection.server, 'listen')
    .throws(new Error('Something went terribly wrong'))

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)

  assert.deepEqual(ret, {
    status: 'error',
    error:
      'Cannot listen to server on port 9022. Error: Something went terribly wrong',
  })
  assert.equal(dispatch.callCount, 0)
})

test('should return error when server fails', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'], port: 9023 },
  }
  const otherServer = http.createServer()
  t.after(() => {
    otherServer.close()
    connection.server.close()
  })

  otherServer.listen(9023)
  const ret = await listen(portHandlers)(dispatch, connection, authenticate)

  assert.deepEqual(ret, {
    status: 'error',
    error:
      'Cannot listen to server on port 9023. Error: listen EADDRINUSE: address already in use :::9023',
  })
  assert.equal(dispatch.callCount, 0) // No dispatching without requests
})

test('should return with status badrequest when incoming has no port', async (t) => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const connection = {
    status: 'ok',
    server: http.createServer(),
    incoming: { host: ['localhost'], path: ['/entries'] }, // No `port`
  }
  t.after(() => connection.server.close())

  const ret = await listen(portHandlers)(
    dispatch,
    connection as Connection,
    authenticate,
  )

  assert.deepEqual(ret, {
    status: 'badrequest',
    error: 'Cannot listen to server. No port set on incoming options',
  })
})

test('should return with status badrequest when connection has no server', async () => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const connection = {
    status: 'ok',
    server: undefined,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9000 },
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)

  assert.deepEqual(ret, {
    status: 'badrequest',
    error: 'Cannot listen to server. No server set on connection',
  })
})

test('should return with status noaction when connection has no incomming', async () => {
  const dispatch = sinon.stub().resolves({ status: 'ok', data: [] })
  const connection = {
    status: 'ok',
    server: undefined,
    incoming: undefined,
  }

  const ret = await listen(portHandlers)(dispatch, connection, authenticate)

  assert.deepEqual(ret, {
    status: 'noaction',
    error: 'Service not configured for listening',
  })
})
