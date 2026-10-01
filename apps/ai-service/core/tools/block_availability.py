"""
@file block_availability.py
@description LangChain tool: block_availability
Adds a blackout date to a host's listing so drivers cannot book it.
Calls POST /api/v1/listings/{listing_id}/blackout.

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


class BlockAvailabilityInput(BaseModel):
    user_id: str = Field(description="Authenticated host user ID")
    listing_id: str = Field(description="UUID of the listing to block")
    date: str = Field(description="Date to block in YYYY-MM-DD format")
    reason: str = Field(default="", description="Optional reason for the block")


async def _block_availability(
    user_id: str,
    listing_id: str,
    date: str,
    reason: str = "",
) -> str:
    """Block a date on a listing to prevent new bookings."""
    try:
        await api_post(
            f"/api/v1/listings/{listing_id}/blackout",
            user_id=user_id,
            body={"date": date, "reason": reason or None},
        )
        return f"Done. {date} is now blocked on your listing. No new bookings can be made for that date."
    except Exception as exc:  # noqa: BLE001
        log.error("block_availability_failed", listing_id=listing_id, date=date, error=str(exc))
        return "I couldn't block that date. Please try again in the app."


block_availability_tool = StructuredTool.from_function(
    coroutine=_block_availability,
    name="block_availability",
    description=(
        "Block a specific date on a host's listing to prevent driver bookings. "
        "Use when the host says they're unavailable, on holiday, or doing maintenance."
    ),
    args_schema=BlockAvailabilityInput,
)
