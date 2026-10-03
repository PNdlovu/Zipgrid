/**
 * @file api.ts
 * @description Client helper for the /api/v1/property routes: returns the
 * response data, or throws an Error carrying the API's message.
 *
 * @module components/property
 */

type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }

/** Calls a property API route and unwraps the `{ success, data }` envelope. */
export async function propertyApi<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(`/api/v1/property${path}`, {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init?.body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null) as Envelope<T> | null
  if (!json) throw new Error('Something went wrong. Please try again.')
  if (!json.success) throw new Error(json.error.message)
  return json.data
}

/** Formats pence as £x.xx. */
export const pounds = (pence: number) => `£${(pence / 100).toFixed(2)}`
