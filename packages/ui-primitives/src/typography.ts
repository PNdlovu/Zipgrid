/**
 * @file typography.ts
 * @description Typography scale constants — Inter typeface with defined scale.
 * @module @zipgrid/ui-primitives
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/** Font family stack — Inter is the single typeface across the platform */
export const fontFamily = {
  sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'].join(', '),
  /** Monospace — used for kWh, £, codes, reference numbers */
  mono: ['JetBrains Mono', 'Menlo', 'Consolas', 'monospace'].join(', '),
} as const

export const fontSize = {
  xs: '0.75rem',   // 12px
  sm: '0.875rem',  // 14px
  base: '1rem',    // 16px
  lg: '1.125rem',  // 18px
  xl: '1.25rem',   // 20px
  '2xl': '1.5rem', // 24px
  '3xl': '1.875rem', // 30px
  '4xl': '2.25rem',  // 36px
  '5xl': '3rem',     // 48px
  '6xl': '3.75rem',  // 60px
} as const
