import test from 'ava'
import sinon from 'sinon'
import http from 'http'

import disconnect from './disconnect.js'

// Tests

test('should close server', async (t) => {
  const closeFn = sinon.stub()
  const server = { close: closeFn } as unknown as http.Server
  const connection = { status: 'ok', server }

  await disconnect(connection)

  t.is(closeFn.callCount, 1)
})

test('should not fail when server is closed twice', async (t) => {
  const server = http.createServer()
  const connection = { status: 'ok', server }

  await disconnect(connection)
  await t.notThrowsAsync(disconnect(connection))
})
