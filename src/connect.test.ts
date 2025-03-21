import test from 'node:test'
import assert from 'node:assert/strict'
import type { ServiceOptions } from './types.js'

import connect from './connect.js'

// Tests

test('should return ok connection when no incoming', async () => {
  const options = { uri: 'http://foreign.api' }
  const expected = { status: 'ok' }

  const ret = await connect(options, null, null)

  assert.deepEqual(ret, expected)
})

test('should create server when incoming is set', async () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test1.api',
      path: '/entries',
      port: 8080,
    },
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert(ret?.server)

  ret?.server?.close()
})

test('should create one server for each port', async () => {
  const options0 = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test4.api',
      path: '/entries',
      port: 9050,
    },
  }
  const options1 = {
    uri: 'http://strange.api',
    incoming: {
      host: 'test4.api',
      path: '/entries',
      port: 9051,
    },
  }
  const options2 = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test4.api',
      path: '/accounts',
      port: 9050,
    },
  }

  const ret0 = await connect(options0, null, null)
  const ret1 = await connect(options1, null, null)
  const ret2 = await connect(options2, null, null)

  assert.equal(ret0?.status, 'ok')
  assert.equal(ret0?.server, ret2?.server)
  assert.notEqual(ret0?.server, ret1?.server)

  ret0?.server?.close()
  ret1?.server?.close()
  ret2?.server?.close()
})

test('should set incoming options on connection', async () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test2.api',
      path: '/entries',
      port: 3000,
      sourceService: 'mainApi',
    },
  }
  const expectedIncoming = {
    host: ['test2.api'],
    path: ['/entries'],
    port: 3000,
    sourceService: 'mainApi',
    challenges: [],
    caseSensitivePath: false,
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})

test('should set incoming options on connection with challenges', async () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test2.api',
      path: '/entries',
      port: 3000,
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
  const expectedIncoming = {
    host: ['test2.api'],
    path: ['/entries'],
    port: 3000,
    sourceService: 'mainApi',
    challenges: [
      {
        scheme: 'Basic',
        realm: 'Our wonderful API',
        params: { charset: 'UTF-8' },
      },
    ],
    caseSensitivePath: false,
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})

test('should lower case incoming path and host, and remove empty ones', async () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: ['TEST2.api', '', undefined],
      path: [null, '/Entries'],
      port: 3000,
      sourceService: 'mainApi',
    },
  } as ServiceOptions
  const expectedIncoming = {
    host: ['test2.api'],
    path: ['/entries'],
    port: 3000,
    sourceService: 'mainApi',
    challenges: [],
    caseSensitivePath: false,
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})

test('should set caseSensitivePath on incoming on the connection', async () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      caseSensitivePath: true,
      host: ['TEST2.api', '', undefined],
      path: [null, '/Entries'],
      port: 3000,
      sourceService: 'mainApi',
    },
  } as ServiceOptions
  const expectedIncoming = {
    host: ['test2.api'],
    path: ['/entries'],
    port: 3000,
    sourceService: 'mainApi',
    challenges: [],
    caseSensitivePath: true,
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})

test('should use 8080 as default port when not set in incoming options', async () => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test3.api',
      path: '/entries',
    },
  }
  const expectedIncoming = {
    host: ['test3.api'],
    path: ['/entries'],
    port: 8080,
    sourceService: undefined,
    challenges: [],
    caseSensitivePath: false,
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})

test('should create a wait function when options has throttle props', async () => {
  const options = {
    uri: 'http://foreign.api',
    throttle: { limit: 2, interval: 1000 },
  }

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'ok')
  assert.equal(typeof ret?.waitFn, 'function')
})

test('should return ok connection as-is', async () => {
  const options = { uri: 'http://foreign.api' }
  const connection = { status: 'ok' }

  const ret = await connect(options, null, connection)

  assert.equal(ret, connection)
})

test('should not return bad connection', async () => {
  const options = { uri: 'http://foreign.api' }
  const connection = { status: 'error', error: 'Do not use this!' }
  const expected = { status: 'ok' }

  const ret = await connect(options, null, connection)

  assert.deepEqual(ret, expected)
  assert.notEqual(ret, connection) // Just to make sure
})

test('should return badrequest when throttle options are incorrect', async () => {
  const options = {
    uri: 'http://foreign.api',
    throttle: { limit: 'a lot', interval: 'some time' },
  } as unknown as ServiceOptions

  const ret = await connect(options, null, null)

  assert.equal(ret?.status, 'badrequest')
  assert.equal(ret?.error, 'Invalid throttle options')
})
