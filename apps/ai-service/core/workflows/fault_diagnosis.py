"""
@file fault_diagnosis.py
@description Agentic fault-diagnosis workflow.

Triggered when:
  - OCPP service receives a Faulted StatusNotification
  - ocpp_event_log inserts a row with event_type = 'Faulted' AND resolved = false

Workflow steps
--------------
1. Poll for unprocessed faults from the DB (every 60s via background task)
2. For each fault:
   a. Query RAG knowledge base for the fault code
   b. Run GPT-4o diagnosis via ZipgridAgent.run()
   c. Create an agent_task record in DB (for audit + dedup)
   d. Send push notification to host via /api/v1/notifications (internal)
   e. If fault severity is 'high' or 'critical': suggest installer search
   f. Mark fault as processed in agent_tasks

The web app's OCPP webhook also POSTs to /agent/fault for immediate
one-off diagnosis (used for real-time host alerts). This background
worker handles batch processing of any events that slipped through.

@module apps/ai-service/core/workflows
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import asyncio
import os
from typing import TYPE_CHECKING, Any
from uuid import uuid4

import asyncpg
import httpx
import structlog

if TYPE_CHECKING:
    from core.agent import ZipgridAgent
    from core.rag.knowledge_base import RAGPipeline
    from core.safety import SafetyGuard

log = structlog.get_logger(__name__)

# ── Fault severity classification ─────────────────────────────

_CRITICAL_CODES: frozenset[str] = frozenset({
    "GroundFailure",
    "OverCurrentFailure",
    "OverVoltage",
    "WeakSignal",  # safety-related signal loss
})

_HIGH_CODES: frozenset[str] = frozenset({
    "PowerMeterFailure",
    "HighTemperature",
    "EVCommunicationError",
    "ConnectorLockFailure",
})

_INSTALLER_REQUIRED_CODES: frozenset[str] = frozenset({
    "GroundFailure",
    "OverCurrentFailure",
    "PowerMeterFailure",
    "HighTemperature",
})


def classify_fault(fault_code: str | None) -> str:
    if fault_code in _CRITICAL_CODES:
        return "critical"
    if fault_code in _HIGH_CODES:
        return "high"
    return "medium"


# ── DB helpers ─────────────────────────────────────────────────


async def _get_db_pool() -> asyncpg.Pool:
    dsn = os.environ.get("DATABASE_URL", "")
    if not dsn:
        raise RuntimeError("DATABASE_URL not set")
    return await asyncpg.create_pool(dsn, min_size=1, max_size=3)  # type: ignore[return-value]


async def _fetch_unprocessed_faults(
    pool: asyncpg.Pool,
    limit: int = 10,
) -> list[dict[str, Any]]:
    """
    Fetches Faulted OCPP events that have not yet been diagnosed by the AI.
    Joins to charger_listings and host_profiles to get host user_id.
    """
    rows = await pool.fetch(
        """
        SELECT
            oel.id,
            oel.charge_point_id,
            oel.event_type,
            oel.error_code,
            oel.timestamp,
            cl.id AS listing_id,
            hp.user_id AS host_user_id
        FROM ocpp_event_log oel
        JOIN charger_devices cd ON cd.charge_point_id = oel.charge_point_id
        JOIN charger_listings cl ON cl.ocpp_charge_point_id = oel.charge_point_id
        JOIN host_profiles hp ON hp.id = cl.host_profile_id
        WHERE oel.event_type = 'Faulted'
          AND oel.resolved = false
          AND NOT EXISTS (
              SELECT 1 FROM agent_tasks at2
              WHERE at2.source_event_id = oel.id::text
                AND at2.task_type = 'fault_diagnosis'
          )
        ORDER BY oel.timestamp DESC
        LIMIT $1
        """,
        limit,
    )
    return [dict(r) for r in rows]


async def _mark_agent_task(
    pool: asyncpg.Pool,
    event_id: str,
    host_user_id: str,
    diagnosis: str,
    severity: str,
) -> None:
    """Records a completed fault diagnosis in the agent_tasks table."""
    await pool.execute(
        """
        INSERT INTO agent_tasks (
            id, task_type, status, source_event_id,
            user_id, result_summary, created_at, completed_at
        ) VALUES ($1, 'fault_diagnosis', 'completed', $2, $3, $4, NOW(), NOW())
        ON CONFLICT DO NOTHING
        """,
        str(uuid4()),
        str(event_id),
        host_user_id,
        f"[{severity}] {diagnosis[:500]}",
    )


# ── Notification helper ────────────────────────────────────────


async def _notify_host(
    host_user_id: str,
    title: str,
    body: str,
    listing_id: str | None,
) -> None:
    """Sends a push notification to the host via the web app notifications API."""
    base_url = os.environ.get("ZIPGRID_API_URL", "http://localhost:3000")
    secret = os.environ.get("AI_SERVICE_SECRET", "")
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            await client.post(
                f"{base_url}/api/v1/notifications",
                json={
                    "userId": host_user_id,
                    "type": "charger_fault",
                    "title": title,
                    "body": body,
                    "data": {"listingId": listing_id},
                },
                headers={"X-Service-Secret": secret},
            )
    except Exception as exc:  # noqa: BLE001
        log.error("notify_host_failed", host=host_user_id, error=str(exc))


# ── Core workflow function ─────────────────────────────────────


async def process_fault(
    fault: dict[str, Any],
    agent: "ZipgridAgent",
    rag: "RAGPipeline",
    db_pool: asyncpg.Pool,
) -> None:
    """
    Processes a single fault event end-to-end.
    Runs diagnosis, stores agent_task record, notifies host.
    """
    event_id = str(fault["id"])
    charge_point_id = fault["charge_point_id"]
    fault_code = fault.get("error_code") or fault.get("event_type")
    listing_id = str(fault["listing_id"]) if fault.get("listing_id") else None
    host_user_id = str(fault["host_user_id"])
    severity = classify_fault(fault_code)

    log.info(
        "processing_fault",
        event_id=event_id,
        charge_point_id=charge_point_id,
        fault_code=fault_code,
        severity=severity,
    )

    # RAG retrieval for fault code context
    rag_context = await rag.retrieve(f"OCPP fault {fault_code}", top_k=2)

    # Build diagnosis prompt
    installer_hint = (
        " If an installer is needed, end with 'INSTALLER_REQUIRED'."
        if fault_code in _INSTALLER_REQUIRED_CODES
        else ""
    )

    prompt = (
        f"Charger {charge_point_id} reported a {severity} fault: {fault_code}.\n"
        f"{rag_context}\n\n"
        f"In 2 sentences: diagnose the cause and tell the host what to do next.{installer_hint}"
    )

    try:
        diagnosis = await agent.run(
            user_input=prompt,
            user_id=host_user_id,
            role="host",
            ai_mode="agentic",
            context={"listing_id": listing_id} if listing_id else None,
        )
    except Exception as exc:  # noqa: BLE001
        log.error("fault_diagnosis_failed", event_id=event_id, error=str(exc))
        diagnosis = f"Fault detected on your charger ({fault_code}). Please check the device."

    # Store agent_task record
    await _mark_agent_task(db_pool, event_id, host_user_id, diagnosis, severity)

    # Build notification
    severity_emoji = {"critical": "🔴", "high": "🟠", "medium": "🟡"}.get(severity, "⚠️")
    title = f"{severity_emoji} Charger fault detected"
    notification_body = diagnosis[:200]
    if "INSTALLER_REQUIRED" in diagnosis:
        notification_body = notification_body.replace("INSTALLER_REQUIRED", "").strip()
        notification_body += " A certified installer may be needed."

    await _notify_host(host_user_id, title, notification_body, listing_id)

    log.info(
        "fault_processed",
        event_id=event_id,
        severity=severity,
        installer_required="INSTALLER_REQUIRED" in diagnosis,
    )


# ── Background polling task ────────────────────────────────────


class FaultDiagnosisWorker:
    """
    Background worker that polls the DB for new fault events
    and runs the diagnosis workflow. Runs as an asyncio task.
    """

    def __init__(
        self,
        agent: "ZipgridAgent",
        rag: "RAGPipeline",
        poll_interval_seconds: int = 60,
    ) -> None:
        self._agent = agent
        self._rag = rag
        self._interval = poll_interval_seconds
        self._running = False
        self._pool: asyncpg.Pool | None = None

    async def start(self) -> None:
        """Start the background polling loop."""
        db_url = os.environ.get("DATABASE_URL", "")
        if not db_url:
            log.warning("fault_worker_disabled", reason="DATABASE_URL not set")
            return

        try:
            self._pool = await _get_db_pool()
        except Exception as exc:  # noqa: BLE001
            log.error("fault_worker_db_init_failed", error=str(exc))
            return

        self._running = True
        log.info("fault_worker_started", interval=self._interval)
        asyncio.create_task(self._loop())

    async def stop(self) -> None:
        self._running = False
        if self._pool:
            await self._pool.close()

    async def _loop(self) -> None:
        while self._running:
            try:
                await self._tick()
            except Exception as exc:  # noqa: BLE001
                log.error("fault_worker_tick_failed", error=str(exc))
            await asyncio.sleep(self._interval)

    async def _tick(self) -> None:
        if not self._pool:
            return
        faults = await _fetch_unprocessed_faults(self._pool, limit=5)
        if not faults:
            return
        log.info("fault_worker_tick", faults_found=len(faults))
        for fault in faults:
            await process_fault(fault, self._agent, self._rag, self._pool)
            await asyncio.sleep(0.5)  # brief pause between diagnoses
