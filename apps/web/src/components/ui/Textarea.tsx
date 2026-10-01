/**
 * @file Textarea.tsx
 * @description Shared textarea component with character counter and error state.
 * @module components/ui
 */

import { type TextareaHTMLAttributes, forwardRef } from 'react'
import { cn } from '@/lib/utils'

type TextareaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  error?: string
  label?: string
  hint?: string
  /** Show character count relative to maxLength */
  showCount?: boolean
}

/** Shared textarea with label, error, hint, and optional character counter. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ error, label, hint, showCount = false, className, id, value, ...props }, ref) => {
    const textareaId = id ?? (label ? label.toLowerCase().replace(/\s+/g, '-') : undefined)
    const charCount  = typeof value === 'string' ? value.length : 0
    const maxLength  = props.maxLength

    return (
      <div className="flex flex-col gap-1.5">
        {label && (
          <label
            htmlFor={textareaId}
            className="text-sm font-medium text-[hsl(var(--foreground))]"
          >
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          value={value}
          className={cn(
            'w-full resize-none rounded-[6px] border bg-[hsl(var(--background))]',
            'px-3.5 py-2.5 text-sm text-[hsl(var(--foreground))]',
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
          aria-describedby={error ? `${textareaId}-error` : hint ? `${textareaId}-hint` : undefined}
          {...props}
        />
        <div className="flex items-start justify-between gap-2">
          <div>
            {error ? (
              <p id={`${textareaId}-error`} role="alert" className="text-xs text-[hsl(var(--destructive))]">
                {error}
              </p>
            ) : hint ? (
              <p id={`${textareaId}-hint`} className="text-xs text-[hsl(var(--muted-foreground))]">
                {hint}
              </p>
            ) : null}
          </div>
          {showCount && maxLength != null && (
            <p className="ml-auto text-right text-[10px] text-[hsl(var(--muted-foreground))]">
              {charCount}/{maxLength}
            </p>
          )}
        </div>
      </div>
    )
  },
)

Textarea.displayName = 'Textarea'
