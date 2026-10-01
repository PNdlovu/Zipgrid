"""
@file search_listings.py
@description LangChain tool: search_listings
Searches for active charger listings near a location or by filters.
Calls GET /api/v1/listings with geo + filter params.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
from typing import Any

import httpx
import structlog
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .api_client import api_get

log = structlog.get_logger(__name__)

# Geocoding: in production use Mapbox Geocoding API.
# Here we fall back to a hardcoded London centroid when geocoding fails.
_MAPBOX_TOKEN = os.environ.get("NEXT_PUBLIC_MAPBOX_TOKEN", "")
_LONDON_LAT = 51.5074
_LONDON_LNG = -0.1278


async def _geocode(location: str) -> tuple[float, float]:
    """Resolve a location string to (lat, lng) via Mapbox Geocoding API."""
    if not _MAPBOX_TOKEN or not location:
        return _LONDON_LAT, _LONDON_LNG
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            url = f"https://api.mapbox.com/geocoding/v5/mapbox.places/{location}.json"
            resp = await client.get(
                url,
                params={
                    "access_token": _MAPBOX_TOKEN,
                    "country": "GB",
                    "limit": 1,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            features = data.get("features", [])
            if features:
                lng, lat = features[0]["center"]
                return float(lat), float(lng)
    except Exception:  # noqa: BLE001
        log.warning("geocode_failed", location=location)
    return _LONDON_LAT, _LONDON_LNG


class SearchListingsInput(BaseModel):
    user_id: str = Field(description="Authenticated user ID")
    location: str = Field(default="", description="Location name or postcode")
    plug_type: str = Field(default="any", description="Connector type filter")
    charger_level: str = Field(default="any", description="Charger level filter")
    max_price_pence: int | None = Field(default=None, description="Max price per kWh in pence")
    radius_metres: int = Field(default=10000, description="Search radius in metres")


async def _search_listings(
    user_id: str,
    location: str = "",
    plug_type: str = "any",
    charger_level: str = "any",
    max_price_pence: int | None = None,
    radius_metres: int = 10000,
) -> str:
    """Search for charger listings near a location."""
    lat, lng = await _geocode(location)

    params: dict[str, Any] = {
        "lat": lat,
        "lng": lng,
        "radius": radius_metres,
        "pageSize": 5,
    }
    if plug_type != "any":
        params["plugTypes"] = plug_type
    if charger_level != "any":
        params["chargerLevel"] = charger_level
    if max_price_pence is not None:
        params["maxPrice"] = max_price_pence

    try:
        result = await api_get("/api/v1/listings", user_id=user_id, params=params)
        listings = result.get("data", [])
        if not listings:
            return f"No chargers found near {location or 'your location'}."

        lines = [f"Found {len(listings)} charger(s) near {location or 'you'}:"]
        for i, lst in enumerate(listings[:5], 1):
            price = lst.get("pricePerKwhPence")
            price_str = f"£{price / 100:.2f}/kWh" if price else "price varies"
            lines.append(
                f"{i}. {lst['title']} ({lst.get('city', '')}) — "
                f"{lst.get('maxPowerKw', '?')}kW · {price_str} · ID: {lst['id']}"
            )
        return "\n".join(lines)
    except Exception as exc:  # noqa: BLE001
        log.error("search_listings_failed", error=str(exc))
        return "Sorry, I couldn't search for chargers right now."


search_listings_tool = StructuredTool.from_function(
    coroutine=_search_listings,
    name="search_listings",
    description=(
        "Search for active EV charger listings near a location. "
        "Returns up to 5 results with title, city, power, and price."
    ),
    args_schema=SearchListingsInput,
)
