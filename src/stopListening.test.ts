import test from 'ava'
import sinon from 'sinon'
import http from 'http'
import got from 'got'
import listen from './listen.js'
import type { Connection } from './types.js'

import stopListening from './stopListening.js'

// Setup

const authenticate = async () => ({
  status: 'ok',
  access: { ident: { id: 'userFromIntegreat' } },
})

const options = {
  method: 'GET' as const,
  headers: { 'Content-Type': 'application/json' },
  throwHttpErrors: false,
  retry: { limit: 0 },
}

// Tests

test('should stop listening', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const server = http.createServer()
  const closeSpy = sinon.spy(server, 'close')
  const connection0: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9040 },
  }
  const connection1: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/users'], port: 9040 },
  }
  const url = 'http://localhost:9040/entries?filter=all&format=json'

  const startRet0 = await listen(dispatch, connection0, authenticate)
  const startRet1 = await listen(dispatch, connection1, authenticate)
  const stopRet = await stopListening(connection0)
  const response = await got(url, options)

  t.is(response.statusCode, 404, response.body) // We get 404 as we're not listening anymore
  t.deepEqual(stopRet, { status: 'ok' })
  t.deepEqual(startRet0, { status: 'ok' })
  t.deepEqual(startRet1, { status: 'ok' })
  t.is(closeSpy.callCount, 0) // Don't close connection, as we have two listeners
  t.is(dispatch.callCount, 0) // No dispatching, as we stopped listening before request

  server.close()
})

test('should close server when the last listener is stopped', async (t) => {
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const server = http.createServer()
  const closeSpy = sinon.spy(server, 'close')
  const connection0: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9041 },
  }
  const connection1: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/users'], port: 9041 },
  }

  const startRet0 = await listen(dispatch, connection0, authenticate)
  const startRet1 = await listen(dispatch, connection1, authenticate)
  const stopRet0 = await stopListening(connection0)
  const stopRet1 = await stopListening(connection1)

  t.is(closeSpy.callCount, 1) // Should close connection, as we have stopped all listerens
  t.deepEqual(stopRet0, { status: 'ok' })
  t.deepEqual(stopRet1, { status: 'ok' })
  t.deepEqual(startRet0, { status: 'ok' })
  t.deepEqual(startRet1, { status: 'ok' })

  server.close()
})

test('should close server when no handlers', async (t) => {
  const server = http.createServer()
  const closeSpy = sinon.spy(server, 'close')
  const connection: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/entries'], port: 9041 },
    // No `handlerCases`
  }

  const ret = await stopListening(connection)

  t.is(closeSpy.callCount, 1) // Should close connection, as we have stopped all listerens
  t.deepEqual(ret, { status: 'ok' })

  server.close()
})

test('should return badrequest when no connection', async (t) => {
  const connection = null
  const expectedResponse = { status: 'badrequest', error: 'No connection' }

  const ret = await stopListening(connection)

  t.deepEqual(ret, expectedResponse)
})

test('should return noaction when connection has no handler cases map', async (t) => {
  const connection: Connection = {
    status: 'ok',
    // We don't need a server for this test
    incoming: { host: ['localhost'], path: ['/entries'], port: 9040 },
    // No handlerCases
  }
  const expectedResponse = {
    status: 'noaction',
    warning: 'No incoming handler cases found on connection',
  }

  const ret = await stopListening(connection)

  t.deepEqual(ret, expectedResponse)
})

test('should return noaction when connection has no incoming options', async (t) => {
  const connection: Connection = {
    status: 'ok',
    // We don't need a server for this test
    // No incoming options
    handlerCases: new Map(),
  }
  const expectedResponse = {
    status: 'noaction',
    warning: 'No incoming options found on connection',
  }

  const ret = await stopListening(connection)

  t.deepEqual(ret, expectedResponse)
})
