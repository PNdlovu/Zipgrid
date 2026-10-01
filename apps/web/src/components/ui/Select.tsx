/**
 * @file Select.tsx
 * @description Shared select/dropdown component.
 * @module components/ui
 */

import { type SelectHTMLAttributes, forwardRef } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

type SelectProps = SelectHTMLAttributes<HTMLSelectElement> & {
  error?: string
  label?: string
  hint?: string
  placeholder?: string
}

/** Shared select with label, error, and hint support. Applies custom arrow icon. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ error, label, hint, placeholder, className, id, children, ...props }, ref) => {
    const selectId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="text-sm font-medium text-[hsl(var(--foreground))]"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              'h-10 w-full appearance-none rounded-[6px] border bg-[hsl(var(--background))]',
              'pl-3.5 pr-9 text-sm text-[hsl(var(--foreground))]',
              'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
              'transition-colors',
              error
                ? 'border-[hsl(var(--destructive))] focus:ring-[hsl(var(--destructive)/0.3)]'
                : 'border-[hsl(var(--border))] focus:border-[hsl(var(--primary))]',
              'disabled:cursor-not-allowed disabled:opacity-50',
              className,
            )}
            aria-invalid={!!error}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {children}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]"
            aria-hidden="true"
          />
        </div>
        {error ? (
          <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p>
        ) : hint ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
        ) : null}
      </div>
    )
  },
)

Select.displayName = 'Select'
