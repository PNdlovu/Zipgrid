"""
@file energy_optimise.py
@description Agentic tools: personalised energy optimisation, SMB pricing agent,
review response drafting, predictive maintenance, recurring booking suggestion.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-29
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
from typing import Any

from langchain.tools import tool
from langchain_openai import ChatOpenAI

from .api_client import get_client


# ── Shared LLM for drafting tasks ─────────────────────────────

def _get_llm() -> ChatOpenAI:
    return ChatOpenAI(
        model="gpt-4o",
        temperature=0.4,
        api_key=os.environ.get("OPENAI_API_KEY", ""),  # type: ignore[arg-type]
    )


@tool
async def energy_optimisation_tool(
    user_id: str,
    listing_id: str = "",
) -> str:
    """
    Provide personalised energy optimisation suggestions for a driver.
    Analyses session history, tariff type, and charging patterns to suggest
    the best times to charge and estimated monthly savings.

    Args:
        user_id: Driver user ID
        listing_id: Specific listing context (optional)

    Returns:
        Personalised recommendations with estimated savings.
    """
    client = await get_client()
    api_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")

    try:
        resp = await client.get(
            f"{api_url}/api/v1/account/energy-insights",
            headers={
                "X-User-Id": user_id,
                "X-Service-Secret": os.environ.get("AI_SERVICE_SECRET", ""),
            },
            timeout=8.0,
        )

        if resp.status_code == 200:
            data = resp.json().get("data", {})
            avg_cost  = data.get("avgCostPerKwhPence", 28)
            sessions  = data.get("totalSessions", 0)
            kwh_total = data.get("totalKwhConsumed", 0)
            tariff    = data.get("preferredTariff", "unknown")
            peak_pct  = data.get("peakHoursChargingPct", 0)

            tips = []
            if peak_pct > 40:
                tips.append(f"• {peak_pct:.0f}% of your sessions are during peak hours. Switching to off-peak (23:00–07:00) could save ~40% on energy costs.")
            if tariff not in ("octopus_agile", "octopus_go") and sessions > 3:
                tips.append("• You could save more with Octopus Agile or Octopus Go — these tariffs have cheap overnight rates specifically for EV charging.")
            if avg_cost > 30:
                tips.append(f"• Your average cost is {avg_cost}p/kWh. With smart scheduling on a cheap tariff, this could drop to 10–15p/kWh overnight.")
            if kwh_total > 0 and sessions > 0:
                monthly_kwh = kwh_total / max(1, sessions) * 4
                potential_saving = monthly_kwh * max(0, avg_cost - 12) / 100
                tips.append(f"• Estimated monthly saving potential: £{potential_saving:.2f} by switching to off-peak charging.")

            if not tips:
                return f"Your charging looks well-optimised! Average cost: {avg_cost}p/kWh across {sessions} sessions."

            return "⚡ Energy optimisation suggestions:\n" + "\n".join(tips)
        else:
            return "Could not load energy data. Please try again later."

    except Exception as exc:  # noqa: BLE001
        return f"Energy optimisation service unavailable: {exc}"


@tool
async def smb_pricing_optimisation_tool(
    user_id: str,
    listing_id: str,
) -> str:
    """
    AI-powered pricing suggestion for an SMB host's charger.
    Analyses local demand, utilisation rate, and competitor pricing
    to suggest optimal pricing that maximises revenue.

    Args:
        user_id: Host user ID
        listing_id: The charger listing to optimise pricing for

    Returns:
        Pricing recommendation with rationale and estimated revenue uplift.
    """
    client = await get_client()
    api_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")

    try:
        resp = await client.get(
            f"{api_url}/api/v1/host/analytics?listingId={listing_id}&period=30d",
            headers={
                "X-User-Id": user_id,
                "X-Service-Secret": os.environ.get("AI_SERVICE_SECRET", ""),
            },
            timeout=8.0,
        )

        if resp.status_code == 200:
            data = resp.json().get("data", {})
            summary = data.get("summary", {})
            util    = summary.get("utilisationPct", 0)
            avg_rev = summary.get("avgSessionPence", 0) / 100
            market  = data.get("marketAvgKwhPence", 28)
            current = data.get("currentKwhPricePence", 28)

            llm = _get_llm()
            prompt = (
                f"You are a pricing analyst for an EV charging platform. "
                f"Charger utilisation: {util:.1f}%. "
                f"Current price: {current}p/kWh. "
                f"Market average: {market}p/kWh. "
                f"Average session revenue: £{avg_rev:.2f}. "
                f"Suggest an optimal price in 2 sentences, give a specific pence/kWh number, "
                f"and explain the expected revenue impact. Be concise — this is for a voice response."
            )
            response = await llm.ainvoke(prompt)
            return f"💰 Pricing suggestion for your charger:\n{response.content}"
        else:
            return "Could not load charger analytics. Please try again."

    except Exception as exc:  # noqa: BLE001
        return f"Pricing optimisation unavailable: {exc}"


@tool
async def draft_review_response_tool(
    review_text: str,
    reviewer_name: str,
    star_rating: int,
    listing_title: str,
    host_name: str,
) -> str:
    """
    Draft a professional, personalised response to a driver review.
    The response is warm, acknowledges the feedback, and encourages a return visit.

    Args:
        review_text: The driver's review text
        reviewer_name: First name of the reviewer
        star_rating: Star rating given (1-5)
        listing_title: Name of the listing being reviewed
        host_name: Host's first name for personalisation

    Returns:
        A draft response the host can send or edit.
    """
    llm = _get_llm()
    sentiment = "positive" if star_rating >= 4 else "neutral" if star_rating == 3 else "negative"

    prompt = (
        f"You are helping an EV charging host named {host_name} respond to a review. "
        f"The review is {sentiment} ({star_rating}/5 stars). "
        f"Reviewer: {reviewer_name}. Listing: {listing_title}. "
        f"Review: \"{review_text}\"\n\n"
        f"Write a short, warm, professional response (max 80 words). "
        f"If negative, acknowledge the issue and offer to improve. "
        f"If positive, thank them and invite them back. Never be defensive. "
        f"Start with 'Hi {reviewer_name},'."
    )

    response = await llm.ainvoke(prompt)
    return f"✍️ Draft response:\n\n{response.content}"


@tool
async def predictive_maintenance_tool(
    listing_id: str,
    user_id: str,
) -> str:
    """
    Analyse charger health data and predict maintenance needs.
    Returns actionable maintenance recommendations based on age,
    fault history, and usage patterns.

    Args:
        listing_id: Charger listing ID
        user_id: Host user ID

    Returns:
        Maintenance recommendations with urgency levels.
    """
    client = await get_client()
    api_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")

    try:
        resp = await client.get(
            f"{api_url}/api/v1/host/chargers/health",
            headers={
                "X-User-Id": user_id,
                "X-Service-Secret": os.environ.get("AI_SERVICE_SECRET", ""),
            },
            timeout=8.0,
        )

        if resp.status_code == 200:
            chargers = resp.json().get("data", {}).get("chargers", [])
            charger = next((c for c in chargers if c.get("listingId") == listing_id), None)
            if not charger:
                return "Charger not found. Please check the listing ID."

            recommendations = []
            age      = charger.get("chargerAgeYears")
            faults   = charger.get("faultCount30d", 0)
            score    = charger.get("safetyScore")
            warnings = charger.get("maintenanceWarnings", [])
            auto_p   = charger.get("autoPaused", False)

            if auto_p:
                recommendations.append("🚨 URGENT: Charger auto-paused due to safety score. Immediate inspection required.")
            if faults >= 5:
                recommendations.append(f"⚠️ HIGH: {faults} faults in 30 days — schedule a qualified electrician inspection.")
            elif faults >= 2:
                recommendations.append(f"⚡ MEDIUM: {faults} faults in 30 days — monitor closely, consider preventive check.")
            if age and age >= 8:
                recommendations.append(f"🔧 MEDIUM: Charger is {age} years old — schedule safety inspection and consider upgrade.")
            if score and score < 70:
                recommendations.append(f"🛡 LOW: Safety score is {score}/100 — review safety checklist to improve rating.")
            for w in warnings[:2]:
                recommendations.append(f"ℹ️ {w}")

            if not recommendations:
                return f"✅ Charger health looks good! Safety score: {score}/100. No maintenance actions needed right now."

            return "🔧 Predictive maintenance analysis:\n" + "\n".join(recommendations)
        else:
            return "Could not load charger health data."

    except Exception as exc:  # noqa: BLE001
        return f"Maintenance service unavailable: {exc}"


@tool
async def suggest_recurring_booking_tool(
    user_id: str,
) -> str:
    """
    Analyse driver's booking history and suggest a recurring booking pattern.
    Detects commuter patterns (same slot, same listing) and offers to set up
    automatic weekly bookings.

    Args:
        user_id: Driver user ID

    Returns:
        Recurring booking suggestion based on usage patterns.
    """
    client = await get_client()
    api_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")

    try:
        resp = await client.get(
            f"{api_url}/api/v1/bookings/driver?limit=20&status=completed",
            headers={
                "X-User-Id": user_id,
                "X-Service-Secret": os.environ.get("AI_SERVICE_SECRET", ""),
            },
            timeout=8.0,
        )

        if resp.status_code != 200:
            return "Could not load booking history."

        bookings = resp.json().get("data", {}).get("bookings", [])
        if len(bookings) < 3:
            return "Not enough booking history yet to suggest a recurring pattern. Come back after a few more sessions!"

        # Find most common listing + time slot
        from collections import Counter
        listing_counts: Counter[str] = Counter()
        slot_counts: Counter[str] = Counter()

        for b in bookings:
            listing_id = b.get("listingId", "")
            listing_title = b.get("listingTitle", "a charger")
            if listing_id:
                listing_counts[f"{listing_id}|{listing_title}"] += 1
            start = b.get("scheduledStart", "")
            if start and len(start) >= 16:
                import datetime
                try:
                    dt = datetime.datetime.fromisoformat(start.replace("Z", "+00:00"))
                    slot_counts[f"{dt.strftime('%A')} {dt.strftime('%H:%M')}"] += 1
                except ValueError:
                    pass

        if not listing_counts:
            return "No clear booking pattern found yet."

        top_listing_key, count = listing_counts.most_common(1)[0]
        listing_id, listing_title = top_listing_key.split("|", 1)
        top_slot = slot_counts.most_common(1)[0][0] if slot_counts else "a regular time"

        if count >= 2:
            return (
                f"📅 I noticed you've booked **{listing_title}** {count} times recently, "
                f"often on **{top_slot}**. "
                f"Would you like to set up a weekly recurring booking for that slot? "
                f"Say 'yes, set up weekly' to automate it, or 'no thanks' to skip."
            )
        else:
            return "No strong recurring pattern detected yet — keep charging and I'll suggest one when I see a pattern!"

    except Exception as exc:  # noqa: BLE001
        return f"Pattern analysis unavailable: {exc}"
