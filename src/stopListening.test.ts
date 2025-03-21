import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import http from 'http'
import got from 'got'
import listen from './listen.js'
import type { Connection, HandlerCase } from './types.js'

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

const portHandlers = new Map<number, Set<HandlerCase>>()

// Tests

test('should stop listening', async (t) => {
  const port = 9040
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const server = http.createServer()
  t.after(() => {
    server.close()
  })
  const closeSpy = sinon.spy(server, 'close')
  const connection0: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/entries'], port },
  }
  const connection1: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/users'], port },
  }
  const url = 'http://localhost:9040/entries?filter=all&format=json'

  const startRet0 = await listen(portHandlers)(
    dispatch,
    connection0,
    authenticate,
  )
  const startRet1 = await listen(portHandlers)(
    dispatch,
    connection1,
    authenticate,
  )
  const handlerCases = portHandlers.get(port)
  const stopRet0 = await stopListening(portHandlers)(connection0)
  const caseCount0 = handlerCases?.size
  const response = await got(url, options)
  const stopRet1 = await stopListening(portHandlers)(connection1)
  const caseCount1 = handlerCases?.size

  assert.equal(caseCount0, 1) // Was one case left after first stopListening()
  assert.equal(caseCount1, 0) // No cases left after second stopListening()
  assert.equal(response.statusCode, 404, response.body) // We get 404 as we're not listening anymore
  assert.deepEqual(stopRet0, { status: 'ok' })
  assert.deepEqual(stopRet1, { status: 'ok' })
  assert.deepEqual(startRet0, { status: 'ok' })
  assert.deepEqual(startRet1, { status: 'ok' })
  assert.equal(dispatch.callCount, 0) // No dispatching, as we stopped listening before request
  assert.equal(closeSpy.callCount, 0) // We don't close the server here
})

test('should stop listening and start again with new connection', async (t) => {
  const port = 9041
  const dispatch = sinon
    .stub()
    .resolves({ status: 'ok', data: JSON.stringify([{ id: 'ent1' }]) })
  const server = http.createServer()
  t.after(() => {
    server.close()
  })
  const connection0: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/changing'], port },
  }
  const connection1: Connection = {
    status: 'ok',
    server,
    incoming: { host: ['localhost'], path: ['/changing'], port },
  }
  const url = 'http://localhost:9041/changing'

  const startRet0 = await listen(portHandlers)(
    dispatch,
    connection0,
    authenticate,
  )
  const handlerCases = portHandlers.get(port)
  const response0 = await got(url, options)
  const stopRet0 = await stopListening(portHandlers)(connection0)
  const caseCount0 = handlerCases?.size
  const response1 = await got(url, options)
  const startRet1 = await listen(portHandlers)(
    dispatch,
    connection1,
    authenticate,
  )
  const caseCount1 = handlerCases?.size
  const response2 = await got(url, options)
  const stopRet1 = await stopListening(portHandlers)(connection1)

  assert.equal(caseCount0, 0, `First case count was ${caseCount0}`)
  assert.equal(caseCount1, 1, `Second case count was ${caseCount1}`)
  assert.equal(
    response0.statusCode,
    200,
    `Should respond with 200, responded with ${response0.statusCode} ${response0.body}`,
  )
  assert.equal(
    response1.statusCode,
    404,
    `Should respond with 404, responded with ${response1.statusCode} ${response1.body}`,
  )
  assert.equal(
    response2.statusCode,
    200,
    `Should respond with 200, responded with ${response2.statusCode} ${response2.body}`,
  )
  assert.deepEqual(stopRet0, { status: 'ok' })
  assert.deepEqual(stopRet1, { status: 'ok' })
  assert.deepEqual(startRet0, { status: 'ok' })
  assert.deepEqual(startRet1, { status: 'ok' })
  assert.equal(
    dispatch.callCount,
    2,
    `Called dispatch() ${dispatch.callCount} times`,
  )
})

test('should return badrequest when no connection', async () => {
  const connection = null
  const expectedResponse = { status: 'badrequest', error: 'No connection' }

  const ret = await stopListening(portHandlers)(connection)

  assert.deepEqual(ret, expectedResponse)
})

test('should return noaction when connection has no handler cases', async () => {
  const port = 9042
  const dispatch = sinon.stub().resolves({ status: 'ok' })
  const connection: Connection = {
    status: 'ok',
    // We don't need a server for this test
    handlerCase: {
      options: { host: ['localhost'], path: ['/entries'], port },
      dispatch,
      authenticate,
    },
  }
  // We don't set handler cases set on `portHandlers` for this port
  const expectedResponse = {
    status: 'noaction',
    warning: 'No incoming handler cases found for this connection',
  }

  const ret = await stopListening(portHandlers)(connection)

  assert.deepEqual(ret, expectedResponse)
})

test('should return noaction when connection has no handler case', async () => {
  const port = 9043
  const connection: Connection = {
    status: 'ok',
    // We don't need a server for this test
    // No handler case
    incoming: { host: ['localhost'], path: ['/entries'], port },
  }
  portHandlers.set(port, new Set<HandlerCase>())
  const expectedResponse = {
    status: 'noaction',
    warning: 'No incoming handler found for this connection',
  }

  const ret = await stopListening(portHandlers)(connection)

  assert.deepEqual(ret, expectedResponse)
})
