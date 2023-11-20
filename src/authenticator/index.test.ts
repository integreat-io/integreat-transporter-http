import test from 'ava'

import authenticator from './index.js'

// Setup

const action = {
  type: 'GET',
  payload: { data: null },
  meta: { ident: { id: 'johnf' } },
}

// Tests -- authenticate

test('authenticate should always refuse for now', async (t) => {
  const options = {}

  const ret = await authenticator.authenticate(options, action)

  t.is(ret.status, 'refused')
  t.is(ret.error, 'Not implemented')
})

// Tests -- isAuthenticated

test('isAuthenticated should always return false for now', (t) => {
  const authentication = {
    status: 'granted',
  }
  const action = {
    type: 'GET',
    payload: { data: null },
    meta: { ident: { id: 'johnf' } },
  }
  const options = {}

  const ret = authenticator.isAuthenticated(authentication, options, action)

  t.false(ret)
})

// Tests -- asObject

test('asObject should always return empty object for now', (t) => {
  const authentication = { status: 'granted' }
  const expected = {}

  const ret = authenticator.authentication.asObject(authentication)

  t.deepEqual(ret, expected)
})

// Tests -- asHttpHeaders

test('asHttpHeaders should always return empty object for now', (t) => {
  const authentication = { status: 'granted' }
  const expected = {}

  const ret = authenticator.authentication.asHttpHeaders(authentication)

  t.deepEqual(ret, expected)
})

// Tests -- validate

test('validate should return ident when Authorization matches options', async (t) => {
  const options = { type: 'Basic', key: 'johnf', secret: 's3cr3t' }
  const authentication = { status: 'granted' } // Doesn't matter what we pass here
  const action = {
    type: 'GET',
    payload: {
      type: 'entry',
      headers: { authorization: 'Basic am9obmY6czNjcjN0' },
    },
    meta: {},
  }
  const expected = { status: 'ok', access: { ident: { id: 'johnf' } } }

  const ret = await authenticator.validate!(authentication, options, action)

  t.deepEqual(ret, expected)
})

test('validate should return autherror when Authorization does not match options', async (t) => {
  const options = { type: 'Basic', key: 'johnf', secret: 's3cr3t' }
  const authentication = { status: 'granted' } // Doesn't matter what we pass here
  const action = {
    type: 'GET',
    payload: {
      type: 'entry',
      headers: { authorization: 'Basic dW5rbm93bjp3cjBuZw==' },
    },
    meta: {},
  }
  const expected = {
    status: 'autherror',
    error: 'Invalid credentials',
    reason: 'invalidauth',
  }

  const ret = await authenticator.validate!(authentication, options, action)

  t.deepEqual(ret, expected)
})

test('validate should return autherror when Authorization does not match type', async (t) => {
  const options = { type: 'Unknown', key: 'johnf', secret: 's3cr3t' }
  const authentication = { status: 'granted' } // Doesn't matter what we pass here
  const action = {
    type: 'GET',
    payload: {
      type: 'entry',
      headers: { authorization: 'Basic am9obmY6czNjcjN0' },
    },
    meta: {},
  }
  const expected = {
    status: 'autherror',
    error: 'Unsupported scheme',
    reason: 'invalidauth',
  }

  const ret = await authenticator.validate!(authentication, options, action)

  t.deepEqual(ret, expected)
})

test('validate should return noaccess when Authorization is missing', async (t) => {
  const options = { type: 'Basic', key: 'johnf', secret: 's3cr3t' }
  const authentication = { status: 'granted' } // Doesn't matter what we pass here
  const action = {
    type: 'GET',
    payload: {
      type: 'entry',
      // No headers
    },
    meta: {},
  }
  const expected = {
    status: 'noaccess',
    error: 'Authentication required',
    reason: 'noauth',
  }

  const ret = await authenticator.validate!(authentication, options, action)

  t.deepEqual(ret, expected)
})

test('validate should return noaccess when no action', async (t) => {
  const options = { type: 'Basic', key: 'johnf', secret: 's3cr3t' }
  const authentication = { status: 'granted' } // Doesn't matter what we pass here
  const action = null
  const expected = {
    status: 'noaccess',
    error: 'Authentication required',
    reason: 'noauth',
  }

  const ret = await authenticator.validate!(authentication, options, action)

  t.deepEqual(ret, expected)
})
