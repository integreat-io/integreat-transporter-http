import test from 'ava'
import type { IncomingMessage } from 'http'

import { actionFromRequest } from './request.js'

// Tests

test('should lowercase host and path when creating action from request', async (t) => {
  const request = {
    method: 'GET',
    url: '/ENTRIES?filter=all&format=json',
    headers: {
      host: 'LOCALHOST',
      'content-type': 'application/json',
    },
    [Symbol.asyncIterator]() {
      return {
        next() {
          return Promise.resolve({ value: undefined, done: true })
        },
      }
    },
  } as IncomingMessage
  const expectedAction = {
    type: 'GET',
    payload: {
      method: 'GET',
      hostname: 'localhost',
      port: 9030,
      path: '/entries',
      queryParams: {
        filter: 'all',
        format: 'json',
      },
      contentType: 'application/json',
      headers: {
        'content-type': 'application/json',
        host: 'LOCALHOST', // We don't touch the casing here
      },
    },
    meta: {},
  }

  const ret = await actionFromRequest(request, 9030)

  t.deepEqual(ret, expectedAction)
})
