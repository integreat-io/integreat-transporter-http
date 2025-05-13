# HTTP transport for Integreat

Transporter that lets
[Integreat](https://github.com/integreat-io/integreat) send and receive data
over http/https. Also contains [an authenticator](#authenticator) for http
specific authentication.

[![npm Version](https://img.shields.io/npm/v/integreat-transporter-http.svg)](https://www.npmjs.com/package/integreat-transporter-http)
[![Maintainability](https://qlty.sh/badges/29be9d4d-d00a-4b5b-8a33-7652114ae160/maintainability.svg)](https://qlty.sh/gh/integreat-io/projects/integreat-transporter-http)

## Getting started

### Prerequisits

Requires node v18 and Integreat v1.6.

### Installing and using

Install from npm:

```
npm install integreat-transporter-http
```

Example of use:

```javascript
import Integreat from 'integreat'
import httpTransporter from 'integreat-transporter-http'
import defs from './config'

const great = Integreat.create(defs, {
  transporters: { http: httpTransporter },
})

// ... and then dispatch actions as usual
```

Example source configuration:

```javascript
{
  id: 'store',
  transporter: 'http',
  endpoints: [
    { options: { uri: 'https://api.com/api' } }
  ]
}
```

### Transporter

Available options for action meta options:

- `uri`: The request uri
- `baseUri`: Used as a base for the `uri`, when provided
- `queryParams`: An object of query parameters to use for the request. The
  keys and values of the object will be keys and values in the query string.
  Value will be forced to strings
- `authAsQuery`: When set to `true`, auth object will be included as query
  params. Use with care
- `authInData`: This signals to the transporter that we will provide the auth
  in the data of the actions, and so it will not be set in the headers. Default
  is `false`
- `headers`: An object of key/value pairs use directly as request headers. It
  will be combined with the `headers` object on the `payload`.
- `responseFormat`: Controls what format the body data is returned in. `base64`
  will encode the raw body buffer as base64, while `string` will simply return
  the body as a string. Default is `string`
- `timeout`: Timeout in milliseconds for the request. Default is 120000
- `rateLimit`: An object with properties `retry` and `maxDelay`. When `retry` is
  set to a number higher than 0, the transporter will retry on a 429 response,
  waiting the number of seconds indicated by the `retry-after` header in the
  response. This will be repeated the number of times set by `retry`. If
  `maxDelay` is set, a request will not be retry if it means waiting longer than
  the number of seconds in `maxDelay`.
- `throttle`: An object with the properties `limit` and `interval`. Both should
  be numbers. `limit` defines how many times we will send requests to a
  service within the time period set by `interval` (in milliseconds). This is
  very simplistic rate limiting, and will cause the transporter to simply pause
  between calls when the limit is reached for an interval. Now that we have
  `rateLimit`, `throttle` is no longer the prefered option.

- `incoming`: An object with options to define an incoming service. The
  precense of this object will start an http server, and the properties of the
  object will define what requests this service will respond to. The following
  options are available:
  - `port`: The port to listen on. Default is 8080
  - `host`: The host to listen on. This is case insensitive. Default is any
    host
  - `path`: The path to listen on. This will match anything "below" the path
    you specify, meaning `'/entries'` will match `'/entries/ent1'`. The match
    is case insensitive. Default is any path
  - `sourceService`: When this is a string, it will be set as `sourceService`
    on the action being dispatched from the listener. Only use this if you
    want to override the default behaviour of Integreat, that is to set the id
    of the service as `sourceService`.
  - `challenges`: An array of challenge objects, used to form the correct
    response headers when an incoming request is unauthorized. The objects has
    the following properties: `scheme`, `realm`, and `params`. The two first
    are string and are defined by the relevant authentication method, while
    the last one is an object with key/value pairs that will be added to the
    header. The default is no challenge.
  - `caseSensitivePath`: When set to `true`, the path will keep its original
    case. Default is `false`. Note that the default will change in the next
    major version, so it's good practice to set it explicitly and not rely on
    the default.

**A note on headers:** Actions may have an `headers` object on the payload and
the `meta.options` object. If they are both there, they will be merged, with
the `payload.headers` object taking precedence. Also, if there's no
`Content-Type` header in the action, and this is not a `GET` request, it will
be set based on the `payload.data`. If it is a string, the content type will
be `'text/plain'`, otherwise it will be `'application/json'`. Finally, the
authenticator set for the service may have provided an object of headers,
which will override everything else.

#### Incoming requests

An incoming request will be dispatched as an action. `GET` and `OPTIONS`
requests will be dispatched as an Integreat `GET` action, while all other HTTP
methods will result in a `SET` action.

The payload of the action will have the following properties:

- `method`: The HTTP method of the incoming request
- `hostname`: The lower cased hostname of the incoming request
- `port`: The port number of the incoming request
- `path`: The path of the incoming request. This will be lower cased as long as
  the `caseSensitivePath` option is not `true`.
- `queryParams`: An object of query parameters from the incoming request. Query
  params are key-value pairs, and the object will have the keys as keys and
  values as values. All values are strings.
- `contentType`: The content type string from the incoming request
- `headers`: An object with all the headers from the incoming request. The keys
  (the header names) are lower cased, and the values are strings or arrays of
  strings.

#### HTTP statuses and Integreat statuses

When sending a request, the transporter will map the http status code to an
Integreat status code. The mapping is as follows:

- `400` -> `'badrequest'`
- `401` -> `'noaccess'`
- `403` -> `'noaccess'`
- `404` -> `'notfound'`
- `408` -> `'timeout'`
- `429` -> `'toomany'`
- Everything else -> `'error'`

When listening for incoming requests, the transporter will map the Integreat
status code from the response to an http status code. The mapping is as
follows:

- `'ok'` -> `200`
- `'noaction'` -> `200`
- `'queued'` -> `201`
- `'badrequest'` -> `400`
- `'autherror'` -> `401`
- `'noaccess'` -> `403` (or `401` when the `reason` is `'noauth'`)
- `'notfound'` -> `404`
- `'timeout'` -> `408`
- `'toomany'` -> `429`
- Everything else -> `500`

### Authenticator

The included http authenticator verifies `Authorization` header according to
the given options, and responds with an `ok` response with an `ident` on the
`access` object, or an error.

Example of use:

```javascript
import Integreat from 'integreat'
import httpTransporter from 'integreat-transporter-http'
import httpAuthenticator from 'integreat-transporter-http/authenticator.js'
import defs from './config'

const great = Integreat.create(defs, {
  authenticators: { auth: httpAuthenticator }
  transporters: { http: httpTransporter },
})

// ... and then dispatch actions as usual
```

The auth options are:

- `type`: Only `'Basic'` is supported for now, but there will be other options
  here.
- `key`: For "Basic" this is the username to expect from incoming actions.
- `secret`: For "Basic" this is the password to expect from incoming actions.

The "Basic" type will compare the `key` and `secret` to the `Authorization`
header and use the key as ident id if they match.

Only incoming actions are supported for now.

### Running the tests

The tests can be run with `npm test`.

## Contributing

Please read
[CONTRIBUTING](https://github.com/integreat-io/integreat/blob/master/CONTRIBUTING.md)
for details on our code of conduct, and the process for submitting pull
requests.

## License

This project is licensed under the ISC License - see the
[LICENSE](https://github.com/integreat-io/integreat/blob/master/LICENSE)
file for details.
