"""
@file schedule_charging.py
@description Agentic tool: tariff-aware auto-scheduling.

Given a driver's target SoC, vehicle battery capacity, charger power,
and their energy tariff, this tool finds the cheapest charging window
before a specified deadline and optionally creates the booking.

Also handles low-battery alert surfacing: when battery_pct is below
the driver's minimum range preference, returns the nearest available
charger immediately.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-29
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
from typing import Any

import httpx
from langchain.tools import tool

from .api_client import get_client


@tool
async def schedule_charging_tool(
    user_id: str,
    target_soc_pct: int = 80,
    current_soc_pct: int = 20,
    battery_capacity_kwh: float = 60.0,
    charger_max_kw: float = 7.4,
    must_finish_by: str = "",
    tariff_type: str = "octopus_agile",
    listing_id: str = "",
) -> str:
    """
    Find the cheapest charging window for a driver using their energy tariff.

    Args:
        user_id: Driver user ID
        target_soc_pct: Target state of charge percentage (default 80)
        current_soc_pct: Current battery percentage
        battery_capacity_kwh: Vehicle battery capacity in kWh
        charger_max_kw: Charger maximum power in kW
        must_finish_by: ISO 8601 datetime the charge must finish by (e.g. '2026-09-29T07:00:00Z')
        tariff_type: Energy tariff type (octopus_agile|octopus_go|economy_7|edf_goelectric|eon_drive|flat)
        listing_id: Specific listing to optimise for (optional — uses driver's saved listings if empty)

    Returns:
        Human-readable scheduling recommendation with optimal window and estimated cost.
    """
    client = await get_client()
    api_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")

    # Calculate kWh needed
    kwh_needed = battery_capacity_kwh * ((target_soc_pct - current_soc_pct) / 100)
    kwh_needed = max(0.5, round(kwh_needed, 2))

    try:
        resp = await client.post(
            f"{api_url}/api/v1/tariffs/optimise",
            json={
                "userId": user_id,
                "tariffType": tariff_type,
                "targetKwh": kwh_needed,
                "chargerMaxKw": charger_max_kw,
                "mustFinishBy": must_finish_by or None,
                "listingId": listing_id or None,
            },
            headers={"X-Service-Secret": os.environ.get("AI_SERVICE_SECRET", "")},
            timeout=10.0,
        )

        if resp.status_code == 200:
            data = resp.json().get("data", {})
            window = data.get("window", {})
            if window:
                start = window.get("from", "unknown")[:16].replace("T", " ")
                end   = window.get("to", "unknown")[:16].replace("T", " ")
                cost  = window.get("estimatedCostPence", 0) / 100
                kwh   = window.get("estimatedKwh", 0)
                avg_p = window.get("avgPricePerKwhPence", 0)
                is_opt = window.get("isOptimal", False)

                result = (
                    f"✅ Optimal charging window found:\n"
                    f"  Start: {start} UTC\n"
                    f"  End:   {end} UTC\n"
                    f"  Energy: {kwh:.1f} kWh at {avg_p}p/kWh average\n"
                    f"  Estimated cost: £{cost:.2f}\n"
                )
                if is_opt:
                    result += "  💚 This is cheaper than the daily average rate.\n"
                return result
            else:
                return "No suitable charging window found before the deadline. Try a longer deadline or a different charger."
        else:
            return f"Could not calculate optimal window (status {resp.status_code}). Please try again."

    except Exception as exc:  # noqa: BLE001
        return f"Scheduling service temporarily unavailable: {exc}"


@tool
async def low_battery_alert_tool(
    user_id: str,
    current_battery_pct: int,
    current_lat: float,
    current_lng: float,
    vehicle_range_km: float = 250.0,
) -> str:
    """
    Surface the nearest available charger when driver battery is critically low.

    Args:
        user_id: Driver user ID
        current_battery_pct: Current battery percentage (1-100)
        current_lat: Driver's current latitude
        current_lng: Driver's current longitude
        vehicle_range_km: Vehicle's full-charge range in km

    Returns:
        Nearest available charger with distance and booking instructions.
    """
    client = await get_client()
    api_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")

    # Calculate max driveable range at current battery
    max_range_km = vehicle_range_km * (current_battery_pct / 100) * 0.85  # 15% safety margin
    max_range_metres = int(max_range_km * 1000)

    urgency = "critical" if current_battery_pct <= 10 else "low" if current_battery_pct <= 20 else "warning"

    try:
        resp = await client.get(
            f"{api_url}/api/v1/listings/nearby",
            params={
                "lat": current_lat,
                "lng": current_lng,
                "radiusMetres": max_range_metres,
                "limit": 3,
                "status": "active",
            },
            timeout=8.0,
        )

        if resp.status_code == 200:
            listings = resp.json().get("data", {}).get("listings", [])
            if not listings:
                return (
                    f"⚠️ Battery at {current_battery_pct}% — no Zipgrid chargers within reachable range ({max_range_km:.0f} km). "
                    f"Consider using the emergency SOS feature to alert nearby hosts, or check the map for public chargers."
                )

            nearest = listings[0]
            dist_km = nearest.get("distanceKm", 0)
            title   = nearest.get("title", "Nearby charger")
            listing_id = nearest.get("id", "")
            power   = nearest.get("maxPowerKw", 0)
            instant = nearest.get("instantBookEnabled", False)

            alert_emoji = "🆘" if urgency == "critical" else "⚡"
            msg = (
                f"{alert_emoji} Battery at {current_battery_pct}% — "
                f"nearest available charger: **{title}** ({dist_km:.1f} km away, {power} kW). "
            )
            if instant:
                msg += f"It supports instant booking — say 'book it' to reserve it now. Listing ID: {listing_id}"
            else:
                msg += f"Request to book available. Listing ID: {listing_id}"

            if len(listings) > 1:
                msg += f"\n\n{len(listings) - 1} other charger{'s' if len(listings) > 2 else ''} also within range."

            return msg
        else:
            return f"Could not find nearby chargers (status {resp.status_code})."

    except Exception as exc:  # noqa: BLE001
        return f"Location service temporarily unavailable: {exc}"
