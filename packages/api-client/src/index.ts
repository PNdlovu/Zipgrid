/**
 * @file index.ts
 * @description @zipgrid/api-client — typed TanStack Query hooks for all API domains.
 * Import all API hooks from here. Never write raw fetch/axios calls in components.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export { apiClient } from './client'

// Auth & user
export * from './auth'

// Charging & listings
export * from './listings'
export * from './sessions'

// Bookings (driver + host)
export * from './bookings'
export * from './host'

// Payments
export * from './wallet'

// Rewards & loyalty
export * from './rewards'

// Notifications
export * from './notifications'

// Marketplace
export * from './marketplace'

// Fleet / corporate
export * from './fleet'

// Driver vehicles
export * from './vehicles'
