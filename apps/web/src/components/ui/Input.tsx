/**
 * @file Input.tsx
 * @description Shared text input component with error state support.
 * @module components/ui
 */

import { type InputHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type InputProps = InputHTMLAttributes<HTMLInputElement> & {
  /** Display error styling and show error message below */
  error?: string
  /** Label text rendered above the input */
  label?: string
  /** Hint text rendered below the input (hidden when error is present) */
  hint?: string
}

/** Shared text input with label, error, and hint support. */
export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, label, hint, className, id, ...props }, ref) => {
    const inputId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[hsl(var(--foreground))]"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'h-10 w-full rounded-[6px] border bg-[hsl(var(--background))]',
            'px-3.5 text-sm text-[hsl(var(--foreground))]',
            'placeholder:text-[hsl(var(--muted-foreground))]',
            'focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]',
            'transition-colors',
            error
              ? 'border-[hsl(var(--destructive))] focus:ring-[hsl(var(--destructive)/0.3)]'
              : 'border-[hsl(var(--border))] focus:border-[hsl(var(--primary))]',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
          aria-invalid={!!error}
          aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
          {...props}
        />
        {error ? (
          <p id={`${inputId}-error`} role="alert" className="text-xs text-[hsl(var(--destructive))]">
            {error}
          </p>
        ) : hint ? (
          <p id={`${inputId}-hint`} className="text-xs text-[hsl(var(--muted-foreground))]">
            {hint}
          </p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
