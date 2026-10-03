/**
 * @file route.ts
 * @description GET /api/v1/host/companies-house?q=<name|number>
 * Companies House API proxy for business verification.
 * Searches for a UK company by name or registration number.
 * Used during SMB host onboarding to verify business registration.
 *
 * Companies House API key required: COMPANIES_HOUSE_API_KEY env var.
 * Free tier: 600 req/5min. Docs: https://developer.company-information.service.gov.uk
 *
 * @module apps/web/api/v1/host/companies-house
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

import { type NextRequest } from 'next/server'
import { apiResponse, apiError } from '@/lib/api/response'

type CompaniesHouseResult = {
  companyNumber: string
  companyName: string
  companyStatus: string
  companyType: string
  dateOfCreation: string
  registeredOfficeAddress: {
    addressLine1: string
    locality: string
    postalCode: string
  }
}

/** GET /api/v1/host/companies-house — search UK Companies House */
export async function GET(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return apiError('UNAUTHORIZED', 'Authentication required', 401)

  const q = request.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return apiError('VALIDATION_ERROR', 'Query (q) must be at least 2 characters', 400)

  const apiKey = process.env['COMPANIES_HOUSE_API_KEY']
  if (!apiKey) {
    if (process.env.NODE_ENV === 'production') {
      return apiError('LOOKUP_UNAVAILABLE', 'Company lookup is unavailable — please enter your company details manually.', 503)
    }
    // Local development only: a recognisable fake result.
    return apiResponse({
      results: [
        {
          companyNumber: 'DEV12345',
          companyName: q.toUpperCase() + ' LIMITED',
          companyStatus: 'active',
          companyType: 'ltd',
          dateOfCreation: '2020-01-01',
          registeredOfficeAddress: { addressLine1: '1 Example Street', locality: 'London', postalCode: 'SW1A 1AA' },
        },
      ],
      total: 1,
      note: 'Development mode — COMPANIES_HOUSE_API_KEY not configured',
    })
  }

  try {
    const credentials = Buffer.from(`${apiKey}:`).toString('base64')

    // Determine if query looks like a company number (8 chars, alphanumeric)
    const isCompanyNumber = /^[A-Z0-9]{6,8}$/i.test(q)

    let results: CompaniesHouseResult[] = []

    if (isCompanyNumber) {
      // Direct company lookup
      const res = await fetch(
        `https://api.company-information.service.gov.uk/company/${encodeURIComponent(q.toUpperCase())}`,
        { headers: { Authorization: `Basic ${credentials}` }, signal: AbortSignal.timeout(8_000) },
      )
      if (res.ok) {
        const data = await res.json() as Record<string, unknown>
        results = [{
          companyNumber:           String(data['company_number'] ?? ''),
          companyName:             String(data['company_name'] ?? ''),
          companyStatus:           String(data['company_status'] ?? ''),
          companyType:             String(data['type'] ?? ''),
          dateOfCreation:          String(data['date_of_creation'] ?? ''),
          registeredOfficeAddress: {
            addressLine1: String((data['registered_office_address'] as Record<string, unknown>)?.['address_line_1'] ?? ''),
            locality:     String((data['registered_office_address'] as Record<string, unknown>)?.['locality'] ?? ''),
            postalCode:   String((data['registered_office_address'] as Record<string, unknown>)?.['postal_code'] ?? ''),
          },
        }]
      }
    } else {
      // Full-text search
      const searchUrl = new URL('https://api.company-information.service.gov.uk/search/companies')
      searchUrl.searchParams.set('q', q)
      searchUrl.searchParams.set('items_per_page', '10')

      const res = await fetch(searchUrl.toString(), {
        headers: { Authorization: `Basic ${credentials}` },
        signal: AbortSignal.timeout(8_000),
      })

      if (!res.ok) return apiError('UPSTREAM_ERROR', 'Companies House API error', 502)

      const data = await res.json() as { items?: Record<string, unknown>[]; total_results?: number }

      results = (data.items ?? []).map((item) => ({
        companyNumber:           String(item['company_number'] ?? ''),
        companyName:             String(item['title'] ?? ''),
        companyStatus:           String(item['company_status'] ?? ''),
        companyType:             String(item['company_type'] ?? ''),
        dateOfCreation:          String(item['date_of_creation'] ?? ''),
        registeredOfficeAddress: {
          addressLine1: String((item['registered_office_address'] as Record<string, unknown>)?.['address_line_1'] ?? ''),
          locality:     String((item['registered_office_address'] as Record<string, unknown>)?.['locality'] ?? ''),
          postalCode:   String((item['registered_office_address'] as Record<string, unknown>)?.['postal_code'] ?? ''),
        },
      }))
    }

    return apiResponse({ results, total: results.length })
  } catch (err) {
    console.error('[companies-house]', err)
    return apiError('UPSTREAM_ERROR', 'Could not reach Companies House API', 502)
  }
}
