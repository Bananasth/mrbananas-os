import { describe, expect, it } from 'vitest'
import { err, isErr, isOk, map, ok, unwrapOr } from './result'

describe('Result', () => {
  it('constructs and narrows a success', () => {
    const r = ok(42)
    expect(r.ok).toBe(true)
    expect(isOk(r)).toBe(true)
    expect(isErr(r)).toBe(false)
    if (isOk(r)) {
      expect(r.value).toBe(42)
    }
  })

  it('constructs and narrows a failure', () => {
    const e = new Error('boom')
    const r = err(e)
    expect(r.ok).toBe(false)
    expect(isErr(r)).toBe(true)
    expect(isOk(r)).toBe(false)
    if (isErr(r)) {
      expect(r.error).toBe(e)
    }
  })

  it('maps over a success and passes failures through', () => {
    expect(map(ok(2), (n) => n * 3)).toEqual(ok(6))
    const failure = err('nope')
    expect(map(failure, (n: number) => n * 3)).toBe(failure)
  })

  it('unwraps with a fallback', () => {
    expect(unwrapOr(ok('value'), 'fallback')).toBe('value')
    expect(unwrapOr(err(new Error()), 'fallback')).toBe('fallback')
  })
})
