import test from 'node:test'
import assert from 'node:assert/strict'
import sinon from 'sinon'
import http from 'http'
import { spyCountMessage } from './tests/helpers/messages.js'
import type {
  Connection,
  ConnectionIncomingOptions,
  HandlerCase,
} from './types.js'

import disconnect from './disconnect.js'

// Setup

const port = 9001
const incomingOptions = {
  host: ['localhost'],
  path: ['/entries'],
  port,
}

const fn = sinon.stub()

const createHandlerCase = (
  options: ConnectionIncomingOptions,
): HandlerCase => ({
  options,
  dispatch: fn,
  authenticate: fn,
})

// Tests

test('should stop listening when we are listening', async () => {
  const closeFn = sinon.stub()
  const removeAllListeners = sinon.stub()
  const closeIdleConnections = sinon.stub()
  const server = {
    close: closeFn,
    removeAllListeners,
    closeIdleConnections,
  } as unknown as http.Server
  const handlerCase = createHandlerCase(incomingOptions)
  const handlerCases = new Set<HandlerCase>()
  const portHandlers = new Map<number, Set<HandlerCase>>()
  portHandlers.set(port, handlerCases)
  handlerCases.add(handlerCase)
  const connection: Connection = {
    status: 'ok',
    server,
    incoming: incomingOptions,
    handlerCase,
  }

  await disconnect(portHandlers)(connection)

  assert.equal(handlerCases.size, 0)
  assert.equal(
    removeAllListeners.callCount,
    1,
    spyCountMessage(removeAllListeners, 'removeAllListeners'),
  )
  assert.equal(
    closeIdleConnections.callCount,
    1,
    spyCountMessage(closeIdleConnections, 'closeIdleConnections'),
  )
  assert.equal(closeFn.callCount, 1, spyCountMessage(closeFn, 'close'))
})

test('should not close server when there are other handlers', async () => {
  const removeAllListeners = sinon.stub()
  const closeFn = sinon.stub()
  const closeIdleConnections = sinon.stub()
  const server = {
    close: closeFn,
    closeIdleConnections,
    removeAllListeners,
  } as unknown as http.Server
  const otherIncomingOptions = {
    host: ['localhost'],
    path: ['/other'],
    port,
  }
  const handlerCase0 = createHandlerCase(incomingOptions)
  const handlerCase1 = createHandlerCase(otherIncomingOptions)
  const handlerCases = new Set<HandlerCase>()
  handlerCases.add(handlerCase0)
  handlerCases.add(handlerCase1)
  const portHandlers = new Map<number, Set<HandlerCase>>()
  portHandlers.set(port, handlerCases)
  const connection = {
    status: 'ok',
    server,
    incoming: incomingOptions,
    handlerCase: handlerCase0,
  }

  await disconnect(portHandlers)(connection)

  assert.equal(handlerCases.size, 1, `We have ${handlerCases.size} handlers`)
  assert.equal(
    removeAllListeners.callCount,
    0,
    spyCountMessage(removeAllListeners, 'removeAllListeners'),
  )
  assert.equal(
    closeIdleConnections.callCount,
    0,
    spyCountMessage(closeIdleConnections, 'closeIdleConnections'),
  )
  assert.equal(closeFn.callCount, 0, spyCountMessage(closeFn, 'close'))
})

test('should disconnect when we are not listening', async () => {
  const removeAllListeners = sinon.stub()
  const closeFn = sinon.stub()
  const closeIdleConnections = sinon.stub()
  const server = {
    close: closeFn,
    closeIdleConnections,
    removeAllListeners,
  } as unknown as http.Server
  const connection = {
    status: 'ok',
    server,
    // No incoming or handlerCase
  }
  const portHandlers = new Map<number, Set<HandlerCase>>()

  await disconnect(portHandlers)(connection)

  assert.equal(
    removeAllListeners.callCount,
    1,
    spyCountMessage(removeAllListeners, 'removeAllListeners'),
  )
  assert.equal(
    closeIdleConnections.callCount,
    1,
    spyCountMessage(closeIdleConnections, 'closeIdleConnections'),
  )
  assert.equal(closeFn.callCount, 1, spyCountMessage(closeFn, 'close'))
})

test('should not fail when server is closed twice', async () => {
  const server = http.createServer()
  const connection = { status: 'ok', server }
  const portHandlers = new Map<number, Set<HandlerCase>>()

  await disconnect(portHandlers)(connection)
  await assert.doesNotReject(disconnect(portHandlers)(connection))
})
