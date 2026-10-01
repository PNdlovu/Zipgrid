/**
 * @file event-bus.ts
 * @description Internal domain event bus for cross-domain communication.
 * Domains publish typed events here; other domains subscribe.
 * Phase 1: In-process EventEmitter. Phase 2: Redis pub/sub.
 * @module lib/events
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { EventEmitter } from 'events'

/**
 * Domain event types — all cross-domain communication happens via these.
 * Never import one domain's service from another domain directly.
 */
export type DomainEvent =
  | { type: 'SESSION_COMPLETED'; sessionId: string; bookingId: string; energyConsumedWh: number; totalCostPence: number }
  | { type: 'BOOKING_CONFIRMED'; bookingId: string; driverId: string; hostId: string; listingId: string; scheduledStart: Date }
  | { type: 'BOOKING_CANCELLED'; bookingId: string; cancelledBy: 'driver' | 'host' | 'platform' }
  | { type: 'PAYMENT_CAPTURED'; transactionId: string; amountPence: number; driverId: string }
  | { type: 'USER_REGISTERED'; userId: string; role: 'driver' | 'host' | 'both' }
  | { type: 'KYC_VERIFIED'; userId: string }
  | { type: 'LISTING_PUBLISHED'; listingId: string; hostId: string }
  | { type: 'INCIDENT_REPORTED'; incidentId: string; listingId: string; severity: 'low' | 'medium' | 'high' }
  | { type: 'SUPERHOST_AWARDED'; hostProfileId: string }

class DomainEventBus extends EventEmitter {
  /**
   * Publishes a domain event to all registered subscribers.
   * @param event - Typed domain event
   */
  publish(event: DomainEvent): void {
    this.emit(event.type, event)
  }

  /**
   * Subscribes to a specific domain event type.
   * @param type - Event type to subscribe to
   * @param handler - Handler function called with the event payload
   */
  subscribe<T extends DomainEvent['type']>(
    type: T,
    handler: (event: Extract<DomainEvent, { type: T }>) => void | Promise<void>,
  ): void {
    this.on(type, handler)
  }
}

/** Singleton event bus — imported by all domain services that publish or subscribe */
export const eventBus = new DomainEventBus()
