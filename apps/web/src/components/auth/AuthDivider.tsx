/**
 * @file AuthDivider.tsx
 * @description "or" divider between OAuth and email/password auth.
 *
 * @module apps/web/components/auth
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/**
 * Horizontal divider with "or" label for auth forms.
 */
export function AuthDivider() {
  return (
    <div className="flex items-center gap-3" role="separator" aria-label="or">
      <div className="h-px flex-1 bg-[hsl(var(--border))]" aria-hidden="true" />
      <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">or</span>
      <div className="h-px flex-1 bg-[hsl(var(--border))]" aria-hidden="true" />
    </div>
  )
}
