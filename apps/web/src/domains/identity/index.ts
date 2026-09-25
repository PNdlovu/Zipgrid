/**
 * @file index.ts
 * @description Public API for the Identity bounded context.
 * Only exports in this file are accessible from outside this domain.
 * Do NOT import from internal files of this domain directly.
 * @module domains/identity
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export { AuthService } from './AuthService'
export { UserService } from './UserService'
export { KycService } from './KycService'
export type { UserRecord } from './UserService'
export type { RegisterInput, AuthTokens, LoginInput } from './AuthService'
export type { IdentityDomainTypes } from './types'
