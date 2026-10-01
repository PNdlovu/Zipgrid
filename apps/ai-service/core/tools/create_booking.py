"""
@file create_booking.py
@description LangChain tool: create_booking
Creates a new booking for a driver. Requires safety confirmation gate
before execution (handled by agent.py — this tool only executes
after the user has confirmed).

Calls POST /api/v1/bookings.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import structlog
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .api_client import api_post

log = structlog.get_logger(__name__)


class CreateBookingInput(BaseModel):
    user_id: str = Field(description="Authenticated driver user ID")
    listing_id: str = Field(description="UUID of the charger listing to book")
    vehicle_id: str = Field(description="UUID of the driver's vehicle")
    scheduled_start: str = Field(description="ISO 8601 start datetime e.g. 2026-09-27T10:00:00Z")
    scheduled_end: str = Field(description="ISO 8601 end datetime e.g. 2026-09-27T12:00:00Z")
    payment_method_id: str = Field(description="Stripe payment method ID (pm_xxx)")


async def _create_booking(
    user_id: str,
    listing_id: str,
    vehicle_id: str,
    scheduled_start: str,
    scheduled_end: str,
    payment_method_id: str,
) -> str:
    """Create a booking for the driver after confirmation."""
    try:
        result = await api_post(
            "/api/v1/bookings",
            user_id=user_id,
            body={
                "listingId": listing_id,
                "vehicleId": vehicle_id,
                "scheduledStart": scheduled_start,
                "scheduledEnd": scheduled_end,
                "paymentMethodId": payment_method_id,
            },
        )
        data = result.get("data", {})
        booking_id = data.get("id", "unknown")
        pin = data.get("sessionPin") or data.get("driverArrivalCode", "")
        status = data.get("status", "confirmed")
        return (
            f"Booking {status}. ID: {booking_id[:8].upper()}. "
            + (f"Your PIN is {pin}." if pin else "PIN will appear in your bookings.")
        )
    except Exception as exc:  # noqa: BLE001
        log.error("create_booking_failed", error=str(exc))
        return "I couldn't create the booking. Please try again or use the app."


create_booking_tool = StructuredTool.from_function(
    coroutine=_create_booking,
    name="create_booking",
    description=(
        "Create a new EV charging booking. "
        "Only call this AFTER the user has explicitly confirmed. "
        "Requires listing_id, vehicle_id, start/end datetime, and payment_method_id."
    ),
    args_schema=CreateBookingInput,
)
