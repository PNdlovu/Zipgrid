/**
 * @file colours.ts
 * @description Design token colour constants — mirrors CSS custom properties in globals.css.
 * Use CSS variables in components (var(--primary)), use these only for programmatic access
 * (canvas, SVG, Mapbox layer colours).
 * @module @zipgrid/ui-primitives
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

export const colours = {
  /** Primary accent — Zipgrid green */
  primary: '#00C853',
  /** Light mode background — pure white */
  backgroundLight: '#FFFFFF',
  /** Dark mode background — TRUE black (OLED-optimised) */
  backgroundDark: '#000000',
  /** Night mode background */
  backgroundNight: '#0D0D0D',
  /** Light mode text */
  foregroundLight: '#0A0A0A',
  /** Dark mode text */
  foregroundDark: '#FAFAFA',
  /** Night mode text — warm amber */
  foregroundNight: '#F5E6C8',
  /** Destructive / error red */
  destructive: '#E53E3E',
  /** Border — light mode */
  borderLight: '#E2E2E2',
  /** Border — dark mode */
  borderDark: '#2A2A2A',
} as const

/** Mapbox layer colour constants — used in map components */
export const mapColours = {
  clusterCircle: '#00C853',
  clusterCircleHover: '#00A843',
  pin: '#00C853',
  pinUnavailable: '#9CA3AF',
  route: '#3B82F6',
} as const
