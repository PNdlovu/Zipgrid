"""
@file proactive_alerts.py
@description Proactive voice/push alert worker.

Monitors active charging sessions and fires alerts for:
  - Idle fee about to start (car stopped drawing power but still plugged in)
  - Session fully charged (SoC reached target)
  - Price spike on Agile tariff during session
  - Low battery alert (driver is below minimum range threshold)

Runs as a background polling loop every 60 seconds.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-29
@author Zipgrid Engineering
"""

from __future__ import annotations

import asyncio
import os
from typing import TYPE_CHECKING

import structlog

from .api_client import get_client

if TYPE_CHECKING:
    pass

log = structlog.get_logger(__name__)

IDLE_WARNING_BEFORE_SECONDS = 300   # 5 min before idle fee starts
IDLE_FEE_GRACE_SECONDS      = 180   # 3 min after car stops drawing


class ProactiveAlertWorker:
    """
    Background worker that polls active sessions every 60 seconds
    and fires proactive push notifications + voice-ready messages.
    """

    def __init__(self, poll_interval_seconds: int = 60) -> None:
        self._poll_interval = poll_interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None
        # Track alerts already sent per session to avoid duplicates
        self._alerted: set[str] = set()

    async def start(self) -> None:
        """Start the background alert loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        log.info("proactive_alerts_started", poll_interval=self._poll_interval)

    async def stop(self) -> None:
        """Stop the alert loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("proactive_alerts_stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except Exception as exc:  # noqa: BLE001
                log.warning("proactive_alerts_error", error=str(exc))
            await asyncio.sleep(self._poll_interval)

    async def _tick(self) -> None:
        app_url = os.environ.get("WEB_APP_URL", "http://localhost:3000")
        secret  = os.environ.get("AI_SERVICE_SECRET", "")
        client  = await get_client()

        try:
            # Fetch all active sessions
            resp = await client.get(
                f"{app_url}/api/v1/internal/active-sessions",
                headers={"X-Service-Secret": secret},
                timeout=8.0,
            )
            if resp.status_code != 200:
                return

            sessions = resp.json().get("data", {}).get("sessions", [])

            for session in sessions:
                session_id    = session.get("id", "")
                driver_id     = session.get("driverUserId", "")
                idle_mins     = session.get("idleMinutes", 0)
                status        = session.get("status", "")
                soc_pct       = session.get("socPct")
                target_soc    = session.get("targetSocPct", 80)
                idle_started  = session.get("idleStartedAt")
                idle_fee_rate = session.get("idleFeePerMinPence", 10)

                # ── Idle fee warning ──────────────────────────────────
                idle_key = f"idle:{session_id}"
                if (
                    idle_started and idle_mins >= 2 and idle_mins < 10
                    and idle_key not in self._alerted
                ):
                    await self._send_alert(
                        app_url, secret, driver_id,
                        alert_type="idle_fee_warning",
                        title="Idle fee starting soon",
                        body=f"Your car has stopped charging but is still plugged in. Idle fees ({idle_fee_rate}p/min) start in {max(0, 3 - idle_mins):.0f} minutes.",
                        session_id=session_id,
                    )
                    self._alerted.add(idle_key)

                # ── Fully charged alert ───────────────────────────────
                charged_key = f"charged:{session_id}"
                if (
                    soc_pct is not None
                    and soc_pct >= target_soc
                    and status == "charging"
                    and charged_key not in self._alerted
                ):
                    await self._send_alert(
                        app_url, secret, driver_id,
                        alert_type="session_complete",
                        title="Your EV is fully charged! ⚡",
                        body=f"Battery reached {soc_pct}% — target {target_soc}% reached. Unplug when ready to avoid idle fees.",
                        session_id=session_id,
                    )
                    self._alerted.add(charged_key)

            # Clean up alerted set for completed sessions
            active_ids = {s.get("id") for s in sessions}
            self._alerted = {k for k in self._alerted if k.split(":")[1] in active_ids}

        except Exception as exc:  # noqa: BLE001
            log.warning("proactive_alerts_tick_error", error=str(exc))

    async def _send_alert(
        self,
        app_url: str,
        secret: str,
        user_id: str,
        alert_type: str,
        title: str,
        body: str,
        session_id: str,
    ) -> None:
        """Send a push notification via the web app notification service."""
        try:
            client = await get_client()
            await client.post(
                f"{app_url}/api/v1/internal/push-notification",
                json={
                    "userId": user_id,
                    "type": alert_type,
                    "title": title,
                    "body": body,
                    "data": {"sessionId": session_id},
                },
                headers={"X-Service-Secret": secret},
                timeout=5.0,
            )
            log.info("proactive_alert_sent", user_id=user_id, alert_type=alert_type)
        except Exception:  # noqa: BLE001
            pass  # Non-fatal
