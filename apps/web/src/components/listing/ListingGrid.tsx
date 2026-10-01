/**
 * @file ListingGrid.tsx
 * @description Responsive grid layout for listing cards.
 * @module components/listing
 */

import { cn } from '@/lib/utils'
import { ListingCard, type ListingCardData } from './ListingCard'
import { EmptyState } from '@/components/shared/EmptyState'
import { Zap } from 'lucide-react'

type ListingGridProps = {
  listings: ListingCardData[]
  className?: string
  emptyTitle?: string
  emptyDescription?: string
}

/** Responsive grid of listing cards with built-in empty state. */
export function ListingGrid({
  listings,
  className,
  emptyTitle = 'No chargers found',
  emptyDescription = 'Try adjusting your filters or searching a different area.',
}: ListingGridProps) {
  if (listings.length === 0) {
    return (
      <EmptyState
        icon={Zap}
        title={emptyTitle}
        description={emptyDescription}
        className={className}
      />
    )
  }

  return (
    <div
      className={cn(
        'grid gap-4',
        'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
        className,
      )}
    >
      {listings.map((listing) => (
        <ListingCard key={listing.id} listing={listing} />
      ))}
    </div>
  )
}
