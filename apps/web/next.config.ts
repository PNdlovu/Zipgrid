/**
 * @file next.config.ts
 * @description Next.js 15 configuration for Zipgrid web application.
 * @module apps/web
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  reactStrictMode: true,
  transpilePackages: [
    '@zipgrid/types',
    '@zipgrid/api-client',
    '@zipgrid/utils',
    '@zipgrid/ui-primitives',
  ],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.supabase.co',
      },
      {
        protocol: 'https',
        hostname: '**.vercel-blob.com',
      },
    ],
  },
  experimental: {},
}

export default nextConfig
