/**
 * @file AppError.ts
 * @description Application error classes for typed error handling across all domains.
 * All domain services throw these typed errors, which API routes catch and convert
 * to standardised API error responses.
 * @module lib/errors
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/** Base application error — all Zipgrid errors extend this */
export class AppError extends Error {
  readonly code: string
  readonly statusCode: number

  constructor(message: string, code: string, statusCode = 400) {
    super(message)
    this.name = 'AppError'
    this.code = code
    this.statusCode = statusCode
  }
}

/** Resource not found */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    super(
      id ? `${resource} with id '${id}' not found` : `${resource} not found`,
      'NOT_FOUND',
      404,
    )
    this.name = 'NotFoundError'
  }
}

/** Authentication required */
export class UnauthorizedError extends AppError {
  constructor(message = 'Authentication required') {
    super(message, 'UNAUTHORIZED', 401)
    this.name = 'UnauthorizedError'
  }
}

/** Authenticated but not permitted */
export class ForbiddenError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(message, 'FORBIDDEN', 403)
    this.name = 'ForbiddenError'
  }
}

/** Input validation failed */
export class ValidationError extends AppError {
  readonly details: unknown

  constructor(message: string, details?: unknown) {
    super(message, 'VALIDATION_ERROR', 422)
    this.name = 'ValidationError'
    this.details = details
  }
}

/** Business rule violation (e.g. booking overlap) */
export class ConflictError extends AppError {
  constructor(message: string, code: string) {
    super(message, code, 409)
    this.name = 'ConflictError'
  }
}

/** External service unavailable */
export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is temporarily unavailable`, 'SERVICE_UNAVAILABLE', 503)
    this.name = 'ServiceUnavailableError'
  }
}

/**
 * Extracts a user-safe error message from any thrown value.
 * Never exposes raw error internals to clients.
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof AppError) return error.message
  if (error instanceof Error) return 'An unexpected error occurred'
  return 'An unexpected error occurred'
}
