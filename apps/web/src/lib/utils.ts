/**
 * @file utils.ts
 * @description Utility helpers for the web application — cn() class merger and common helpers.
 * @module apps/web/lib
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * Merges Tailwind CSS class names safely, resolving conflicts.
 * @param inputs - Class values to merge
 * @returns Merged class string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}
