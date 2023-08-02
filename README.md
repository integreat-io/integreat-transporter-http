# HTTP transport for Integreat

Transporter that lets
[Integreat](https://github.com/integreat-io/integreat) send and receive data
over http/https.

[![npm Version](https://img.shields.io/npm/v/integreat-transporter-http.svg)](https://www.npmjs.com/package/integreat-transporter-http)
[![Maintainability](https://api.codeclimate.com/v1/badges/6abe9cf4601fe08a18b8/maintainability)](https://codeclimate.com/github/integreat-io/integreat-transporter-http/maintainability)

## Getting started

### Prerequisits

Requires node v18 and Integreat v1.0.

### Installing and using

Install from npm:

```
npm install integreat-transport-http
```

Example of use:

```javascript
import Integreat from 'integreat'
import httpTransporter from 'integreat-transport-http'
import defs from './config'

const great = Integreat.create(defs, {
  transporters: { http: httpTransporter() },
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

Available options for action meta options:

- `uri`: The request uri
- `baseUri`: Used as a base for the `uri`, if provided
- `queryParams`: An object of query parameters to use for the request. The
  keys and values of the object will be keys and values in the query string.
  Value will be forced to strings
- `authAsQuery`: When set to `true`, auth object will be included as query
  params. Use with care
- `headers`: An object of key/value pairs use directly as request headers. It
  will be combined with the `headers` object on the `payload`.
- `responseFormat`: Controls what format the body data is returned in. `base64`
  will encode the raw body buffer as base64, while `string` will simply return
  the body as a string. Default is `string`
- `timeout`: Timeout in milliseconds for the request. Default is 120000

- `incoming`: An object with options to define an incoming service. The precense
  of this object will start an http server, and the properties of the object
  will define what requests this service will respond to. The following options
  are available:
  - `port`: The port to listen on. Default is 8080
  - `host`: The host to listen on. This is case insensitive. Default is any host
  - `path`: The path to listen on. This will match anything "below" the path you
    specify, meaning `'/entries'` will match `'/entries/ent1'`. The match is
    case insensitive. Default is any path
  - `sourceService`: When this is a string, it will be set as `sourceService` on
    the action being dispatched from the listener. Only use this if you want to
    override the default behaviour of Integreat, that is to set the id of the
    service as `sourceService`.

**A note on headers:** Actions may have an `headers` object on the payload and
the `meta.options` object. If they are both there, they will be merged, with the
`payload.headers` object taking precedence. Also, if there's no `Content-Type`
header in the action, and this is not a `GET` request, it will be set based on
the `payload.data`. If it is a string, the content type will be `'text/plain'`,
otherwise it will be `'application/json'`. Finally, the authenticator set for
the service may have provided an object of headers, which will override
everything else.

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
