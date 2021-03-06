import test from 'ava'
import nock = require('nock')
import transporter from '.'

import send from './send'

// Setup

const { prepareOptions } = transporter

test.after.always(() => {
  nock.restore()
})

// Tests

test('should send data and return status and data', async (t) => {
  const data = '{"id":"ent1","title":"Entry 1"}'
  const scope = nock('http://json1.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/ent1', data)
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions({
        uri: 'http://json1.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.deepEqual(ret.data, '{"id":"ent1"}')
  t.true(scope.isDone())
})

test('should use GET method as default when no data', async (t) => {
  const scope = nock('http://json2.test', { badheaders: ['Content-Type'] })
    .get('/entries/ent1')
    .reply(200, { id: 'ent1', type: 'entry' })
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        uri: 'http://json2.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.deepEqual(ret.data, '{"id":"ent1","type":"entry"}')
  t.true(scope.isDone())
})

test('should convert all non-string data to JSON', async (t) => {
  const data = { id: 'ent1', title: 'Entry 1' }
  const scope = nock('http://json18.test', {
    reqheaders: { 'Content-Type': 'application/json' },
  })
    .put('/entries/ent1', JSON.stringify(data))
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions({
        uri: 'http://json18.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.deepEqual(ret.data, '{"id":"ent1"}')
  t.true(scope.isDone())
})

test('should use method from endpoint', async (t) => {
  const data = '{"id":"ent1","title":"Entry 1"}'
  const scope = nock('http://json3.test')
    .post('/entries/ent1', data)
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions({
        uri: 'http://json3.test/entries/ent1',
        method: 'POST' as const,
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should support base url', async (t) => {
  const scope = nock('http://json19.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/ent1')
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{"id":"ent1","title":"Entry 1"}' },
    meta: {
      options: prepareOptions({
        baseUri: 'http://json19.test/',
        uri: '/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should set query params from options', async (t) => {
  const scope = nock('http://json20.test')
    .get('/entries')
    .query({ createdAfter: '2020-04-18T11:19:45.000Z', order: 'desc' })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        baseUri: 'http://json20.test',
        uri: '/entries',
        queryParams: {
          createdAfter: '2020-04-18T11:19:45.000Z',
          order: 'desc',
        },
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should encode query params correctly', async (t) => {
  const scope = nock('http://json21.test')
    .get(
      '/entries?order=desc&query=*%5B_type%3D%3D%27table%27%26%26key%3D%3D%24table%5D%5B0%5D.fields%7Bkey%2Cname%2Ctype%7D'
    )
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        baseUri: 'http://json21.test',
        uri: '/entries',
        queryParams: {
          order: 'desc',
          query: "*[_type=='table'&&key==$table][0].fields{key,name,type}",
        },
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should force query param values to string', async (t) => {
  const scope = nock('http://json22.test')
    .get('/entries')
    .query({
      createdAfter: '2020-04-18T11:19:45.000Z',
      desc: 'true',
      obj: '{}',
    })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        baseUri: 'http://json22.test',
        uri: '/entries',
        queryParams: {
          createdAfter: new Date('2020-04-18T11:19:45.000Z'),
          desc: true,
          obj: {},
        },
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should exclude query params with undefined value', async (t) => {
  const scope = nock('http://json23.test')
    .get('/entries')
    .query({ order: 'desc' })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        baseUri: 'http://json23.test',
        uri: '/entries',
        queryParams: {
          order: 'desc',
          exclude: undefined,
        },
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should set query params from options when uri has query string', async (t) => {
  const scope = nock('http://json17.test')
    .get('/entries')
    .query({ page: 1, order: 'desc' })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        baseUri: 'http://json17.test',
        uri: '/entries?page=1',
        queryParams: { order: 'desc' },
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should return ok status on all 200-range statuses', async (t) => {
  const data = '{"id":"ent2","title":"Entry 2"}'
  const scope = nock('http://json4.test')
    .put('/entries/ent2', data)
    .reply(202, { id: 'ent2' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions({
        uri: 'http://json4.test/entries/ent2',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
  t.true(scope.isDone())
})

test('should return error on not found', async (t) => {
  nock('http://json5.test').get('/entries/unknown').reply(404)
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        uri: 'http://json5.test/entries/unknown',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'notfound', ret.error)
  t.is(ret.error, 'Could not find the url http://json5.test/entries/unknown')
  t.is(ret.data, undefined)
})

test('should return error on other error', async (t) => {
  nock('http://json6.test').get('/entries/error').reply(500)
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        uri: 'http://json6.test/entries/error',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'error', ret.error)
  t.is(ret.error, 'Server returned 500 for http://json6.test/entries/error')
  t.is(ret.data, undefined)
})

test('should return error on request error', async (t) => {
  nock('http://json7.test')
    .get('/entries/ent1')
    .replyWithError('An awful error')
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({
        uri: 'http://json7.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'error', ret.error)
})

test('should respond with badrequest on 400', async (t) => {
  nock('http://json8.test').put('/entries/ent1', '{}').reply(400, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions({
        uri: 'http://json8.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'badrequest', ret.error)
  t.is(typeof ret.error, 'string')
})

test('should respond with timeout on 408', async (t) => {
  nock('http://json9.test').put('/entries/ent1', '{}').reply(408, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions({
        uri: 'http://json9.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'timeout', ret.error)
  t.is(typeof ret.error, 'string')
})

test('should reject on 401 with auth', async (t) => {
  nock('http://json10.test').put('/entries/ent1', '{}').reply(401, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions({
        uri: 'http://json10.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'noaccess', ret.error)
  t.is(ret.error, 'Not authorized')
})

test('should reject on 401 without auth', async (t) => {
  nock('http://json11.test').put('/entries/ent1', '{}').reply(401, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: null,
      options: prepareOptions({
        uri: 'http://json11.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'noaccess', ret.error)
  t.is(ret.error, 'Service requires authentication')
})

test('should reject on 403 ', async (t) => {
  nock('http://json12.test').put('/entries/ent1', '{}').reply(403, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: null,
      options: prepareOptions({
        uri: 'http://json12.test/entries/ent1',
      }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'noaccess', ret.error)
  t.is(typeof ret.error, 'string')
})

test('should send with headers from endpoint', async (t) => {
  nock('http://json13.test', {
    reqheaders: {
      authorization: 'The_token',
      'If-Match': '3-871801934',
    },
  })
    .put('/entries/ent1', '{}')
    .reply(200)
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      options: prepareOptions({
        headers: { 'If-Match': '3-871801934' },
        uri: 'http://json13.test/entries/ent1',
      }),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
})

test('should retrieve with auth headers', async (t) => {
  nock('http://json14.test', {
    reqheaders: {
      authorization: 'The_token',
    },
  })
    .put('/entries/ent1', '{}')
    .reply(200)
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      options: prepareOptions({
        uri: 'http://json14.test/entries/ent1',
      }),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
})

test('should retrieve with headers from action', async (t) => {
  nock('http://json15.test', {
    reqheaders: {
      authorization: 'The_token',
      'If-Match': '3-871801934',
      'x-correlation-id': '1234567890',
      'content-type': 'text/xml;charset=utf-8',
    },
  })
    .put(
      '/entries/ent1',
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope></soap:Envelope>'
    )
    .reply(200)
  const action = {
    type: 'SET',
    payload: {
      type: 'entry',
      data:
        '<?xml version="1.0" encoding="utf-8"?><soap:Envelope></soap:Envelope>',
      headers: {
        'x-correlation-id': '1234567890',
        'Content-Type': 'text/xml;charset=utf-8',
      },
    },
    meta: {
      options: prepareOptions({
        headers: { 'If-Match': '3-871801934' },
        uri: 'http://json15.test/entries/ent1',
      }),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
})

test('should remove content-type header in GET requests', async (t) => {
  nock('http://json24.test', {
    reqheaders: {
      'x-correlation-id': '1234567890',
    },
  })
    .get('/entries/ent1')
    .reply(200)
  const action = {
    type: 'GET',
    payload: {
      type: 'entry',
      headers: {
        'x-correlation-id': '1234567890',
        'Content-Type': 'text/xml;charset=utf-8',
      },
    },
    meta: {
      options: prepareOptions({
        uri: 'http://json24.test/entries/ent1',
      }),
      auth: null,
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
})

test('should retrieve with auth params in querystring', async (t) => {
  nock('http://json16.test')
    .put('/entries/ent1', '{}')
    .query({
      order: 'desc',
      Authorization: 'Th@&t0k3n',
      timestamp: '1554407539',
    })
    .reply(200)
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      options: prepareOptions({
        uri: 'http://json16.test/entries/ent1',
        authAsQuery: true,
        queryParams: { order: 'desc' },
      }),
      auth: { Authorization: 'Th@&t0k3n', timestamp: '1554407539' },
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'ok', ret.error)
})

test('should return error when no endpoint', async (t) => {
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {},
  }

  const ret = await send(action, null)

  t.is(ret.status, 'badrequest', ret.error)
})

test('should return error when no uri', async (t) => {
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({ uri: undefined }),
    },
  }

  const ret = await send(action, null)

  t.is(ret.status, 'badrequest', ret.error)
})

test.todo('should retry')
