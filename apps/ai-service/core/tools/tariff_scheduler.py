"""
@file tariff_scheduler.py
@description Intraday smart tariff schedule auto-update agent.

Polls the Octopus Agile API every 30 minutes and automatically updates
charging schedules for drivers who have opted into AI auto-scheduling.

When Agile prices spike above 30p/kWh, sends a proactive voice alert.
When prices drop below 12p/kWh, surfaces a "great time to charge" notification.

@module apps/ai-service/core/tools
@version 0.1.0
@since 2026-09-29
@author Zipgrid Engineering
"""

from __future__ import annotations

import asyncio
import os
from datetime import datetime, timezone

import structlog

from .api_client import get_client

log = structlog.get_logger(__name__)

AGILE_PRICE_SPIKE_THRESHOLD_P = 30  # pence/kWh — send spike alert above this
AGILE_PRICE_CHEAP_THRESHOLD_P = 12  # pence/kWh — send "good time to charge" below this


class TariffSchedulerAgent:
    """
    Background agent that monitors Agile tariff prices intraday and:
    1. Updates driver auto-schedules when prices change significantly
    2. Sends proactive alerts for spikes and cheap slots
    3. Polls every 30 minutes (Agile prices update every half-hour)
    """

    def __init__(self, poll_interval_seconds: int = 1800) -> None:
        self._poll_interval = poll_interval_seconds
        self._running = False
        self._task: asyncio.Task | None = None
        self._last_prices: dict[str, float] = {}  # slot_start → pence/kWh

    async def start(self) -> None:
        """Start the background polling loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._loop())
        log.info("tariff_scheduler_started", poll_interval=self._poll_interval)

    async def stop(self) -> None:
        """Stop the background polling loop."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        log.info("tariff_scheduler_stopped")

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except Exception as exc:  # noqa: BLE001
                log.warning("tariff_scheduler_error", error=str(exc))
            await asyncio.sleep(self._poll_interval)

    async def _tick(self) -> None:
        """Fetch current Agile prices and trigger alerts / schedule updates."""
        api_key  = os.environ.get("OCTOPUS_API_KEY", "")
        app_url  = os.environ.get("WEB_APP_URL", "http://localhost:3000")
        secret   = os.environ.get("AI_SERVICE_SECRET", "")

        if not api_key:
            log.debug("tariff_scheduler_skip", reason="OCTOPUS_API_KEY not set")
            return

        # Fetch next 4 half-hour slots from Octopus Agile
        now = datetime.now(timezone.utc)
        date_str = now.strftime("%Y-%m-%dT%H:00:00Z")

        try:
            client = await get_client()
            agile_resp = await client.get(
                "https://api.octopus.energy/v1/products/AGILE-FLEX-22-11-25/"
                "electricity-tariffs/E-1R-AGILE-FLEX-22-11-25-A/standard-unit-rates/",
                params={"period_from": date_str},
                headers={"Authorization": f"Basic {__import__('base64').b64encode(f'{api_key}:'.encode()).decode()}"},
                timeout=10.0,
            )

            if agile_resp.status_code != 200:
                return

            results = agile_resp.json().get("results", [])
            if not results:
                return

            # Check for price spike or cheap window
            for slot in results[:4]:  # next 2 hours
                price = slot.get("value_inc_vat", 0)
                slot_start = slot.get("valid_from", "")
                prev_price = self._last_prices.get(slot_start, price)

                spike  = price > AGILE_PRICE_SPIKE_THRESHOLD_P
                cheap  = price < AGILE_PRICE_CHEAP_THRESHOLD_P
                jumped = prev_price <= AGILE_PRICE_SPIKE_THRESHOLD_P and spike
                dropped = prev_price >= AGILE_PRICE_CHEAP_THRESHOLD_P and cheap

                self._last_prices[slot_start] = price

                if jumped:
                    # Price spike alert — notify drivers who are currently charging
                    await self._send_platform_alert(
                        app_url, secret,
                        alert_type="price_spike",
                        message=f"⚡ Electricity price spike: {price:.0f}p/kWh now. If on a session, consider stopping soon.",
                        price_pence=price,
                    )
                    log.info("tariff_spike_alert_sent", price=price)

                if dropped:
                    # Cheap window alert — notify drivers with auto-schedule enabled
                    await self._send_platform_alert(
                        app_url, secret,
                        alert_type="cheap_window",
                        message=f"🌙 Cheap charging window: {price:.0f}p/kWh right now — great time to charge!",
                        price_pence=price,
                    )
                    log.info("tariff_cheap_alert_sent", price=price)

            log.debug("tariff_scheduler_tick", slots_checked=len(results[:4]))

        except Exception as exc:  # noqa: BLE001
            log.warning("tariff_scheduler_tick_error", error=str(exc))

    async def _send_platform_alert(
        self,
        app_url: str,
        secret: str,
        alert_type: str,
        message: str,
        price_pence: float,
    ) -> None:
        """POST a tariff alert to the web app notification service."""
        try:
            client = await get_client()
            await client.post(
                f"{app_url}/api/v1/internal/tariff-alert",
                json={"alertType": alert_type, "message": message, "pricePence": price_pence},
                headers={"X-Service-Secret": secret},
                timeout=5.0,
            )
        except Exception:  # noqa: BLE001
            pass  # Non-fatal
