import { createHash, timingSafeEqual } from 'node:crypto'
import { PrincipalSchema, type ActionErrorCode, type Principal } from '@lumi/contracts'

export class IdentityError extends Error {
  constructor(
    readonly code: Extract<ActionErrorCode, 'AUTH_REQUIRED' | 'PERMISSION_DENIED'>,
    message: string,
  ) {
    super(message)
    this.name = 'IdentityError'
  }
}

export interface IdentityAuthority {
  authenticateBearer(authorization: string | undefined): Principal
  localPrincipal(): Principal
}

export interface LocalIdentityOptions {
  httpToken?: string
  ownerId: string
  principalId: string
}

export class LocalIdentityAuthority implements IdentityAuthority {
  readonly #httpTokenDigest: Buffer | undefined
  readonly #localPrincipal: Principal

  constructor(options: LocalIdentityOptions) {
    this.#localPrincipal = PrincipalSchema.parse({
      authStrength: 'local_process',
      id: options.principalId,
      kind: 'owner',
      ownerId: options.ownerId,
    })
    this.#httpTokenDigest = options.httpToken
      ? tokenDigest(validateToken(options.httpToken))
      : undefined
  }

  localPrincipal(): Principal {
    return this.#localPrincipal
  }

  authenticateBearer(authorization: string | undefined): Principal {
    if (!this.#httpTokenDigest) {
      throw new IdentityError('AUTH_REQUIRED', 'HTTP authentication is not configured')
    }
    const match = /^Bearer ([^\s]+)$/.exec(authorization ?? '')
    if (!match?.[1]) {
      throw new IdentityError('AUTH_REQUIRED', 'A bearer token is required')
    }
    const supplied = tokenDigest(match[1])
    if (!timingSafeEqual(this.#httpTokenDigest, supplied)) {
      throw new IdentityError('AUTH_REQUIRED', 'The bearer token is invalid')
    }
    return PrincipalSchema.parse({
      ...this.#localPrincipal,
      authStrength: 'local_bearer',
    })
  }
}

export function assertOwner(principal: Principal, ownerId: string): void {
  if (principal.ownerId !== ownerId) {
    throw new IdentityError('PERMISSION_DENIED', 'The resource belongs to another owner')
  }
}

export function assertPrincipal(principal: Principal, principalId: string): void {
  if (principal.id !== principalId) {
    throw new IdentityError('PERMISSION_DENIED', 'The resource belongs to another principal')
  }
}

function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest()
}

function validateToken(token: string): string {
  if (token.length < 32 || token.length > 512) {
    throw new Error('PA_HTTP_TOKEN must contain between 32 and 512 characters')
  }
  return token
}
