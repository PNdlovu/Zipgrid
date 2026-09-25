/**
 * @file api.ts
 * @description API request/response envelope types — shared by web + mobile + api-client.
 * @module @zipgrid/types
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export type PaginationMeta = {
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export type ApiSuccessResponse<T> = {
  success: true
  data: T
  meta?: Partial<PaginationMeta> & { traceId?: string }
}

export type ApiErrorResponse = {
  success: false
  error: {
    code: string
    message: string
    details?: unknown
  }
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse
