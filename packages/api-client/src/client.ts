/**
 * @file client.ts
 * @description Axios API client with auth token injection and error normalisation.
 * @module @zipgrid/api-client
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

import axios from 'axios'

export const apiClient = axios.create({
  baseURL: typeof window !== 'undefined' ? '/api' : process.env['NEXT_PUBLIC_API_URL'] ?? '/api',
  timeout: 10_000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// Inject auth token on each request
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('zipgrid_access_token')
    if (token && config.headers) {
      config.headers['Authorization'] = `Bearer ${token}`
    }
  }
  return config
})

// Normalise error responses
apiClient.interceptors.response.use(
  (response) => response.data?.data ?? response.data,
  (error: unknown) => {
    if (axios.isAxiosError(error) && error.response?.data?.error) {
      return Promise.reject(new Error(error.response.data.error.message))
    }
    return Promise.reject(error)
  },
)
