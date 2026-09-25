/**
 * @file listings.ts
 * @description Typed API client hooks for charger listings.
 * Uses TanStack Query for caching, background refetch, and pagination.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery } from '@tanstack/react-query'
import type { ListingSearchParams, ListingSummary, Listing } from '@zipgrid/types'
import { apiClient } from './client'

export const listingKeys = {
  all: ['listings'] as const,
  search: (params: ListingSearchParams) => ['listings', 'search', params] as const,
  detail: (id: string) => ['listings', id] as const,
}

/**
 * Fetches nearby listings by geo coordinates.
 */
export function useNearbyListings(params: ListingSearchParams) {
  return useQuery({
    queryKey: listingKeys.search(params),
    queryFn: () => apiClient.get<ListingSummary[]>('/v1/listings/nearby', { params }),
    enabled: params.lat !== 0 && params.lng !== 0,
    staleTime: 30_000,
  })
}

/**
 * Fetches a single listing by ID.
 */
export function useListing(id: string) {
  return useQuery({
    queryKey: listingKeys.detail(id),
    queryFn: () => apiClient.get<Listing>(`/v1/listings/${id}`),
    enabled: Boolean(id),
    staleTime: 60_000,
  })
}
