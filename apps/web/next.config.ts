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
  output: 'standalone',   // required for Railway Docker deployment
  eslint: {
    // ESLint runs in CI/pre-commit — don't block production builds
    ignoreDuringBuilds: true,
  },
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
  // instrumentationHook graduated to stable in Next.js 15 — no config flag needed.

  // Permanent redirects for old /auth/* paths that are now at the route root
  async redirects() {
    return [
      { source: '/auth/login',           destination: '/login',    permanent: true },
      { source: '/auth/register',        destination: '/register', permanent: true },
      { source: '/auth/forgot-password', destination: '/forgot-password', permanent: true },
      { source: '/auth/reset-password',  destination: '/reset-password',  permanent: true },
      { source: '/auth/verify-email',    destination: '/verify-email',    permanent: true },
      { source: '/auth/verify-phone',    destination: '/verify-phone',    permanent: true },
    ]
  },
}

export default nextConfig
