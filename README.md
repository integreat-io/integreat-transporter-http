# HTTP transport for Integreat

Transporter that lets
[Integreat](https://github.com/integreat-io/integreat) send and receive data
over http/https.

[![npm Version](https://img.shields.io/npm/v/integreat-transporter-http.svg)](https://www.npmjs.com/package/integreat-transporter-http)
[![Maintainability](https://api.codeclimate.com/v1/badges/6abe9cf4601fe08a18b8/maintainability)](https://codeclimate.com/github/integreat-io/integreat-transporter-http/maintainability)

## Getting started

### Prerequisits

Requires node v18 and Integreat v0.8.

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
  transporters: { bull: httpTransporter() },
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
