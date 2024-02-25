import test from 'ava'
import sinon from 'sinon'
import http from 'http'
import type {
  Connection,
  ConnectionIncomingOptions,
  HandlerCase,
} from './types.js'

import disconnect from './disconnect.js'

// Tests

test('should stop listening when we are listening', async (t) => {
  const fn = sinon.stub()
  const closeFn = sinon.stub()
  const server = { close: closeFn } as unknown as http.Server
  const incomingOptions = {
    host: ['localhost'],
    path: ['/entries'],
    port: 9001,
  }
  const handlerCases = new Map<ConnectionIncomingOptions, HandlerCase>()
  const handlerCase = {
    options: incomingOptions,
    dispatch: fn,
    authenticate: fn,
  }
  handlerCases.set(incomingOptions, handlerCase)
  const connection: Connection = {
    status: 'ok',
    server,
    incoming: incomingOptions,
    handlerCases,
  }

  await disconnect(connection)

  t.is(handlerCases.size, 0)
  t.is(closeFn.callCount, 1)
})

test('should do nothing when we are not listening', async (t) => {
  const closeFn = sinon.stub()
  const server = { close: closeFn } as unknown as http.Server
  const connection = { status: 'ok', server }

  await disconnect(connection)

  t.is(closeFn.callCount, 0)
})

test('should not fail when server is closed twice', async (t) => {
  const server = http.createServer()
  const connection = { status: 'ok', server }

  await disconnect(connection)
  await t.notThrowsAsync(disconnect(connection))
})
