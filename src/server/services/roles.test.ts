import { describe, expect, it } from 'vitest'
import type { BranchRole } from '@/server/auth/claims'
import { hasBranchRole, isRoleAllowed, serviceError } from './roles'

const B1 = '22222222-2222-2222-2222-222222222222'
const B2 = '22222222-2222-2222-2222-222222222999'
const ownerAtB1: BranchRole[] = [{ branch_id: B1, role: 'owner' }]
const staffAtB1: BranchRole[] = [{ branch_id: B1, role: 'staff' }]

describe('roles — isRoleAllowed', () => {
  it('admits a held role', () => {
    expect(isRoleAllowed(ownerAtB1, ['owner'])).toBe(true)
    expect(isRoleAllowed(staffAtB1, ['owner', 'manager', 'staff'])).toBe(true)
  })

  it('rejects a role not held', () => {
    expect(isRoleAllowed(staffAtB1, ['owner'])).toBe(false)
    expect(isRoleAllowed([], ['owner'])).toBe(false)
  })
})

describe('roles — hasBranchRole', () => {
  it('matches role at the right branch only', () => {
    expect(hasBranchRole(ownerAtB1, B1, ['owner'])).toBe(true)
    expect(hasBranchRole(ownerAtB1, B2, ['owner'])).toBe(false)
    expect(hasBranchRole(staffAtB1, B1, ['owner'])).toBe(false)
  })
})

describe('roles — serviceError', () => {
  it('builds a typed error', () => {
    expect(serviceError('forbidden', 'no')).toEqual({ code: 'forbidden', message: 'no' })
    expect(serviceError('db', 'x', { a: 1 }).details).toEqual({ a: 1 })
  })
})
