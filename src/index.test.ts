import test from 'ava'

import transporter from './index.js'

// Setup

const emit = () => undefined
const serviceId = 'http'

// Tests

test('should be a transporter', (t) => {
  t.is(typeof transporter.authentication, 'string')
  t.is(typeof transporter.prepareOptions, 'function')
  t.is(typeof transporter.connect, 'function')
  t.is(typeof transporter.send, 'function')
  t.is(typeof transporter.listen, 'function')
  t.is(typeof transporter.disconnect, 'function')
})

test('should have authentication string', (t) => {
  t.is(transporter.authentication, 'asHttpHeaders')
})

test('connect should return connection object', async (t) => {
  const connection = { status: 'ok' }

  const ret = await transporter.connect({}, {}, connection, emit)

  t.deepEqual(ret, connection)
})

test('should do nothing when callling disconnect', async (t) => {
  const ret = await transporter.disconnect(null)

  t.is(ret, undefined)
})

// Tests -- prepareOptions

test('should return options object', (t) => {
  const options = {
    uri: 'http://example.com/',
    headers: {
      'If-Match': '3-871801934',
    },
    method: 'POST' as const,
  }
  const expected = options

  const ret = transporter.prepareOptions(options, serviceId)

  t.deepEqual(ret, expected)
})

// Tests -- shouldListen

test('should return true when incoming is set in options', (t) => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test1.api',
      path: '/entries',
      port: 8080,
    },
  }

  const ret = transporter.shouldListen!(options)

  t.true(ret)
})

test('should return false when incoming is not set in options', (t) => {
  const options = {
    uri: 'http://foreign.api',
  }

  const ret = transporter.shouldListen!(options)

  t.false(ret)
})
