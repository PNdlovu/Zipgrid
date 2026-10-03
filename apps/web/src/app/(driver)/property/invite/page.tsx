/**
 * @file page.tsx
 * @description /property/invite?token= — accept a resident invite from the
 * emailed link. Signed-out visitors are sent to /login and returned here.
 *
 * @module apps/web/app/(driver)/property/invite
 */

'use client'

import { Suspense, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Building2, Loader2 } from 'lucide-react'
import type { InvitePreview } from '@/domains/property/PropertyService'
import { propertyApi } from '@/components/property/api'
import { primaryButton } from '@/components/property/PropertyForm'

function InviteContent() {
  const token = useSearchParams().get('token') ?? ''
  const router = useRouter()
  const [invite, setInvite] = useState<InvitePreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    propertyApi<InvitePreview>(`/invite?token=${encodeURIComponent(token)}`)
      .then(setInvite)
      .catch(() => setError('This invite link is not valid. Check you copied the whole link from the email.'))
  }, [token])

  const accept = async () => {
    setAccepting(true)
    setError(null)
    try {
      await propertyApi('/invite/accept', { method: 'POST', body: { token } })
      router.push('/property')
    } catch (e) {
      setError((e as Error).message)
      setAccepting(false)
    }
  }

  if (!invite && !error) {
    return <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-[hsl(var(--muted-foreground))]" aria-label="Loading" /></div>
  }

  return (
    <div className="flex flex-col items-center gap-4 rounded-lg border border-[hsl(var(--border))] p-8 text-center">
      <Building2 className="h-10 w-10 text-[hsl(var(--primary))]" strokeWidth={1.5} aria-hidden="true" />
      {invite && (
        <>
          <h1 className="text-xl font-bold">Join {invite.propertyName}</h1>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            {invite.city}{invite.unitNumber ? ` · ${invite.unitNumber}` : ''} · sent to {invite.email}
          </p>
          {invite.state === 'valid' && (
            <>
              <p className="text-sm">As a resident you get the building&apos;s resident booking access and any resident discount.</p>
              <button type="button" className={primaryButton} disabled={accepting} onClick={() => void accept()}>
                {accepting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />} Accept invite
              </button>
            </>
          )}
          {invite.state === 'expired' && (
            <p className="text-sm">This invite has expired. Ask your property manager to resend it.</p>
          )}
          {invite.state === 'used' && (
            <p className="text-sm">
              This invite has already been used. <Link href="/property" className="underline">Go to My building</Link>
            </p>
          )}
        </>
      )}
      {error && <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p>}
    </div>
  )
}

/** Resident invite accept page. */
export default function PropertyInvitePage() {
  return (
    <div className="mx-auto max-w-md px-4 py-10">
      <Suspense>
        <InviteContent />
      </Suspense>
    </div>
  )
}
