import test from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage } from 'http'

import { actionFromRequest } from './request.js'

// Tests

test('should lowercase host when creating action from request', async () => {
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
      path: '/ENTRIES',
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

  assert.deepEqual(ret, expectedAction)
})

test('should treat query params ending in brackets as an array', async () => {
  const request = {
    method: 'GET',
    url: '/entries?ids[]=ent1&ids[]=ent2&archived=true&pageSize=100',
    headers: {
      host: 'localhost',
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
        ids: ['ent1', 'ent2'],
        archived: 'true',
        pageSize: '100',
      },
      contentType: 'application/json',
      headers: {
        'content-type': 'application/json',
        host: 'localhost',
      },
    },
    meta: {},
  }

  const ret = await actionFromRequest(request, 9030)

  assert.deepEqual(ret, expectedAction)
})
