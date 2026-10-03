/**
 * @file page.tsx
 * @description /legal/driver-terms — Driver Responsibilities and Liability.
 * Damage recovery limits and reporting windows come from DisputeService so the
 * page and the platform cannot disagree.
 *
 * @module apps/web/app/(marketing)/legal/driver-terms
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { OPERATOR, PolicyHeader } from '@/components/legal/PolicyHeader'
import { MAX_DAMAGE_CHARGE_PENCE } from '@/domains/trust/DisputeService'

export const metadata: Metadata = {
  title: 'Driver Responsibilities and Liability — Zipgrid',
  description: 'How to use a host’s charger safely, what you are responsible for, and how damage is handled.',
  alternates: { canonical: 'https://zipgrid.co.uk/legal/driver-terms' },
}

const maxDamage = `£${(MAX_DAMAGE_CHARGE_PENCE / 100).toLocaleString('en-GB')}`

/** Page at /legal/driver-terms — Driver Responsibilities and Liability. */
export default function DriverTermsPage() {
  return (
    <>
      <PolicyHeader
        policy="driver_terms"
        summary="You are charging at someone’s home or business. These are the rules for doing that safely, and what happens if something is damaged."
      />

      <h2>1. Before you charge</h2>
      <ul>
        <li>Verify your identity and keep your vehicle details accurate, including the registration number.</li>
        <li>Check that the connector and power suit your vehicle. Only use the host&rsquo;s cable or your own undamaged cable designed for your vehicle; do not use household extension leads or unapproved adapters.</li>
        <li>Keep a valid payment method or enough wallet balance for the booking.</li>
        <li>Keep the motor insurance the law requires. It may not cover damage you cause to someone&rsquo;s property while parked and charging, which is why the rules below matter.</li>
      </ul>

      <h2>2. During the session</h2>
      <ul>
        <li>Arrive and leave within your booked time. Use your arrival code and session PIN; do not share them.</li>
        <li>Park only where the listing says. Do not block driveways, gates or other people.</li>
        <li>Do not use a charger, socket or cable that looks damaged, wet, scorched or hot. Do not open, repair or modify any equipment, reset the host&rsquo;s fuse board or bypass any safety feature.</li>
        <li>If something seems wrong (sparks, smoke, a burning smell, repeated tripping), stop the session in the app, unplug only if it is safe, move away, and call 999 if there is any danger.</li>
        <li>End the session in the app and leave the cable as you found it.</li>
      </ul>

      <h2>3. Reporting a problem</h2>
      <p>
        Report any damage, fault or incident in the <Link href="/help/resolution">Resolution Centre</Link> as soon as you
        can, and within 24 hours. Add photos or video and say what happened. We record the booking and charging-session
        data automatically when you open a case. Reporting damage you caused, promptly and honestly, is always taken into
        account.
      </p>

      <h2>4. What you are responsible for</h2>
      <p>You are responsible for loss or damage you cause during your booking through:</p>
      <ul>
        <li>careless or improper use of the charger, cable or parking space;</li>
        <li>using an incompatible or unsafe cable or adapter, or a vehicle with a known charging fault;</li>
        <li>tampering with equipment or bypassing safety features;</li>
        <li>deliberate damage, or letting someone else use your booking.</li>
      </ul>
      <p>You are not responsible for:</p>
      <ul>
        <li>faults in the host&rsquo;s charger or electrical installation, or normal wear and tear;</li>
        <li>damage that was already there, or that happened outside your booking;</li>
        <li>power cuts and other problems with the electricity supply.</li>
      </ul>

      <h2>5. How damage claims work</h2>
      <ol>
        <li>The host reports damage in the Resolution Centre within 14 days of your booking ending, with photos and a repair quote or invoice.</li>
        <li>We tell you and you can respond with your own account and evidence. We review both, alongside the session data (times, energy, faults recorded by the charger).</li>
        <li>If we find that you caused the damage, we tell you the amount and why. We can charge up to {maxDamage} for a single case. It is taken from your wallet balance first, then your saved card, and paid in full to the host.</li>
        <li>Until a damage charge is paid you cannot make new bookings.</li>
        <li>You can appeal within 14 days by emailing <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a> with the case number. You keep your right to dispute the matter in court.</li>
      </ol>
      <p>
        Losses above {maxDamage}, injuries and serious incidents are handled between the host&rsquo;s insurer and you or
        your insurer. We will share the booking record and evidence with the insurers involved when asked.
      </p>

      <h2>6. Misuse and fraud</h2>
      <p>
        Giving false identity, vehicle or payment details, using a charger outside your booking, faking evidence or
        avoiding payment can lead to suspension or permanent removal, recovery of our costs, and reporting to the police
        where appropriate.
      </p>

      <p className="mt-10 text-sm text-[hsl(var(--muted-foreground))]">
        These responsibilities form part of our <Link href="/legal/terms">Terms of Service</Link>.
      </p>
    </>
  )
}
