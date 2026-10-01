"""
@file get_session.py
@description LangChain tool: get_session
Retrieves current charging session status and metrics.
Calls GET /api/v1/sessions/{session_id}.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import structlog
from langchain_core.tools import StructuredTool
from pydantic import BaseModel, Field

from .api_client import api_get

log = structlog.get_logger(__name__)


class GetSessionInput(BaseModel):
    user_id: str = Field(description="Authenticated user ID")
    session_id: str = Field(description="UUID of the charging session")
    metric: str = Field(
        default="all",
        description="Which metric to return: kwh | cost | duration | soc | all",
    )


async def _get_session(
    user_id: str,
    session_id: str,
    metric: str = "all",
) -> str:
    """Get charging session status and metrics."""
    try:
        result = await api_get(f"/api/v1/sessions/{session_id}", user_id=user_id)
        data = result.get("data", {})

        status = data.get("status", "unknown")
        kwh = (data.get("energyConsumedWh") or 0) / 1000
        cost_pence = data.get("totalCostPence") or 0
        cost_pounds = cost_pence / 100
        soc = data.get("socPercent")
        power_w = data.get("powerW")
        power_kw = power_w / 1000 if power_w else None

        if metric == "kwh":
            return f"You've charged {kwh:.2f} kWh so far."
        if metric == "cost":
            return f"Your session has cost £{cost_pounds:.2f} so far."
        if metric == "soc":
            if soc is not None:
                return f"Your battery is at {soc}%."
            return "Battery level isn't available for this session."
        if metric == "duration":
            started = data.get("startedAt")
            if started:
                from datetime import datetime, timezone
                elapsed = datetime.now(timezone.utc) - datetime.fromisoformat(
                    started.replace("Z", "+00:00")
                )
                mins = int(elapsed.total_seconds() / 60)
                return f"You've been charging for {mins} minutes."
            return "Session hasn't started yet."

        # metric == "all"
        parts = [f"Session is {status}."]
        parts.append(f"Delivered {kwh:.2f} kWh, cost £{cost_pounds:.2f}.")
        if power_kw:
            parts.append(f"Current power: {power_kw:.1f} kW.")
        if soc is not None:
            parts.append(f"Battery at {soc}%.")
        return " ".join(parts)

    except Exception as exc:  # noqa: BLE001
        log.error("get_session_failed", error=str(exc))
        return "I couldn't retrieve your session status right now."


get_session_tool = StructuredTool.from_function(
    coroutine=_get_session,
    name="get_session",
    description=(
        "Get the status and metrics of an active charging session. "
        "Returns kWh delivered, cost, power, battery level, and duration."
    ),
    args_schema=GetSessionInput,
)
