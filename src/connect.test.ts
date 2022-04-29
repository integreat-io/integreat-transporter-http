import test from 'ava'

import connect from './connect'

// Tests

test('should return ok connection when no incoming', async (t) => {
  const options = { uri: 'http://foreign.api' }
  const expected = { status: 'ok' }

  const ret = await connect(options, null, null)

  t.deepEqual(ret, expected)
})

test('should create server when incoming is set', async (t) => {
  const options = {
    uri: 'http://foreign.api',
    incoming: {
      host: 'test1.api',
      path: '/entries',
      port: 8080,
    },
  }

  const ret = await connect(options, null, null)

  t.is(ret?.status, 'ok')
  t.truthy(ret?.server)

  ret?.server?.close()
})

test('should create one server for each port', async (t) => {
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

  t.is(ret0?.status, 'ok')
  t.is(ret0?.server, ret2?.server)
  t.not(ret0?.server, ret1?.server)

  ret0?.server?.close()
  ret1?.server?.close()
  ret2?.server?.close()
})

test('should set incoming options on connection', async (t) => {
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
  }

  const ret = await connect(options, null, null)

  t.is(ret?.status, 'ok')
  t.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})

test('should use 8080 as default port when not set in incoming options', async (t) => {
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
  }

  const ret = await connect(options, null, null)

  t.is(ret?.status, 'ok')
  t.deepEqual(ret?.incoming, expectedIncoming)

  ret?.server?.close()
})
