/**
 * @file AuthInput.tsx
 * @description Accessible form input for auth pages.
 * Shows label, optional helper text, error message, and password visibility toggle.
 *
 * @module apps/web/components/auth
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

'use client'

import { forwardRef, useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'

type AuthInputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  label: string
  error?: string | undefined
  hint?: string | undefined
}

/**
 * Auth form input with label, error, and password toggle.
 * @param props.label - Visible label text
 * @param props.error - Validation error message
 * @param props.hint - Optional helper text below the input
 */
export const AuthInput = forwardRef<HTMLInputElement, AuthInputProps>(
  ({ label, error, hint, className, type, id, ...props }, ref) => {
    const [showPassword, setShowPassword] = useState(false)
    const isPassword = type === 'password'
    const inputId = id ?? label.toLowerCase().replace(/\s+/g, '-')
    const errorId = `${inputId}-error`
    const hintId = `${inputId}-hint`

    return (
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor={inputId}
          className="text-sm font-medium text-[hsl(var(--foreground))]"
        >
          {label}
        </label>

        <div className="relative">
          <input
            ref={ref}
            id={inputId}
            type={isPassword && showPassword ? 'text' : type}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={
              [error ? errorId : null, hint ? hintId : null].filter(Boolean).join(' ') || undefined
            }
            className={cn(
              'h-11 w-full rounded-[6px] border bg-[hsl(var(--background))] px-3.5 text-sm',
              'text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))]',
              'transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring)/0.4)]',
              error
                ? 'border-[hsl(var(--destructive))] focus:border-[hsl(var(--destructive))]'
                : 'border-[hsl(var(--border))] focus:border-[hsl(var(--primary))]',
              isPassword && 'pr-11',
              className,
            )}
            {...props}
          />

          {isPassword && (
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
              tabIndex={-1}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
            >
              {showPassword ? (
                <EyeOff className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Eye className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          )}
        </div>

        {hint && !error && (
          <p id={hintId} className="text-xs text-[hsl(var(--muted-foreground))]">
            {hint}
          </p>
        )}
        {error && (
          <p id={errorId} role="alert" className="text-xs text-[hsl(var(--destructive))]">
            {error}
          </p>
        )}
      </div>
    )
  },
)
AuthInput.displayName = 'AuthInput'
