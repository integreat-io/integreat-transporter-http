import type { SinonSpy } from 'sinon'

export const spyCountMessage = (fn: SinonSpy, fnName?: string) =>
  `Called ${fnName ?? 'function'} ${fn.callCount} time${fn.callCount === 1 ? '' : 's'}`
