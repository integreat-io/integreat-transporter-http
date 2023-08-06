import { isObject } from '../utils/is.js'
import type {
  Authenticator,
  Authentication,
  AuthOptions,
  Action,
} from 'integreat'

export type HttpAuthentication = Authentication

export interface HttpOptions extends AuthOptions {
  type?: 'Basic'
  key?: string
  secret?: string
}

const decode = (auth: string) => Buffer.from(auth, 'base64').toString('utf-8')

function extractTokenFromAction(action: Action) {
  const headers = action.payload.headers
  if (isObject(headers)) {
    const header = headers.authorization
    if (typeof header === 'string') {
      const [scheme, token] = header.split(/\s+/)
      return [scheme, decode(token)]
    }
  }
  return []
}

function verifyBasicToken(token: string, key?: string, secret?: string) {
  if (typeof key === 'string' && typeof secret === 'string') {
    const expectedToken = `${key}:${secret}`
    return token === expectedToken
  }
  return false
}

/**
 * The jwt strategy. The jwt is signed on each authentication
 */
const authenticator: Authenticator<HttpAuthentication, HttpOptions> = {
  id: 'http',

  /**
   * Authenticate and return authentication object if authentication was
   * successful.
   */
  async authenticate(
    _options: HttpOptions | null,
    _action
  ): Promise<HttpAuthentication> {
    return { status: 'refused', error: 'Not implemented' }
  },

  /**
   * Check whether this authentication is valid and not expired.
   */
  isAuthenticated(_authentication, _options, _action) {
    return false
  },

  /**
   * Validate authentication object.
   * The Basic type will verify the authrorization token agains the `key` and
   * `secret` given in options.
   */
  async validate(_authentication, options: HttpOptions | null, action) {
    if (action) {
      const { type, key, secret } = options || {}

      const [scheme, token] = extractTokenFromAction(action)
      if (token) {
        if (typeof type === 'string' && scheme !== type.trim()) {
          return {
            status: 'autherror',
            error: 'Unsupported scheme',
            reason: 'invalidauth',
          }
        }
        if (verifyBasicToken(token, key, secret)) {
          return { status: 'ok', access: { ident: { id: key } } }
        } else {
          return {
            status: 'autherror',
            error: 'Invalid credentials',
            reason: 'invalidauth',
          }
        }
      }
    }

    return {
      status: 'noaccess',
      error: 'Authentication required',
      reason: 'noauth',
    }
  },

  authentication: {
    /**
     * Return an object with the information needed for authenticated requests
     * with this authenticator. The object will include `token` and nothing else.
     */
    asObject(_authentication: HttpAuthentication | null) {
      return {}
    },

    /**
     * Return a headers object with the headers needed for authenticated requests
     * with this authenticator. There will be only one property - `Authorization`.
     */
    asHttpHeaders(_authentication: HttpAuthentication | null) {
      return {}
    },
  },
}

export default authenticator
