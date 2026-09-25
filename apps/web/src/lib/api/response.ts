/**
 * @file response.ts
 * @description Standardised API response helpers.
 * All API routes must return responses using these helpers to ensure consistent
 * envelope shape: { success, data, error, meta }.
 * @module lib/api
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { NextResponse } from 'next/server'

/** Standard successful response envelope */
export type ApiSuccessResponse<T> = {
  success: true
  data: T
  meta?: {
    page?: number
    pageSize?: number
    total?: number
    traceId?: string
  } | undefined
}

/** Standard error response envelope */
export type ApiErrorResponse = {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
  meta?: {
    traceId?: string
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse

/**
 * Creates a standardised successful API response.
 * @param data - Response payload
 * @param meta - Optional pagination / trace metadata
 * @param status - HTTP status code (default 200)
 */
export function apiResponse<T>(
  data: T,
  meta?: ApiSuccessResponse<T>['meta'],
  status = 200,
): NextResponse<ApiSuccessResponse<T>> {
  return NextResponse.json({ success: true, data, meta }, { status })
}

/**
 * Creates a standardised error API response.
 * @param code - Machine-readable error code (e.g. BOOKING_OVERLAP)
 * @param message - Human-readable error message
 * @param status - HTTP status code (default 400)
 * @param details - Optional additional details (not shown to users in production)
 */
export function apiError(
  code: string,
  message: string,
  status = 400,
  details?: unknown,
): NextResponse<ApiErrorResponse> {
  return NextResponse.json(
    {
      success: false,
      error: { code, message, ...(process.env.NODE_ENV !== 'production' ? { details } : {}) },
    },
    { status },
  )
}
