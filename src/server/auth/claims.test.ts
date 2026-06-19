import { describe, expect, it } from 'vitest'
import { parseAppClaims } from './claims'

const BRANCH_ID = '00000000-0000-0000-0000-000000000003'
const valid = {
  sub: '00000000-0000-0000-0000-000000000001',
  tenant_id: '00000000-0000-0000-0000-000000000002',
  branch_roles: [{ branch_id: BRANCH_ID, role: 'manager' }],
  session_version: 1,
}

describe('app JWT claims', () => {
  it('accepts well-formed, tenant- and branch-scoped claims', () => {
    expect(parseAppClaims(valid)).toEqual(valid)
  })

  it('requires tenant_id (tenant-safe)', () => {
    const { tenant_id: _tenant_id, ...rest } = valid
    expect(() => parseAppClaims(rest)).toThrow()
  })

  it('requires session_version (revocable)', () => {
    const { session_version: _session_version, ...rest } = valid
    expect(() => parseAppClaims(rest)).toThrow()
  })

  it('rejects an unknown role in branch_roles', () => {
    expect(() =>
      parseAppClaims({ ...valid, branch_roles: [{ branch_id: BRANCH_ID, role: 'admin' }] }),
    ).toThrow()
  })

  it('rejects a non-uuid branch_id (branch-safe)', () => {
    expect(() =>
      parseAppClaims({ ...valid, branch_roles: [{ branch_id: 'nope', role: 'staff' }] }),
    ).toThrow()
  })
})
