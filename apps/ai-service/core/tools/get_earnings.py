"""
@file get_earnings.py
@description LangChain tool: get_earnings
Returns driver spend or host earnings for a period.
- Driver: queries completed transactions for the user
- Host: queries payout history

Calls GET /api/v1/bookings/driver (driver) or
      GET /api/v1/host/earnings (host — placeholder until Module G).

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import structlog
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .api_client import api_get

log = structlog.get_logger(__name__)

_PERIODS: dict[str, int] = {
    "today": 1,
    "this_week": 7,
    "this_month": 30,
    "last_month": 60,
    "all_time": 3650,
}


class GetEarningsInput(BaseModel):
    user_id: str = Field(description="Authenticated user ID")
    role: str = Field(default="driver", description="'driver' for spend, 'host' for earnings")
    period: str = Field(
        default="this_month",
        description="Period: today | this_week | this_month | last_month | all_time",
    )


async def _get_earnings(
    user_id: str,
    role: str = "driver",
    period: str = "this_month",
) -> str:
    """Return spend (driver) or earnings (host) for a period."""
    days = _PERIODS.get(period, 30)
    since = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    try:
        if role == "driver":
            result = await api_get(
                "/api/v1/bookings/driver",
                user_id=user_id,
                params={"pageSize": 100, "status": "completed"},
            )
            bookings = result.get("data", [])
            # Filter by period (created_at >= since)
            total_pence = sum(
                b.get("estimatedCostPence", 0)
                for b in bookings
                if b.get("createdAt", "") >= since
            )
            period_label = period.replace("_", " ")
            return (
                f"You spent £{total_pence / 100:.2f} on charging {period_label}."
                if total_pence > 0
                else f"No completed charging sessions {period_label}."
            )
        else:
            # Host earnings — calls dashboard summary when available
            result = await api_get(
                "/api/v1/host/earnings",
                user_id=user_id,
                params={"period": period},
            )
            data = result.get("data", {})
            net_pence = data.get("netEarningsPence", 0)
            sessions = data.get("sessionCount", 0)
            period_label = period.replace("_", " ")
            return (
                f"You earned £{net_pence / 100:.2f} from {sessions} session(s) {period_label}."
                if net_pence > 0
                else f"No earnings recorded {period_label}."
            )
    except Exception as exc:  # noqa: BLE001
        log.error("get_earnings_failed", role=role, period=period, error=str(exc))
        return "I couldn't retrieve your earnings right now."


get_earnings_tool = StructuredTool.from_function(
    coroutine=_get_earnings,
    name="get_earnings",
    description=(
        "Get driver charging spend or host earnings for a time period. "
        "Set role='driver' for spend, role='host' for earnings."
    ),
    args_schema=GetEarningsInput,
)
