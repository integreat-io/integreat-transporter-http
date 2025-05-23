import test from 'node:test'
import assert from 'node:assert/strict'
import { setTimeout } from 'node:timers/promises'
import nock from 'nock'
import transporter from './index.js'
import { isObject } from './utils/is.js'
import connect from './connect.js'

import send from './send.js'

// Setup

const { prepareOptions } = transporter
const serviceId = 'http'

function extractTimestamp(data: unknown): number {
  if (typeof data === 'string') {
    const item = JSON.parse(data)
    if (isObject(item)) {
      const timestamp = item.timestamp
      return typeof timestamp === 'number' ? timestamp : 0
    }
  }
  return 0
}

test.after(() => {
  nock.restore()
})

// Tests

test('should send data and return status, data, and headers', async () => {
  const data = 'Plain text'
  const scope = nock('http://json1.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/ent1', data)
    .reply(
      200,
      { id: 'ent1' },
      {
        'Content-Type': 'application/json; charset=UTF-8',
        Expires: 'Mon, 28 Mar 2022 13:50:13 GMT',
      },
    )
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json1.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }
  const expectedHeaders = {
    'content-type': 'application/json; charset=UTF-8',
    expires: 'Mon, 28 Mar 2022 13:50:13 GMT',
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.deepEqual(ret.data, '{"id":"ent1"}')
  assert.deepEqual(ret.headers, expectedHeaders)
  assert(scope.isDone())
})

test('should return buffer data as base64 when meta.options.responseFormat is base64', async () => {
  const data = 'Plain text'
  const scope = nock('http://json1.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/ent1', data)
    .reply(
      200,
      { id: 'ent1' },
      {
        'Content-Type': 'application/json; charset=UTF-8',
        Expires: 'Mon, 28 Mar 2022 13:50:13 GMT',
      },
    )
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json1.test/entries/ent1',
          responseFormat: 'base64',
        },
        serviceId,
      ),
    },
  }
  const expectedHeaders = {
    'content-type': 'application/json; charset=UTF-8',
    expires: 'Mon, 28 Mar 2022 13:50:13 GMT',
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.deepEqual(ret.data, 'eyJpZCI6ImVudDEifQ==')
  assert.deepEqual(ret.headers, expectedHeaders)
  assert(scope.isDone())
})

test('should use GET method as default when no data', async () => {
  const scope = nock('http://json2.test', { badheaders: ['Content-Type'] })
    .get('/entries/ent1')
    .reply(200, { id: 'ent1', type: 'entry' })
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json2.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.deepEqual(ret.data, '{"id":"ent1","type":"entry"}')
  assert(scope.isDone())
})

test('should disregard data when GET method is specified', async () => {
  const scope = nock('http://json2.test', { badheaders: ['Content-Type'] })
    .get('/entries/ent1')
    .reply(200, { id: 'ent1', type: 'entry' })
  const action = {
    type: 'GET',
    payload: { type: 'entry', data: [{ id: 'ent1', $type: 'entry' }] },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json2.test/entries/ent1',
          method: 'GET',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.deepEqual(ret.data, '{"id":"ent1","type":"entry"}')
  assert(scope.isDone())
})

test('should convert all non-string data to JSON', async () => {
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
      options: prepareOptions(
        {
          uri: 'http://json18.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.deepEqual(ret.data, '{"id":"ent1"}')
  assert(scope.isDone())
})

test('should use method from endpoint', async () => {
  const data = '{"id":"ent1","title":"Entry 1"}'
  const scope = nock('http://json3.test')
    .post('/entries/ent1', data)
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json3.test/entries/ent1',
          method: 'POST' as const,
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should support base url', async () => {
  const scope = nock('http://json19.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/ent1')
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{"id":"ent1","title":"Entry 1"}' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json19.test/',
          uri: '/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should handle / uri and baseUri', async () => {
  const scope = nock('http://json34.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/')
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{"id":"ent1","title":"Entry 1"}' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json34.test/entries',
          uri: '/',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should set query params from options', async () => {
  const scope = nock('http://json20.test')
    .get('/entries')
    .query({ createdAfter: '2020-04-18T11:19:45.000Z', order: 'desc' })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json20.test',
          uri: '/entries',
          queryParams: {
            createdAfter: '2020-04-18T11:19:45.000Z',
            order: 'desc',
          },
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should encode query params correctly', async () => {
  const scope = nock('http://json21.test')
    .get(
      '/entries?order=desc&query=*%5B_type%3D%3D%27table%27%26%26key%3D%3D%24table%5D%5B0%5D.fields%7Bkey%2Cname%2Ctype%7D',
    )
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json21.test',
          uri: '/entries',
          queryParams: {
            order: 'desc',
            query: "*[_type=='table'&&key==$table][0].fields{key,name,type}",
          },
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})
test('should set several query params with the same name from array', async () => {
  const scope = nock('http://json26.test')
    .get('/entries?expand%5B%5D=data.user&expand%5B%5D=data.images&order=desc')
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json26.test',
          uri: '/entries',
          queryParams: {
            'expand[]': ['data.user', 'data.images'],
            order: 'desc',
          },
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should force query param values to string', async () => {
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
      options: prepareOptions(
        {
          baseUri: 'http://json22.test',
          uri: '/entries',
          queryParams: {
            createdAfter: new Date('2020-04-18T11:19:45.000Z'),
            desc: true,
            obj: {},
          },
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should exclude query params with undefined value', async () => {
  const scope = nock('http://json23.test')
    .get('/entries')
    .query({ order: 'desc' })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json23.test',
          uri: '/entries',
          queryParams: {
            order: 'desc',
            exclude: undefined,
          },
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should set query params from options when uri has query string', async () => {
  const scope = nock('http://json17.test')
    .get('/entries')
    .query({ page: 1, order: 'desc' })
    .reply(200, [{ id: 'ent1' }])
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          baseUri: 'http://json17.test',
          uri: '/entries?page=1',
          queryParams: { order: 'desc' },
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should return ok status on all 200-range statuses', async () => {
  const data = '{"id":"ent2","title":"Entry 2"}'
  const scope = nock('http://json4.test')
    .put('/entries/ent2', data)
    .reply(202, { id: 'ent2' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json4.test/entries/ent2',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})

test('should return error on not found', async () => {
  nock('http://json5.test').get('/entries/unknown').reply(404)
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json5.test/entries/unknown',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'notfound', `Responded with '${ret.status}'`)
  assert.equal(
    ret.error,
    'Could not find the url http://json5.test/entries/unknown',
  )
  assert.equal(ret.data, undefined)
})

test('should return error on other error', async () => {
  nock('http://json6.test').get('/entries/error').reply(500)
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json6.test/entries/error',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'error', `Responded with '${ret.status}'`)
  assert.equal(
    ret.error,
    'Server returned 500 for http://json6.test/entries/error',
  )
  assert.equal(ret.data, undefined)
})

test('should return response on error', async () => {
  nock('http://json25.test')
    .get('/entries/error')
    .reply(500, { error: 'No time to deal with this' })
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json25.test/entries/error',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'error', `Responded with '${ret.status}'`)
  assert.equal(
    ret.error,
    'Server returned 500 for http://json25.test/entries/error',
  )
  assert.equal(ret.data, JSON.stringify({ error: 'No time to deal with this' }))
})

test('should return error on request error', async () => {
  nock('http://json7.test')
    .get('/entries/ent1')
    .replyWithError('An awful error')
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions(
        {
          uri: 'http://json7.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'error', `Responded with '${ret.status}'`)
})

test('should respond with badrequest on 400', async () => {
  nock('http://json8.test').put('/entries/ent1', '{}').reply(400, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions(
        {
          uri: 'http://json8.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'badrequest', `Responded with '${ret.status}'`)
  assert.equal(typeof ret.error, 'string')
})

test('should respond with timeout on 408', async () => {
  nock('http://json9.test').put('/entries/ent1', '{}').reply(408, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions(
        {
          uri: 'http://json9.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'timeout', `Responded with '${ret.status}'`)
  assert.equal(typeof ret.error, 'string')
})

test('should respond with toomany on 429', async () => {
  nock('http://json30.test').put('/entries/ent1', '{}').reply(429, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions(
        {
          uri: 'http://json30.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'toomany', `Responded with '${ret.status}'`)
  assert.equal(typeof ret.error, 'string')
})

test('should reject on 401 with auth', async () => {
  nock('http://json10.test').put('/entries/ent1', '{}').reply(401, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions(
        {
          uri: 'http://json10.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'noaccess', `Responded with '${ret.status}'`)
  assert.equal(ret.error, 'Not authorized (401)')
})

test('should reject on 401 without auth', async () => {
  nock('http://json11.test').put('/entries/ent1', '{}').reply(401, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: null,
      options: prepareOptions(
        {
          uri: 'http://json11.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'noaccess', `Responded with '${ret.status}'`)
  assert.equal(ret.error, 'Service requires authentication (401)')
})

test('should reject on 403 ', async () => {
  nock('http://json12.test').put('/entries/ent1', '{}').reply(403, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: null,
      options: prepareOptions(
        {
          uri: 'http://json12.test/entries/ent1',
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'noaccess', `Responded with '${ret.status}'`)
  assert.equal(ret.error, 'Service requires authentication (403)')
})

test('should send with headers from endpoint', async () => {
  nock('http://json13.test', {
    reqheaders: {
      authorization: 'The_token',
      'if-match': '3-871801934',
      'user-agent': 'integreat-transporter-http/1.4',
    },
  })
    .put('/entries/ent1', '{}')
    .reply(200)
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      options: prepareOptions(
        {
          headers: { 'If-Match': '3-871801934' },
          uri: 'http://json13.test/entries/ent1',
        },
        serviceId,
      ),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
})

test('should support custom timeout in milliseconds', async () => {
  nock('http://json27.test')
    .put('/entries/ent1', '{}')
    .delay(500) // Delay the response for 500ms
    .reply(200, {})
  const action = {
    type: 'SET',
    payload: { type: 'entry', data: '{}' },
    meta: {
      auth: {},
      options: prepareOptions(
        {
          uri: 'http://json27.test/entries/ent1',
          timeout: 1, // Set a very low timeout for making sure it times out
        },
        serviceId,
      ),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'timeout', `Responded with '${ret.status}'`)
  assert.equal(typeof ret.error, 'string')
})

test('should send with auth headers', async () => {
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
      options: prepareOptions(
        {
          uri: 'http://json14.test/entries/ent1',
        },
        serviceId,
      ),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
})

test('should not send with auth headers when authInData is true', async () => {
  nock('http://json28.test', {
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
      options: prepareOptions(
        {
          uri: 'http://json28.test/entries/ent1',
          authInData: true,
        },
        serviceId,
      ),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  // An error here will tell us that the headers were not sent
  assert.equal(ret.status, 'error', `Responded with '${ret.status}'`)
})

test('should retrieve with headers from action', async () => {
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
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope></soap:Envelope>',
    )
    .reply(200)
  const action = {
    type: 'SET',
    payload: {
      type: 'entry',
      data: '<?xml version="1.0" encoding="utf-8"?><soap:Envelope></soap:Envelope>',
      headers: {
        'x-correlation-id': '1234567890',
        'Content-Type': 'text/xml;charset=utf-8',
      },
    },
    meta: {
      options: prepareOptions(
        {
          headers: { 'If-Match': '3-871801934' },
          uri: 'http://json15.test/entries/ent1',
        },
        serviceId,
      ),
      auth: { Authorization: 'The_token' },
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
})

test('should remove content-type header in GET requests', async () => {
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
      options: prepareOptions(
        {
          uri: 'http://json24.test/entries/ent1',
        },
        serviceId,
      ),
      auth: null,
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
})

test('should retrieve with auth params in querystring', async () => {
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
      options: prepareOptions(
        {
          uri: 'http://json16.test/entries/ent1',
          authAsQuery: true,
          queryParams: { order: 'desc' },
        },
        serviceId,
      ),
      auth: { Authorization: 'Th@&t0k3n', timestamp: '1554407539' },
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
})

test('should throttle calls when options has throttle settings', async () => {
  const scope = nock('http://json29.test')
    .get('/entries/ent1')
    .times(4)
    .reply(200, () => ({ id: 'ent1', timestamp: Date.now() }))
  const options = prepareOptions(
    {
      uri: 'http://json29.test/entries/ent1',
      throttle: {
        limit: 2,
        interval: 1000,
      },
    },
    serviceId,
  )
  const action = {
    type: 'GET',
    payload: { type: 'entry', id: 'ent1' },
    meta: {
      options,
    },
  }

  const conn = await connect(options, null, null) // We need to connect to get the throttle function
  const ret0 = await send(action, conn)
  const ret1 = await send(action, conn)
  const ret2 = await send(action, conn)
  const ret3 = await send(action, conn)

  assert.equal(ret0.status, 'ok', `Responded with '${ret0.status}'`)
  assert.equal(ret1.status, 'ok', `Responded with '${ret1.status}'`)
  assert.equal(ret2.status, 'ok', `Responded with '${ret2.status}'`)
  assert.equal(ret3.status, 'ok', `Responded with '${ret3.status}'`)
  const timestamp0 = extractTimestamp(ret0.data)
  const timestamp1 = extractTimestamp(ret1.data)
  const timestamp2 = extractTimestamp(ret2.data)
  const timestamp3 = extractTimestamp(ret3.data)
  assert(
    timestamp1 - timestamp0 < 1000,
    'Should have less than 1000 ms between the first and second call',
  )
  assert(
    timestamp2 - timestamp0 > 900 && timestamp2 - timestamp0 < 1100, // We give the throttle function a slack of 100 ms in both directions
    `Should have around 1000 ms between the first and third call, was ${timestamp2 - timestamp0}`,
  )
  assert(
    timestamp3 - timestamp2 < 1000,
    'Should have less than 1000 ms between the third and fourth call',
  )
  assert(scope.isDone())
})

test('should retry on 429 response when rateLimit settings are given', async () => {
  const scope = nock('http://json32.test')
    .get('/entries/ent1')
    .reply(429, '', { 'retry-after': '1' })
    .get('/entries/ent1')
    .reply(200, () => ({ id: 'ent1', timestamp: Date.now() }))
  const options = prepareOptions(
    {
      uri: 'http://json32.test/entries/ent1',
      rateLimit: {
        retry: 1,
        maxDelay: 5,
      },
    },
    serviceId,
  )
  const action = {
    type: 'GET',
    payload: { type: 'entry', id: 'ent1' },
    meta: {
      options,
    },
  }

  const p = send(action, null)
  await setTimeout(200)
  const wasDoneBefore = scope.isDone() // Make sure that we are waiting after 200 ms
  await setTimeout(820)
  const wasDoneAfter = scope.isDone() // Make sure that we are done after 1000+ ms
  const ret = await p

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.equal(wasDoneBefore, false)
  assert.equal(wasDoneAfter, true)
})

test('should retry two times on 429 response when rateLimit settings are given', async () => {
  const scope = nock('http://json33.test')
    .get('/entries/ent1')
    .times(2)
    .reply(429, '', { 'retry-after': '1' })
    .get('/entries/ent1')
    .reply(200, () => ({ id: 'ent1', timestamp: Date.now() }))
  const options = prepareOptions(
    {
      uri: 'http://json33.test/entries/ent1',
      rateLimit: {
        retry: 2,
      },
    },
    serviceId,
  )
  const action = {
    type: 'GET',
    payload: { type: 'entry', id: 'ent1' },
    meta: {
      options,
    },
  }

  const p = send(action, null)
  await setTimeout(200)
  const wasDoneBefore = scope.isDone() // Make sure that we are waiting after 200 ms
  await setTimeout(820)
  const wasDoneBetween = scope.isDone() // Make sure that we are done after 1000+ ms
  await setTimeout(1020)
  const wasDoneAfter = scope.isDone() // Make sure that we are done after 2000+ ms
  const ret = await p

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert.equal(wasDoneBefore, false)
  assert.equal(wasDoneBetween, false)
  assert.equal(wasDoneAfter, true)
})

test('should return error response after the given number of rate limit retries', async () => {
  const scope = nock('http://json32.test')
    .get('/entries/ent1')
    .times(2)
    .reply(429, '', { 'retry-after': '1' })
  const options = prepareOptions(
    {
      uri: 'http://json32.test/entries/ent1',
      rateLimit: {
        retry: 1,
      },
    },
    serviceId,
  )
  const action = {
    type: 'GET',
    payload: { type: 'entry', id: 'ent1' },
    meta: {
      options,
    },
  }

  const p = send(action, null)
  await setTimeout(200)
  const wasDoneBefore = scope.isDone() // Make sure that we are waiting after 200 ms
  await setTimeout(810)
  const wasDoneAfter = scope.isDone() // Make sure that we are done after 1000+ ms
  const ret = await p

  assert.equal(ret.status, 'toomany', `Responded with '${ret.status}'`)
  assert.equal(wasDoneBefore, false)
  assert.equal(wasDoneAfter, true)
})

test('should not retry on rate limiting when retry-after is longer than the given maxDelay', async () => {
  const scope = nock('http://json32.test')
    .get('/entries/ent1')
    .reply(429, '', { 'retry-after': '5' })
  const options = prepareOptions(
    {
      uri: 'http://json32.test/entries/ent1',
      rateLimit: {
        retry: 1,
        maxDelay: 1,
      },
    },
    serviceId,
  )
  const action = {
    type: 'GET',
    payload: { type: 'entry', id: 'ent1' },
    meta: {
      options,
    },
  }

  const p = send(action, null)
  await setTimeout(200)
  const wasDone = scope.isDone() // Make sure that we are waiting after 200 ms
  const ret = await p

  assert.equal(ret.status, 'toomany', `Responded with '${ret.status}'`)
  assert.equal(wasDone, true)
})

test('should return error when no endpoint', async () => {
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {},
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'badrequest', `Responded with '${ret.status}'`)
})

test('should return error when no uri', async () => {
  const action = {
    type: 'GET',
    payload: { type: 'entry' },
    meta: {
      options: prepareOptions({ uri: undefined }, serviceId),
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'badrequest', `Responded with '${ret.status}'`)
})

test('should honor noLogging', async () => {
  // Note: We don't really test this, as logging is done with DEBUG, that don't
  // log in tests. But we verify that nothing breaks, at least
  const data = 'Plain text'
  const scope = nock('http://json31.test', {
    reqheaders: { 'Content-Type': 'text/plain' },
  })
    .put('/entries/ent1', data)
    .reply(200, { id: 'ent1' })
  const action = {
    type: 'SET',
    payload: { type: 'entry', data },
    meta: {
      options: prepareOptions(
        { uri: 'http://json31.test/entries/ent1' },
        serviceId,
      ),
      noLogging: true,
    },
  }

  const ret = await send(action, null)

  assert.equal(ret.status, 'ok', `Responded with '${ret.status}'`)
  assert(scope.isDone())
})
