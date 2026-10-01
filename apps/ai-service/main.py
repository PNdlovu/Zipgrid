"""
@file main.py
@description Zipgrid AI/Voice Service — FastAPI entry point.

Endpoints
---------
GET  /health              — Railway + web-app health check
POST /agent/voice         — Intent parsing + structured action (fast path, ~1s)
POST /agent/run           — Full LangChain agent (multi-turn, ~3–8s)
POST /agent/fault         — Agentic fault-diagnosis workflow (internal, from OCPP service)

Architecture
------------
- ZipgridAgent (LangChain) is created once at startup via lifespan
- IntentParser is stateless — one instance shared
- RAGPipeline warms up in-memory KB at startup
- All endpoints validate X-Service-Secret header (server-to-server)
  OR a JWT for direct client calls (web app proxies via /api/v1/voice/command)
- Rate limiting: 30 req/min per user_id (in-process; Redis in production)

@module apps/ai-service
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from typing import Any, AsyncGenerator

import structlog
from fastapi import FastAPI, Header, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from core.agent import ZipgridAgent
from core.intent import IntentParser
from core.rag.knowledge_base import RAGPipeline
from core.safety import safety
from core.workflows.fault_diagnosis import FaultDiagnosisWorker
from core.tools.proactive_alerts import ProactiveAlertWorker
from core.tools.tariff_scheduler import TariffSchedulerAgent
from core.wake_word import build_greeting

log = structlog.get_logger(__name__)

# ── Rate limit counters (in-process; reset on restart) ────────
_rate_counters: dict[str, int] = {}

# ── App state holders ─────────────────────────────────────────
_agent: ZipgridAgent | None = None
_intent_parser: IntentParser | None = None
_rag: RAGPipeline | None = None
_openai_client: AsyncOpenAI | None = None
_fault_worker: FaultDiagnosisWorker | None = None
_alert_worker: ProactiveAlertWorker | None = None
_tariff_scheduler: TariffSchedulerAgent | None = None


# ── Lifespan ──────────────────────────────────────────────────


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """Initialise all singletons at startup; clean up at shutdown."""
    global _agent, _intent_parser, _rag, _openai_client, _fault_worker, _alert_worker, _tariff_scheduler  # noqa: PLW0603

    api_key = os.environ.get("OPENAI_API_KEY", "")
    if not api_key:
        log.warning("OPENAI_API_KEY not set — AI features will return fallback responses")

    _openai_client = AsyncOpenAI(api_key=api_key or "sk-placeholder")
    _agent = ZipgridAgent(openai_api_key=api_key)
    _intent_parser = IntentParser(openai_client=_openai_client)
    _rag = RAGPipeline(openai_client=_openai_client)

    # Seed in-memory knowledge base (no-op if Pinecone is configured)
    await _rag.warm_up()

    # Start agentic fault-diagnosis background worker
    _fault_worker = FaultDiagnosisWorker(agent=_agent, rag=_rag, poll_interval_seconds=60)
    await _fault_worker.start()

    # Start proactive session alert worker (idle fee, full charge, etc.)
    _alert_worker = ProactiveAlertWorker(poll_interval_seconds=60)
    await _alert_worker.start()

    # Start intraday tariff scheduler (Agile price spike / cheap window alerts)
    _tariff_scheduler = TariffSchedulerAgent(poll_interval_seconds=1800)
    await _tariff_scheduler.start()

    # Start rate-counter reset loop (clears per-user counters every 60s)
    import asyncio as _asyncio  # noqa: PLC0415
    _reset_task = _asyncio.create_task(_reset_rate_counters_loop())

    log.info("ai_service_ready", openai_configured=bool(api_key))
    yield

    # Shutdown — stop worker first, cancel reset task, then close HTTP client
    _reset_task.cancel()
    if _fault_worker:
        await _fault_worker.stop()
    if _alert_worker:
        await _alert_worker.stop()
    if _tariff_scheduler:
        await _tariff_scheduler.stop()
    from core.tools.api_client import _client as http_client  # noqa: PLC0415
    if http_client and not http_client.is_closed:
        await http_client.aclose()
    log.info("ai_service_shutdown")


# ── App ───────────────────────────────────────────────────────

app = FastAPI(
    title="Zipgrid AI/Voice Service",
    version="0.1.0",
    description="LangChain agent layer, voice intent parsing, RAG knowledge base",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "https://zipgrid.co.uk",
        "https://*.vercel.app",
    ],
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type", "X-Service-Secret", "X-User-Id", "X-User-Roles"],
)

_SERVICE_SECRET = os.environ.get("AI_SERVICE_SECRET", "")


# ── Auth helpers ──────────────────────────────────────────────


def _verify_service_secret(secret: str | None) -> None:
    """Raises 401 if the service secret does not match."""
    if not _SERVICE_SECRET:
        return  # secret not configured — allow all (dev mode)
    if secret != _SERVICE_SECRET:
        raise HTTPException(status_code=401, detail="Invalid service secret")


def _check_rate_limit(user_id: str) -> None:
    if safety.is_rate_limited(user_id, _rate_counters):
        raise HTTPException(status_code=429, detail="Rate limit exceeded — 30 requests per minute")


# ── Request / Response models ─────────────────────────────────


class VoiceRequest(BaseModel):
    transcript: str = Field(min_length=1, max_length=2000)
    role: str = Field(default="driver", pattern="^(driver|host)$")
    context: dict[str, Any] = Field(default_factory=dict)
    language: str = Field(default="en-GB")
    user_id: str = Field(min_length=1)


class AgentRunRequest(BaseModel):
    input: str = Field(min_length=1, max_length=4000)
    role: str = Field(default="driver", pattern="^(driver|host)$")
    ai_mode: str = Field(default="hybrid", pattern="^(standard|hybrid|agentic)$")
    context: dict[str, Any] = Field(default_factory=dict)
    user_id: str = Field(min_length=1)


class FaultRequest(BaseModel):
    """Internal request from OCPP service on fault detection."""
    charge_point_id: str
    event_type: str
    fault_code: str | None = None
    listing_id: str | None = None
    host_user_id: str
    raw_payload: dict[str, Any] = Field(default_factory=dict)


# ── Endpoints ─────────────────────────────────────────────────


@app.get("/health")
async def health() -> dict[str, str]:
    """Health check — used by Railway and the web app health-check script."""
    return {"status": "ok", "service": "ai-service", "version": "0.1.0"}


@app.post("/agent/voice")
async def agent_voice(
    request: VoiceRequest,
    x_service_secret: str | None = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """
    Fast-path voice endpoint.
    Parses a transcript into a structured intent + action.
    Adds RAG context for fault/knowledge queries before intent parsing.
    Target latency: < 2s p95.
    """
    _verify_service_secret(x_service_secret)
    _check_rate_limit(request.user_id)

    assert _intent_parser is not None, "Service not initialised"
    assert _rag is not None, "Service not initialised"

    # Safety check
    safe, violation = safety.check_input(request.transcript)
    if not safe:
        log.warning("voice_input_blocked", user_id=request.user_id, violation=violation)
        return {
            "intent": "unknown",
            "confidence": 0.0,
            "speech": "I can't help with that request.",
            "action": {"type": "speak_only"},
            "params": {},
            "requiresConfirmation": False,
        }

    # Scrub PII before sending to OpenAI
    clean_transcript = safety.scrub_pii(request.transcript)

    # Enrich with RAG context for fault/knowledge intents
    rag_context = ""
    fault_keywords = {"fault", "broken", "error", "not working", "offline", "problem"}
    if any(kw in clean_transcript.lower() for kw in fault_keywords):
        rag_context = await _rag.retrieve(clean_transcript, top_k=2)

    enriched = clean_transcript
    if rag_context:
        enriched = f"{clean_transcript}\n\n[Knowledge base context]\n{rag_context}"

    result = await _intent_parser.parse(
        transcript=enriched,
        role=request.role,
        context=request.context if request.context else None,
        language=request.language,
    )

    # Confidence gate
    proceed, refuse_msg = safety.check_confidence(result.intent, result.confidence)
    if not proceed:
        return {
            "intent": "unknown",
            "confidence": result.confidence,
            "speech": refuse_msg,
            "action": {"type": "speak_only"},
            "params": {},
            "requiresConfirmation": False,
        }

    # Map IntentResult → VoiceAction
    action = _build_action(result.intent, result.params, request.context)

    _, validated_speech = safety.validate_output(result.speech)

    return {
        "intent": result.intent,
        "confidence": result.confidence,
        "speech": validated_speech,
        "action": action,
        "params": result.params,
        "requiresConfirmation": result.requires_confirmation,
    }


@app.post("/agent/run")
async def agent_run(
    request: AgentRunRequest,
    x_service_secret: str | None = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """
    Full LangChain agent endpoint — multi-turn, tool-calling.
    Used for complex queries that require multiple tool calls.
    Target latency: < 10s p95 (GPT-4o + tools).
    """
    _verify_service_secret(x_service_secret)
    _check_rate_limit(request.user_id)

    assert _agent is not None, "Service not initialised"

    safe, violation = safety.check_input(request.input)
    if not safe:
        return {"output": "I can't help with that request.", "tool_calls": 0}

    clean_input = safety.scrub_pii(request.input)

    response = await _agent.run(
        user_input=clean_input,
        user_id=request.user_id,
        role=request.role,
        ai_mode=request.ai_mode,
        context=request.context if request.context else None,
    )

    _, validated = safety.validate_output(response)
    return {"output": validated}


@app.post("/agent/fault")
async def agent_fault(
    request: FaultRequest,
    x_service_secret: str | None = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """
    Agentic fault-diagnosis workflow — called by OCPP service on fault detection.
    Diagnoses the fault, builds a notification message for the host,
    and optionally suggests an installer booking.
    """
    _verify_service_secret(x_service_secret)

    assert _agent is not None, "Service not initialised"
    assert _rag is not None, "Service not initialised"

    log.info(
        "fault_workflow_triggered",
        charge_point_id=request.charge_point_id,
        fault_code=request.fault_code,
        host=request.host_user_id,
    )

    # Pull RAG context for this fault code
    fault_query = (
        f"OCPP fault {request.fault_code or request.event_type} "
        f"charge point {request.charge_point_id}"
    )
    rag_context = await _rag.retrieve(fault_query, top_k=3)

    diagnosis_prompt = (
        f"A charger fault has been detected on charge point {request.charge_point_id}.\n"
        f"Fault type: {request.event_type}\n"
        f"Fault code: {request.fault_code or 'unknown'}\n"
        f"Listing ID: {request.listing_id or 'unknown'}\n\n"
        f"{rag_context}\n\n"
        "Please: 1) Diagnose the likely cause in plain English (1 sentence). "
        "2) Give the host a clear next step. "
        "3) Say whether an installer is needed (yes/no). "
        "Keep your response under 100 words."
    )

    response = await _agent.run(
        user_input=diagnosis_prompt,
        user_id=request.host_user_id,
        role="host",
        ai_mode="agentic",
        context={"listing_id": request.listing_id} if request.listing_id else None,
    )

    _, validated = safety.validate_output(response)

    return {
        "diagnosis": validated,
        "charge_point_id": request.charge_point_id,
        "fault_code": request.fault_code,
        "host_user_id": request.host_user_id,
    }


@app.post("/agent/wake")
async def agent_wake(
    request: Request,
    x_service_secret: str | None = Header(default=None, alias="X-Service-Secret"),
    x_user_id: str | None = Header(default=None, alias="X-User-Id"),
) -> dict[str, Any]:
    """
    Wake word event handler — "Hey Zipgrid" activation.
    Returns a context-aware greeting and AI mode for the voice session.
    """
    _verify_service_secret(x_service_secret)

    body: dict[str, Any] = {}
    try:
        body = await request.json()
    except Exception:  # noqa: BLE001
        pass

    role    = body.get("role", "driver")
    context = body.get("context", {})

    greeting_data = build_greeting(role=role, context=context)
    return greeting_data


# ── Action builder ─────────────────────────────────────────────


def _build_action(
    intent: str,
    params: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    """Maps a parsed intent + params to a structured VoiceAction dict."""
    if intent == "find_charger":
        loc = params.get("location", "")
        qp = f"?q={loc}" if loc else ""
        return {"type": "navigate", "url": f"/map{qp}"}

    if intent == "book_charger":
        return {
            "type": "prefill_booking",
            "listingId": params.get("listing_id") or context.get("listing_id"),
            "date": params.get("date"),
            "hours": params.get("duration_hours"),
        }

    if intent == "session_status":
        sid = params.get("session_id") or context.get("session_id")
        if sid:
            return {"type": "show_session_status", "sessionId": sid}
        return {"type": "navigate", "url": "/driver/session"}

    if intent == "stop_session":
        sid = params.get("session_id") or context.get("session_id")
        if sid:
            return {"type": "stop_session", "sessionId": sid}
        return {"type": "navigate", "url": "/driver/session"}

    if intent == "spend_query":
        return {"type": "show_spend_summary", "period": params.get("period", "this_month")}

    if intent == "navigate_booking":
        bid = params.get("booking_id") or context.get("booking_id")
        if bid:
            return {"type": "navigate_to_booking", "bookingId": bid}
        return {"type": "navigate", "url": "/driver/bookings"}

    if intent == "schedule_charging":
        return {
            "type": "schedule_charging",
            "targetSoc": params.get("target_soc"),
            "byTime": params.get("by_time"),
        }

    if intent == "block_date":
        lid = params.get("listing_id") or context.get("listing_id", "")
        return {"type": "block_date", "listingId": lid, "date": params.get("date", "")}

    if intent == "fault_report":
        return {
            "type": "open_fault_report",
            "listingId": params.get("listing_id") or context.get("listing_id"),
        }

    return {"type": "speak_only"}


# ── Whisper transcription endpoint ────────────────────────────

import asyncio  # noqa: E402
from core.transcribe import transcribe_audio, reset_rate_counters  # noqa: E402


@app.post("/agent/transcribe")
async def agent_transcribe(
    audio: UploadFile,  # multipart/form-data
    user_id: str = Header(alias="X-User-Id"),
    language: str = Header(default="en", alias="X-Language"),
    x_service_secret: str | None = Header(default=None, alias="X-Service-Secret"),
) -> dict[str, Any]:
    """
    Whisper STT fallback transcription endpoint.
    Accepts multipart audio file; returns transcript text + metadata.
    Used when the browser does not support the Web Speech API.

    Supported: mp3, m4a, wav, webm, ogg (max 25 MB).
    Rate limit: 20 per minute per user.
    """
    _verify_service_secret(x_service_secret)

    assert _openai_client is not None, "Service not initialised"

    result = await transcribe_audio(
        audio_file=audio,
        user_id=user_id,
        language=language,
        openai_client=_openai_client,
    )

    return {
        "transcript":        result.text,
        "language":          result.language,
        "durationSeconds":   result.duration_seconds,
        "wordCount":         result.word_count,
    }


# ── Rate counter reset task (runs every 60s) ──────────────────

async def _reset_rate_counters_loop() -> None:
    import asyncio as _asyncio2  # local import avoids circular; noqa: PLC0415
    while True:
        await _asyncio2.sleep(60)
        _rate_counters.clear()
        reset_rate_counters()


# ── Global error handler ──────────────────────────────────────


@app.exception_handler(Exception)
async def global_error_handler(request: Request, exc: Exception) -> JSONResponse:
    log.error("unhandled_exception", path=request.url.path, error=str(exc))
    return JSONResponse(
        status_code=500,
        content={"detail": "An unexpected error occurred"},
    )
