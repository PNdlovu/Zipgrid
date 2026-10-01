/**
 * @file ErrorBoundary.tsx
 * @description React error boundary — catches render errors and shows a fallback UI.
 * Prevents a single component crash from taking down the entire page.
 * @module components/shared
 */

'use client'

import { Component, type ReactNode, type ErrorInfo } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

type Props = {
  children: ReactNode
  /** Custom fallback UI. Receives the error and a reset function. */
  fallback?: (error: Error, reset: () => void) => ReactNode
}

type State = {
  error: Error | null
}

/**
 * Class-based React error boundary.
 * Wrap any subtree that might throw during rendering.
 *
 * @example
 * <ErrorBoundary>
 *   <SomethingRisky />
 * </ErrorBoundary>
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack)
  }

  reset = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    const { children, fallback } = this.props

    if (error) {
      if (fallback) return fallback(error, this.reset)

      return (
        <div
          role="alert"
          className="flex flex-col items-center gap-4 rounded-[8px] border border-[hsl(var(--destructive)/0.3)] bg-[hsl(var(--destructive)/0.06)] p-8 text-center"
        >
          <AlertTriangle
            className="h-8 w-8 text-[hsl(var(--destructive))]"
            aria-hidden="true"
            strokeWidth={1.5}
          />
          <div>
            <p className="text-sm font-semibold text-[hsl(var(--foreground))]">
              Something went wrong
            </p>
            <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
              {error.message || 'An unexpected error occurred.'}
            </p>
          </div>
          <button
            type="button"
            onClick={this.reset}
            className="flex items-center gap-2 rounded-[6px] border border-[hsl(var(--border))] px-4 py-2 text-sm font-medium text-[hsl(var(--foreground))] hover:bg-[hsl(var(--secondary))]"
          >
            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            Try again
          </button>
        </div>
      )
    }

    return children
  }
}
