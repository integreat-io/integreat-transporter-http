export function ensureArray<T>(value: undefined | T | T[]): T[] {
  if (!Array.isArray(value)) {
    return value === undefined ? [] : [value]
  }
  return value
}
