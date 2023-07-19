export const isObject = (value: unknown): value is Record<string, unknown> =>
  Object.prototype.toString.call(value) === '[object Object]'

export const isDate = (value: unknown): value is Date =>
  Object.prototype.toString.call(value) === '[object Date]'

export const isString = (value: unknown): value is string =>
  typeof value === 'string'

export const isNonEmptyString = (value: unknown): value is string =>
  isString(value) && value.length > 0
