import { describe, expect, it } from 'vitest'
import {
  INITIAL_SESSION_VERSION,
  assertSessionCurrent,
  isSessionCurrent,
  nextSessionVersion,
} from './session-version'

describe('session_version revocation logic', () => {
  it('initial version matches the DB default (1)', () => {
    expect(INITIAL_SESSION_VERSION).toBe(1)
  })

  it('a token matching the current version is valid', () => {
    expect(isSessionCurrent(3, 3)).toBe(true)
  })

  it('a stale token (older version) is invalid', () => {
    expect(isSessionCurrent(2, 3)).toBe(false)
  })

  it('a token newer than current is invalid', () => {
    expect(isSessionCurrent(4, 3)).toBe(false)
  })

  it('rejects non-integer versions', () => {
    expect(isSessionCurrent(1.5, 1.5)).toBe(false)
  })

  it('bumping invalidates every prior token', () => {
    const current = 3
    const bumped = nextSessionVersion(current)
    expect(bumped).toBe(4)
    expect(isSessionCurrent(current, bumped)).toBe(false) // old token now stale
    expect(isSessionCurrent(bumped, bumped)).toBe(true) // freshly issued token valid
  })

  it('assertSessionCurrent throws on a stale token and passes on a current one', () => {
    expect(() => assertSessionCurrent(2, 3)).toThrow(/revoked/i)
    expect(() => assertSessionCurrent(3, 3)).not.toThrow()
  })
})
