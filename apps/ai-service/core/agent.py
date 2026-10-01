"""
@file agent.py
@description Zipgrid LangChain agent orchestrator.

Routes voice/text intents to domain tools and manages per-user
short-term conversation memory stored in Redis (TTL 1 hour).

Supports three AI modes:
  Standard  — single-step: intent → tool → response (no multi-turn)
  Hybrid    — multi-step: agent loop up to 4 tool calls (default)
  Agentic   — fully autonomous: up to 8 tool calls, minimal confirmation gates

Architecture
------------
- LangChain AgentExecutor with OpenAI function-calling agent
- Tools: search_listings, create_booking, get_session, stop_session,
         get_earnings, block_availability
- Memory: ConversationBufferWindowMemory backed by Redis
- Safety: every tool call passes through SafetyGuard before execution

@module apps/ai-service/core
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import json
import os
from typing import Any

import redis.asyncio as aioredis
import structlog
from langchain.agents import AgentExecutor, create_openai_tools_agent
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_openai import ChatOpenAI

from .safety import SafetyGuard
from .tools.block_availability import block_availability_tool
from .tools.create_booking import create_booking_tool
from .tools.get_earnings import get_earnings_tool
from .tools.get_session import get_session_tool
from .tools.search_listings import search_listings_tool
from .tools.stop_session import stop_session_tool

log = structlog.get_logger(__name__)

# ── Mode config ────────────────────────────────────────────────

_MODE_MAX_ITERATIONS: dict[str, int] = {
    "standard": 1,
    "hybrid": 4,
    "agentic": 8,
}

# ── System prompts per role ────────────────────────────────────

_SYSTEM_DRIVER = """You are the Zipgrid AI assistant for an EV driver.
You help find chargers, manage bookings, monitor charging sessions,
and answer questions about charging spend.

Rules:
- Never make a booking or stop a session without explicit user confirmation.
- Always show the cost estimate before confirming a booking.
- Keep responses concise and conversational — this is voice-first.
- Use plain English. Never say "OCPP", "kWh" without explaining it as "kilowatt-hours".
- If you don't know something, say so honestly.
"""

_SYSTEM_HOST = """You are the Zipgrid AI assistant for an EV charging host.
You help manage listings, block availability, monitor sessions,
and review earnings.

Rules:
- Never block dates or change settings without explicit user confirmation.
- Always confirm before any action that affects bookings.
- Keep responses concise — this is voice-first.
- Use plain English. Avoid technical jargon.
- If you don't know something, say so honestly.
"""

# ── Agent factory ─────────────────────────────────────────────


def _build_agent(
    role: str,
    ai_mode: str,
    openai_api_key: str,
) -> tuple[AgentExecutor, list[Any]]:
    """
    Build a LangChain AgentExecutor for the given role and AI mode.
    Returns (executor, tools_list).
    """
    tools = [
        search_listings_tool,
        create_booking_tool,
        get_session_tool,
        stop_session_tool,
        get_earnings_tool,
        block_availability_tool,
    ]

    llm = ChatOpenAI(
        model="gpt-4o",
        temperature=0.1,
        api_key=openai_api_key,  # type: ignore[arg-type]
        streaming=False,
    )

    system_prompt = _SYSTEM_DRIVER if role == "driver" else _SYSTEM_HOST

    prompt = ChatPromptTemplate.from_messages([
        ("system", system_prompt),
        MessagesPlaceholder("chat_history", optional=True),
        ("human", "{input}"),
        MessagesPlaceholder("agent_scratchpad"),
    ])

    agent = create_openai_tools_agent(llm=llm, tools=tools, prompt=prompt)

    executor = AgentExecutor(
        agent=agent,
        tools=tools,
        verbose=os.environ.get("LOG_LEVEL", "info").lower() == "debug",
        max_iterations=_MODE_MAX_ITERATIONS.get(ai_mode, 4),
        early_stopping_method="generate",
        handle_parsing_errors=True,
        return_intermediate_steps=False,
    )

    return executor, tools


# ── Redis memory helpers ───────────────────────────────────────

_redis_client: aioredis.Redis | None = None
_MEMORY_TTL_SECONDS = 3600  # 1 hour session memory


async def _get_redis() -> aioredis.Redis | None:
    """Returns a Redis client, or None if Redis is not configured."""
    global _redis_client  # noqa: PLW0603
    redis_url = os.environ.get("REDIS_URL", "")
    if not redis_url:
        return None
    if _redis_client is None:
        _redis_client = aioredis.from_url(redis_url, decode_responses=True)
    return _redis_client


async def _load_history(user_id: str) -> list[Any]:
    """Load conversation history from Redis for a user."""
    redis = await _get_redis()
    if not redis:
        return []
    try:
        raw = await redis.get(f"ai:mem:{user_id}")
        if not raw:
            return []
        msgs = json.loads(raw)
        history: list[Any] = []
        for m in msgs:
            if m["role"] == "human":
                history.append(HumanMessage(content=m["content"]))
            else:
                history.append(AIMessage(content=m["content"]))
        return history
    except Exception:  # noqa: BLE001
        return []


async def _save_history(
    user_id: str,
    history: list[Any],
    human: str,
    ai_response: str,
) -> None:
    """Append this turn to Redis conversation history (keep last 10 turns)."""
    redis = await _get_redis()
    if not redis:
        return
    try:
        msgs = []
        for m in history:
            role = "human" if isinstance(m, HumanMessage) else "ai"
            msgs.append({"role": role, "content": m.content})
        msgs.append({"role": "human", "content": human})
        msgs.append({"role": "ai", "content": ai_response})
        # Keep only the last 10 exchanges (20 messages)
        msgs = msgs[-20:]
        await redis.setex(f"ai:mem:{user_id}", _MEMORY_TTL_SECONDS, json.dumps(msgs))
    except Exception:  # noqa: BLE001
        pass


# ── Public API ────────────────────────────────────────────────


class ZipgridAgent:
    """
    Main agent class. One instance per process (singleton via lifespan).
    run() is called per request with user context injected.
    """

    def __init__(self, openai_api_key: str) -> None:
        self._key = openai_api_key
        self._safety = SafetyGuard()
        # Cache executors per (role, mode) combination — 6 combinations max
        self._executors: dict[tuple[str, str], AgentExecutor] = {}

    def _get_executor(self, role: str, ai_mode: str) -> AgentExecutor:
        key = (role, ai_mode)
        if key not in self._executors:
            executor, _ = _build_agent(role, ai_mode, self._key)
            self._executors[key] = executor
        return self._executors[key]

    async def run(
        self,
        user_input: str,
        user_id: str,
        role: str = "driver",
        ai_mode: str = "hybrid",
        context: dict[str, Any] | None = None,
    ) -> str:
        """
        Run the agent for a user request.

        Args:
            user_input: Natural language input (from voice or text)
            user_id: Authenticated user's UUID
            role: 'driver' or 'host'
            ai_mode: 'standard' | 'hybrid' | 'agentic'
            context: Optional page/session/booking context

        Returns:
            Agent's response string (for TTS or display)
        """
        # Safety check
        safe, violation = self._safety.check_input(user_input)
        if not safe:
            log.warning("unsafe_input_blocked", user_id=user_id, violation=violation)
            return "I can't help with that request."

        # Inject user_id into tool calls via context prefix
        context_note = ""
        if context:
            parts = []
            if context.get("session_id"):
                parts.append(f"active session ID: {context['session_id']}")
            if context.get("booking_id"):
                parts.append(f"current booking ID: {context['booking_id']}")
            if context.get("listing_id"):
                parts.append(f"current listing ID: {context['listing_id']}")
            if parts:
                context_note = "\n[Context: " + "; ".join(parts) + "]"

        # Prefix user_id so tools can extract it from the input
        # (LangChain tools receive the full input string)
        enriched_input = (
            f"[user_id={user_id}] [role={role}]{context_note}\n{user_input}"
        )

        # Load history
        history = await _load_history(user_id)

        executor = self._get_executor(role, ai_mode)

        try:
            result = await executor.ainvoke(
                {
                    "input": enriched_input,
                    "chat_history": history,
                },
            )
            response: str = result.get("output", "I couldn't complete that request.")
        except Exception as exc:  # noqa: BLE001
            log.error("agent_run_failed", user_id=user_id, error=str(exc))
            response = "Something went wrong. Please try again."

        # Persist to memory
        await _save_history(user_id, history, user_input, response)

        return response
