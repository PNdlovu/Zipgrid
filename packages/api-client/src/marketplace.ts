/**
 * @file marketplace.ts
 * @description TanStack Query hooks for marketplace — products, installers, cart.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from './client'

/* ── Types ─────────────────────────────────────────────────── */

type Product = {
  id: string
  name: string
  brand: string | null
  categorySlug: string
  description: string | null
  pricePence: number
  imageUrls: string[]
  plugTypes: string[]
  isFeatured: boolean
  stockStatus: string
}

type ProductsResponse = { products: Product[]; total: number }

type Installer = {
  id: string
  userId: string
  businessName: string | null
  bio: string | null
  ozevCertified: boolean
  coveragePostcodes: string[]
  serviceCategories: string[]
  hourlyRatePence: number | null
  averageRating: number | null
  reviewCount: number
}

type InstallersResponse = { installers: Installer[]; total: number }

type CartItem = {
  productId: string
  quantity: number
  product: Product
}

type CartResponse = {
  items: CartItem[]
  subtotalPence: number
}

/* ── Query keys ─────────────────────────────────────────────── */

export const marketplaceKeys = {
  products: (params: Record<string, unknown>) => ['marketplace', 'products', params] as const,
  product: (id: string) => ['marketplace', 'products', id] as const,
  installers: (params: Record<string, unknown>) => ['marketplace', 'installers', params] as const,
  installer: (id: string) => ['marketplace', 'installers', id] as const,
  cart: () => ['marketplace', 'cart'] as const,
}

/* ── Hooks ──────────────────────────────────────────────────── */

type ProductSearchParams = {
  q?: string
  category?: string
  plugType?: string
  maxPricePence?: number
  featuredOnly?: boolean
  page?: number
}

/** Searches products with filters */
export function useProducts(params: ProductSearchParams = {}) {
  return useQuery({
    queryKey: marketplaceKeys.products(params),
    queryFn: () => apiClient.get<ProductsResponse>('/v1/marketplace/products', { params }),
    staleTime: 120_000,
  })
}

/** Fetches a single product */
export function useProduct(id: string) {
  return useQuery({
    queryKey: marketplaceKeys.product(id),
    queryFn: () => apiClient.get<Product>(`/v1/marketplace/products/${id}`),
    enabled: Boolean(id),
    staleTime: 120_000,
  })
}

type InstallerSearchParams = {
  lat?: number
  lng?: number
  postcode?: string
  serviceCategory?: string
  ozevOnly?: boolean
  page?: number
}

/** Searches nearby installers */
export function useInstallers(params: InstallerSearchParams = {}) {
  return useQuery({
    queryKey: marketplaceKeys.installers(params),
    queryFn: () => apiClient.get<InstallersResponse>('/v1/marketplace/installers', { params }),
    staleTime: 120_000,
  })
}

/** Fetches a single installer */
export function useInstaller(id: string) {
  return useQuery({
    queryKey: marketplaceKeys.installer(id),
    queryFn: () => apiClient.get<Installer>(`/v1/marketplace/installers/${id}`),
    enabled: Boolean(id),
    staleTime: 120_000,
  })
}

/** Fetches the current user's cart */
export function useCart() {
  return useQuery({
    queryKey: marketplaceKeys.cart(),
    queryFn: () => apiClient.get<CartResponse>('/v1/marketplace/cart'),
    staleTime: 10_000,
  })
}

/** Mutation to add a product to cart */
export function useAddToCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (input: { productId: string; quantity: number }) =>
      apiClient.post<CartResponse>('/v1/marketplace/cart', input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.cart() })
    },
  })
}

/** Mutation to remove a product from cart */
export function useRemoveFromCart() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (productId: string) =>
      apiClient.delete(`/v1/marketplace/cart?productId=${productId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: marketplaceKeys.cart() })
    },
  })
}

/** Mutation to book an installer job */
export function useBookInstaller() {
  return useMutation({
    mutationFn: (input: {
      installerProfileId: string
      serviceCategory: string
      title: string
      description?: string
      address: Record<string, unknown>
      scheduledDate?: string
      scheduledTime?: string
      quotedPricePence?: number
    }) => apiClient.post(`/v1/marketplace/installers/${input.installerProfileId}/book`, input),
  })
}
