/**
 * @file page.tsx
 * @description /legal/host-terms — Host Terms and Protection. Zipgrid does not
 * insure hosts: hosts keep their own cover; Zipgrid verifies drivers, secures
 * payment, keeps the session record, reviews claims and recovers damage from
 * drivers at fault (DisputeService). Linked from host onboarding.
 *
 * @module apps/web/app/(marketing)/legal/host-terms
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { OPERATOR, PolicyHeader } from '@/components/legal/PolicyHeader'
import { DAMAGE_REPORT_WINDOW_DAYS, MAX_DAMAGE_CHARGE_PENCE } from '@/domains/trust/DisputeService'

export const metadata: Metadata = {
  title: 'Host Terms and Protection — Zipgrid',
  description: 'What hosts agree to when sharing a charger on Zipgrid, the cover hosts need, and how Zipgrid protects hosts when something goes wrong.',
  alternates: { canonical: 'https://zipgrid.co.uk/legal/host-terms' },
}

const maxDamage = `£${(MAX_DAMAGE_CHARGE_PENCE / 100).toLocaleString('en-GB')}`

/** Page at /legal/host-terms — Host Terms and Protection. */
export default function HostTermsPage() {
  return (
    <>
      <PolicyHeader
        policy="host_terms"
        summary="What you agree to when you share a charger on Zipgrid, the insurance you need, and what we do to protect you when a driver causes a problem."
      />

      <h2>1. Zipgrid does not insure you</h2>
      <p>
        Zipgrid is a booking and payment platform, not an insurer. Keep your own home or buildings insurance and public
        liability cover, and tell your insurer that you let other drivers use your charger through Zipgrid. Some policies
        need an amendment, and not telling your insurer could affect a claim.{' '}
        <Link href="/host/settings/insurance">Settings → Insurance</Link> has a letter you can send them.
      </p>

      <h2>2. What you agree to</h2>
      <ul>
        <li>You own the property or have permission from the owner, landlord or managing agent to share the charger and parking space.</li>
        <li>Your charger was installed by a qualified electrician (for example NICEIC, NAPIT or ECA registered) to the current wiring regulations (BS 7671), with RCD protection, and you hold the installation certificate.</li>
        <li>You keep the charger, cable and parking space safe and in good repair, and you pause your listing straight away if you know of a fault.</li>
        <li>Your listing is accurate: connector, power, price, location, access instructions and availability.</li>
        <li>You do not modify the charger in ways the manufacturer does not allow, and you do not let unverified people use it through Zipgrid.</li>
        <li>You complete the safety checklist honestly. Chargers are scored daily on installation, RCD protection, fault history and complaints; a low score pauses a listing for review.</li>
      </ul>

      <h2>3. How Zipgrid protects you</h2>
      <ul>
        <li><strong>Verified drivers.</strong> Every driver verifies their identity before booking, and you see who is coming and their vehicle.</li>
        <li><strong>Payment secured first.</strong> A card hold or wallet reservation is in place before each session. If a session costs more than the hold, you are still paid in full and we collect the difference from the driver.</li>
        <li><strong>A record of every booking.</strong> Who booked, when, the arrival code used, and the charger&rsquo;s session data (start and end times, energy and any fault codes). It is captured automatically when a case is opened.</li>
        <li><strong>Damage recovery.</strong> If a driver damages your charger or property, we recover the cost from them (see section 5). You do not need to chase the driver.</li>
        <li><strong>Consequences for drivers.</strong> Drivers who cause damage, misuse equipment or break the rules can be suspended or removed.</li>
      </ul>

      <h2>4. Reporting a problem</h2>
      <ul>
        <li>If anyone is hurt or in danger, call 999 first.</li>
        <li>
          Report damage or a problem with a driver in the <Link href="/help/resolution">Resolution Centre</Link>, from the
          booking. Damage must be reported within {DAMAGE_REPORT_WINDOW_DAYS} days of the booking ending.
        </li>
        <li>Add photos or video of the damage, and a repair quote or invoice. Photos of the charger in good condition before the booking help.</li>
        <li>We acknowledge safety problems within 1 hour and other cases within 24 hours, and aim to decide damage claims within 10 business days.</li>
      </ul>

      <h2>5. Damage recovery from drivers</h2>
      <ol>
        <li>We tell the driver about your report and give them the chance to respond.</li>
        <li>We review the evidence from both of you with the booking and session record.</li>
        <li>If we find the driver caused the damage, we charge them the reasonable cost of repair or replacement, up to {maxDamage} per case. It is taken from their wallet, then their saved card, and they cannot book again until it is paid.</li>
        <li>What we recover is added to your earnings in full, with no commission, and paid out with your next payout.</li>
        <li>For losses above {maxDamage}, injuries or serious incidents, claim through your own insurer. We will provide the booking record and evidence to your insurer, and they may recover the cost from the driver.</li>
      </ol>

      <h3>What damage recovery does not cover</h3>
      <ul>
        <li>Damage that was already there, normal wear and tear, or damage not caused during a Zipgrid booking.</li>
        <li>Faults in your own charger or electrical installation, or damage caused by not maintaining them.</li>
        <li>Lost earnings while a charger is out of action.</li>
        <li>Damage to a driver&rsquo;s vehicle (that is between the driver, you and your insurers).</li>
        <li>Power cuts, storms, floods and other events outside anyone&rsquo;s control.</li>
      </ul>

      <h2>6. Your responsibility to drivers</h2>
      <p>
        You are responsible for the safety of your charger and parking space. If a driver or their vehicle is harmed
        because of a fault in your equipment or premises, that is a matter for you and your public liability insurer. A
        false safety declaration can lead to your listings being removed.
      </p>

      <h2>7. Earnings</h2>
      <p>
        Our commission is set by your plan and deducted from each session before payout; see the{' '}
        <Link href="/legal/terms">Terms of Service</Link>. You are responsible for declaring your earnings to HMRC.
      </p>

      <p className="mt-10 text-sm text-[hsl(var(--muted-foreground))]">
        These terms form part of our <Link href="/legal/terms">Terms of Service</Link>. Questions:{' '}
        <a href={`mailto:${OPERATOR.supportEmail}`}>{OPERATOR.supportEmail}</a>.
      </p>
    </>
  )
}
