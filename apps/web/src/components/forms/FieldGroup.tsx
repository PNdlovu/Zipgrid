/**
 * @file FieldGroup.tsx
 * @description Groups related form fields with an optional section heading.
 * Used in multi-section forms (e.g. listing builder, settings pages).
 * @module components/forms
 */

import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

type FieldGroupProps = {
  /** Section heading — rendered above the fields */
  heading?: string
  /** Optional sub-heading / description */
  description?: string
  children: ReactNode
  className?: string
}

/**
 * A labelled group of related form fields.
 *
 * @example
 * <FieldGroup heading="Pricing" description="Set how drivers pay for charging.">
 *   <FormField label="Model">…</FormField>
 *   <FormField label="Price per kWh">…</FormField>
 * </FieldGroup>
 */
export function FieldGroup({ heading, description, children, className }: FieldGroupProps) {
  return (
    <fieldset className={cn('flex flex-col gap-4', className)}>
      {(heading || description) && (
        <div className="border-b border-[hsl(var(--border))] pb-3">
          {heading && (
            <legend className="text-sm font-semibold text-[hsl(var(--foreground))]">
              {heading}
            </legend>
          )}
          {description && (
            <p className="mt-0.5 text-xs text-[hsl(var(--muted-foreground))]">{description}</p>
          )}
        </div>
      )}
      {children}
    </fieldset>
  )
}
