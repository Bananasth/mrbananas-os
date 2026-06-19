import { afterEach, describe, expect, it, vi } from 'vitest'
import { createUserClient } from './client'
import { createAdminClient } from './admin'

const stubClientEnv = () => {
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://localhost:54321')
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', 'local-anon')
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('createUserClient', () => {
  it('builds a client from validated env (no network at construction)', () => {
    stubClientEnv()
    const client = createUserClient()
    expect(typeof client.from).toBe('function')
  })

  it('throws when client env is missing', () => {
    vi.unstubAllEnvs()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', '')
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY', '')
    expect(() => createUserClient()).toThrow()
  })
})

describe('createAdminClient', () => {
  it('builds a service-role client from full server env', () => {
    stubClientEnv()
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'local-service-role')
    const client = createAdminClient()
    expect(typeof client.from).toBe('function')
  })

  it('throws when the service-role key is absent', () => {
    stubClientEnv()
    // No SUPABASE_SERVICE_ROLE_KEY stubbed.
    expect(() => createAdminClient()).toThrow()
  })
})
