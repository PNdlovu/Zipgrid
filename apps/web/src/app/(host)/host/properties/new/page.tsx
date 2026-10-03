/**
 * @file page.tsx
 * @description /host/properties/new — create a residential property.
 *
 * @module apps/web/app/(host)/host/properties/new
 */

'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { EMPTY_PROPERTY, PropertyForm, toPropertyBody } from '@/components/property/PropertyForm'
import { propertyApi } from '@/components/property/api'

/** New property page. */
export default function NewPropertyPage() {
  const router = useRouter()

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6 lg:p-8">
      <div className="flex flex-col gap-2">
        <Link href="/host/properties" className="inline-flex items-center gap-1 text-sm text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Properties
        </Link>
        <h1 className="text-2xl font-semibold text-[hsl(var(--foreground))]">Add property</h1>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          After saving you can add your chargers as bays and invite residents.
        </p>
      </div>
      <PropertyForm
        initial={EMPTY_PROPERTY}
        submitLabel="Create property"
        onSubmit={async (v) => {
          try {
            const { id } = await propertyApi<{ id: string }>('', { method: 'POST', body: toPropertyBody(v) })
            router.push(`/host/properties/${id}`)
            return null
          } catch (e) {
            return (e as Error).message
          }
        }}
      />
    </div>
  )
}
