import { describe, expect, it } from 'vitest'
import { parseClientEnv, parseServerEnv } from './env'

const validClient = {
  NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'local-anon',
}

const validServer = {
  ...validClient,
  SUPABASE_SERVICE_ROLE_KEY: 'local-service-role',
}

describe('env validation', () => {
  it('parses a valid client environment', () => {
    expect(parseClientEnv(validClient)).toEqual(validClient)
  })

  it('rejects a non-URL Supabase URL', () => {
    expect(() =>
      parseClientEnv({ ...validClient, NEXT_PUBLIC_SUPABASE_URL: 'not-a-url' }),
    ).toThrow()
  })

  it('rejects a missing anon key', () => {
    expect(() => parseClientEnv({ NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321' })).toThrow()
  })

  it('parses a valid server environment', () => {
    expect(parseServerEnv(validServer)).toEqual(validServer)
  })

  it('rejects a server environment missing the service-role key', () => {
    expect(() => parseServerEnv(validClient)).toThrow()
  })
})
