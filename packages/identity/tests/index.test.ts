import { describe, expect, it } from 'vitest'
import { IdentityError, LocalIdentityAuthority } from '../src/index.ts'

const token = '0123456789abcdef0123456789abcdef'

describe('LocalIdentityAuthority', () => {
  it('binds CLI and bearer authentication to the configured owner', () => {
    const authority = new LocalIdentityAuthority({
      httpToken: token,
      ownerId: 'owner-1',
      principalId: 'principal-1',
    })

    expect(authority.localPrincipal()).toMatchObject({
      authStrength: 'local_process',
      id: 'principal-1',
      ownerId: 'owner-1',
    })
    expect(authority.authenticateBearer(`Bearer ${token}`)).toMatchObject({
      authStrength: 'local_bearer',
      id: 'principal-1',
      ownerId: 'owner-1',
    })
  })

  it('rejects missing and incorrect bearer tokens', () => {
    const authority = new LocalIdentityAuthority({
      httpToken: token,
      ownerId: 'owner-1',
      principalId: 'principal-1',
    })

    expect(() => authority.authenticateBearer(undefined)).toThrow(IdentityError)
    expect(() => authority.authenticateBearer(`Bearer ${'x'.repeat(32)}`)).toThrow(IdentityError)
  })
})
