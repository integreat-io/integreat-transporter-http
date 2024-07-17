import test from 'node:test'
import assert from 'node:assert/strict'

import transporter from './index.js'

// Setup

const emit = () => undefined
const serviceId = 'http'

// Tests

test('should be a transporter', () => {
  assert.equal(typeof transporter.authentication, 'string')
  assert.equal(typeof transporter.prepareOptions, 'function')
  assert.equal(typeof transporter.connect, 'function')
  assert.equal(typeof transporter.send, 'function')
  assert.equal(typeof transporter.listen, 'function')
  assert.equal(typeof transporter.stopListening, 'function')
  assert.equal(typeof transporter.disconnect, 'function')
})

test('should have authentication string', () => {
  assert.equal(transporter.authentication, 'asHttpHeaders')
})

test('connect should return connection object', async () => {
  const connection = { status: 'ok' }

  const ret = await transporter.connect({}, {}, connection, emit)

  assert.deepEqual(ret, connection)
})

test('should do nothing when callling disconnect', async () => {
  const ret = await transporter.disconnect(null)

  assert.equal(ret, undefined)
})

// Tests -- prepareOptions

test('should return options object', () => {
  const options = {
    uri: 'http://example.com/',
    headers: {
      'If-Match': '3-871801934',
    },
    method: 'POST' as const,
  }
  const expected = options

  const ret = transporter.prepareOptions(options, serviceId)

  assert.deepEqual(ret, expected)
})

// Tests -- shouldListen

test('should return true when incoming is set in options', () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test1.api',
      path: '/entries',
      port: 8080,
    },
  }

  const ret = transporter.shouldListen!(options)

  assert.equal(ret, true)
})

test('should return false when incoming is not set in options', () => {
  const options = {
    uri: 'http://foreign.api',
  }

  const ret = transporter.shouldListen!(options)

  assert.equal(ret, false)
})
