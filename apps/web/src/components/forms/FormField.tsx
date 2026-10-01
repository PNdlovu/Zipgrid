/**
 * @file FormField.tsx
 * @description Composable form field wrapper — handles label, hint, error layout.
 * Wraps any input control (Input, Select, Textarea, custom) in a consistent layout.
 * @module components/forms
 */

import { type ReactNode, useId } from 'react'
import { cn } from '@/lib/utils'

type FormFieldProps = {
  label: string
  /** When true, appends " (optional)" to the label */
  optional?: boolean
  hint?: string
  error?: string
  children: (id: string) => ReactNode
  className?: string
}

/**
 * Form field layout wrapper.
 * Passes a stable generated `id` to the child render function so the
 * label `htmlFor` and the input `id` always match.
 *
 * @example
 * <FormField label="Email" error={errors.email}>
 *   {(id) => <Input id={id} type="email" {...register('email')} />}
 * </FormField>
 */
export function FormField({ label, optional, hint, error, children, className }: FormFieldProps) {
  const id = useId()

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label
        htmlFor={id}
        className="text-sm font-medium text-[hsl(var(--foreground))]"
      >
        {label}
        {optional && (
          <span className="ml-1 text-[hsl(var(--muted-foreground))] font-normal">(optional)</span>
        )}
      </label>

      {children(id)}

      {error ? (
        <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{error}</p>
      ) : hint ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{hint}</p>
      ) : null}
    </div>
  )
}
