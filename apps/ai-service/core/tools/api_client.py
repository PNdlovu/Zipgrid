"""
@file api_client.py
@description Authenticated HTTP client for the Zipgrid REST API.
All tool functions share this client to call apps/web API routes.

The ai-service authenticates as a service account using
AI_SERVICE_SECRET (server-to-server secret, never exposed to users).
Per-user calls include an X-User-Id header so the web app can
enforce row-level ownership checks.

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

log = structlog.get_logger(__name__)

# Lazily initialised — created once at first call
_client: httpx.AsyncClient | None = None


def _get_base_url() -> str:
    return os.environ.get("ZIPGRID_API_URL", "http://localhost:3000")


def _get_secret() -> str:
    return os.environ.get("AI_SERVICE_SECRET", "")


async def get_client() -> httpx.AsyncClient:
    """Returns a shared async HTTP client (created lazily)."""
    global _client  # noqa: PLW0603
    if _client is None or _client.is_closed:
        _client = httpx.AsyncClient(
            base_url=_get_base_url(),
            headers={
                "X-Service-Secret": _get_secret(),
                "Content-Type": "application/json",
            },
            timeout=httpx.Timeout(10.0, connect=5.0),
        )
    return _client


async def api_get(
    path: str,
    user_id: str,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Authenticated GET to Zipgrid REST API."""
    client = await get_client()
    response = await client.get(
        path,
        params=params,
        headers={"X-User-Id": user_id},
    )
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]


async def api_post(
    path: str,
    user_id: str,
    body: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Authenticated POST to Zipgrid REST API."""
    client = await get_client()
    response = await client.post(
        path,
        json=body or {},
        headers={"X-User-Id": user_id},
    )
    response.raise_for_status()
    return response.json()  # type: ignore[no-any-return]
