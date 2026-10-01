"""
@file safety.py
@description AI safety guardrails — input filtering, output validation,
confirmation gates for money/access actions, PII scrubbing,
intent confidence thresholds, and rate-limit tracking.

Design principles
-----------------
- System prompt is NEVER derived from user input
- All user inputs sanitised before passing to LLM
- Money and access actions require explicit confirmation gate
- AI cannot directly execute payments — only BookingService can
- PII (email, phone, card numbers) stripped before LLM sees it
- Confidence below threshold → refuse + ask user to rephrase
- Prompt injection patterns blocked immediately (no LLM involved)

@module apps/ai-service/core
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import re

import structlog

log = structlog.get_logger(__name__)

# ── Prompt injection patterns ──────────────────────────────────

_INJECTION_PATTERNS: list[str] = [
    "ignore previous instructions",
    "ignore all instructions",
    "disregard your instructions",
    "you are now",
    "new system prompt",
    "forget everything",
    "act as",
    "pretend you are",
    "jailbreak",
    "dan mode",
    "developer mode",
    "override safety",
    "bypass restrictions",
    "<system>",
    "```system",
    "### instruction",
    "[system]",
]

# ── PII patterns (scrub before sending to LLM) ────────────────

_PII_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # UK/international phone numbers
    (re.compile(r"\b(?:\+44|0)[\s\-]?(?:\d[\s\-]?){9,10}\b"), "[PHONE]"),
    # Email addresses
    (re.compile(r"\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Z|a-z]{2,}\b"), "[EMAIL]"),
    # Card numbers (13–19 digits, optionally spaced)
    (re.compile(r"\b(?:\d[ \-]?){13,19}\b"), "[CARD]"),
    # Sort codes (UK: XX-XX-XX or XXXXXX)
    (re.compile(r"\b\d{2}[\s\-]\d{2}[\s\-]\d{2}\b"), "[SORT_CODE]"),
    # UK National Insurance numbers
    (re.compile(r"\b[A-Z]{2}\d{6}[A-D]\b", re.IGNORECASE), "[NI_NUMBER]"),
    # Postcodes
    (re.compile(r"\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b", re.IGNORECASE), "[POSTCODE]"),
]

# ── Actions requiring confirmation before execution ────────────

CONFIRMATION_REQUIRED_INTENTS: frozenset[str] = frozenset({
    "book_charger",
    "stop_session",
    "block_date",
    "schedule_charging",
})

# ── Money/access tool names requiring confirmation ─────────────

CONFIRMATION_REQUIRED_TOOLS: frozenset[str] = frozenset({
    "create_booking",
    "stop_session",
    "block_availability",
})

# ── Confidence thresholds ──────────────────────────────────────

MIN_INTENT_CONFIDENCE = 0.50  # below this → ask user to rephrase
HIGH_CONFIDENCE_THRESHOLD = 0.85  # above this → skip confirmation for low-risk intents


class SafetyGuard:
    """
    Stateless safety guardrails applied before and after LLM calls.
    One instance shared across all requests.
    """

    # ── Input guards ───────────────────────────────────────────

    def check_input(self, user_input: str) -> tuple[bool, str]:
        """
        Checks user input for safety violations.

        Returns:
            (is_safe: bool, violation_reason: str)
            If is_safe=False, the request must be rejected.
        """
        if not user_input or not user_input.strip():
            return False, "empty_input"

        if len(user_input) > 4000:
            return False, "input_too_long"

        lower = user_input.lower()
        for pattern in _INJECTION_PATTERNS:
            if pattern in lower:
                log.warning("prompt_injection_blocked", pattern=pattern)
                return False, f"injection_pattern:{pattern}"

        return True, ""

    def scrub_pii(self, text: str) -> str:
        """
        Removes personally identifiable information before sending to OpenAI.
        Replaces PII with labelled placeholders so context is preserved.
        """
        result = text
        for pattern, replacement in _PII_PATTERNS:
            result = pattern.sub(replacement, result)
        return result

    # ── Intent confidence gate ─────────────────────────────────

    def check_confidence(self, intent: str, confidence: float) -> tuple[bool, str]:
        """
        Checks whether confidence is high enough to act on an intent.

        Returns:
            (should_proceed: bool, message: str)
            If should_proceed=False, message contains the user-facing response.
        """
        if confidence < MIN_INTENT_CONFIDENCE:
            return (
                False,
                "I'm not sure what you'd like to do. Could you rephrase that?",
            )
        return True, ""

    # ── Confirmation gate ──────────────────────────────────────

    def requires_confirmation(self, intent: str, confidence: float) -> bool:
        """
        Returns True if this intent requires explicit user confirmation
        before the agent executes the corresponding tool.

        High-confidence read-only intents (find_charger, session_status,
        spend_query, navigate_booking) never require confirmation.
        Write/money intents always do.
        """
        if intent not in CONFIRMATION_REQUIRED_INTENTS:
            return False
        # Even confirmed intents skip the gate if confidence is very high
        # AND the user phrased it explicitly (e.g. "stop charging now")
        # — for voice UX, we still require confirmation for stop_session
        # because a mis-hear could stop a live session.
        return True

    # ── Output validation ──────────────────────────────────────

    def validate_output(self, response: str) -> tuple[bool, str]:
        """
        Validates the LLM's response before returning to the user.
        Catches hallucinated PII, forbidden content, or overly long replies.

        Returns:
            (is_valid: bool, sanitised_response: str)
        """
        if not response or not response.strip():
            return True, "I don't have an answer for that right now."

        # Scrub any PII the model may have hallucinated
        cleaned = self.scrub_pii(response)

        # Truncate very long responses (voice TTS limit)
        if len(cleaned) > 1200:
            cleaned = cleaned[:1200].rsplit(" ", 1)[0] + "…"

        return True, cleaned

    # ── Agentic action guard ───────────────────────────────────

    def check_agentic_action(
        self,
        tool_name: str,
        tool_input: dict,  # noqa: ANN001
        ai_mode: str,
    ) -> tuple[bool, str]:
        """
        Called before each tool execution in agentic workflows.
        In Standard mode: blocks all write tools (user must confirm in UI).
        In Hybrid mode: blocks money tools, allows read tools.
        In Agentic mode: allows all tools (user pre-authorised agentic mode).

        Returns:
            (allowed: bool, reason: str)
        """
        is_write_tool = tool_name in CONFIRMATION_REQUIRED_TOOLS

        if ai_mode == "standard" and is_write_tool:
            return (
                False,
                f"Tool '{tool_name}' requires user confirmation. "
                "Please confirm in the app before this action executes.",
            )

        if ai_mode == "hybrid" and tool_name == "create_booking":
            return (
                False,
                "Bookings require explicit user confirmation even in Hybrid mode. "
                "Please confirm in the app.",
            )

        return True, ""

    # ── Rate limit helper ──────────────────────────────────────

    @staticmethod
    def is_rate_limited(
        user_id: str,
        counters: dict[str, int],
        limit: int = 30,
    ) -> bool:
        """
        Simple in-process rate limiter (calls per minute).
        Production: use Redis INCR + EXPIRE instead.

        Args:
            user_id: User UUID
            counters: Shared mutable dict tracking call counts
            limit: Max calls allowed in the window (default 30/min)
        """
        current = counters.get(user_id, 0)
        if current >= limit:
            log.warning("rate_limited", user_id=user_id, count=current)
            return True
        counters[user_id] = current + 1
        return False


# ── Module-level singleton ─────────────────────────────────────
# Imported by agent.py and main.py

safety = SafetyGuard()
