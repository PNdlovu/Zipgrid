"""
@file stop_session.py
@description LangChain tool: stop_session
Sends a RemoteStop command to end an active charging session.
Calls POST /api/v1/sessions/{session_id}/stop.
Requires safety confirmation before execution.

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


class StopSessionInput(BaseModel):
    user_id: str = Field(description="Authenticated user ID")
    session_id: str = Field(description="UUID of the session to stop")


async def _stop_session(user_id: str, session_id: str) -> str:
    """Stop an active charging session via OCPP RemoteStop."""
    try:
        result = await api_post(
            f"/api/v1/sessions/{session_id}/stop",
            user_id=user_id,
        )
        data = result.get("data", {})
        status = data.get("status", "finishing")
        return f"Stop command sent. Session is now {status}. Payment will be captured automatically."
    except Exception as exc:  # noqa: BLE001
        log.error("stop_session_failed", session_id=session_id, error=str(exc))
        return "I couldn't stop the session. Please use the Stop button in the app."


stop_session_tool = StructuredTool.from_function(
    coroutine=_stop_session,
    name="stop_session",
    description=(
        "Stop an active EV charging session. "
        "Sends an OCPP RemoteStop command. "
        "Only call this AFTER the user has explicitly confirmed they want to stop."
    ),
    args_schema=StopSessionInput,
)
