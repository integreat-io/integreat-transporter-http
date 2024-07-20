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

const incomingOptions = {
  host: ['localhost'],
  path: ['/entries'],
  port: 9001,
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
  const handlerCases = new Map<ConnectionIncomingOptions, HandlerCase>()
  handlerCases.set(incomingOptions, createHandlerCase(incomingOptions))
  const connection: Connection = {
    status: 'ok',
    server,
    incoming: incomingOptions,
    handlerCases,
  }

  await disconnect(connection)

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
    port: 9001,
  }
  const handlerCases = new Map<ConnectionIncomingOptions, HandlerCase>()
  handlerCases.set(incomingOptions, createHandlerCase(incomingOptions))
  handlerCases.set(
    otherIncomingOptions,
    createHandlerCase(otherIncomingOptions),
  )
  const connection = {
    status: 'ok',
    server,
    incoming: incomingOptions,
    handlerCases,
  }

  await disconnect(connection)

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
    // No incoming or handlerCases
  }

  await disconnect(connection)

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

  await disconnect(connection)
  await assert.doesNotReject(disconnect(connection))
})
