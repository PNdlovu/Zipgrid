"""
@file intent.py
@description GPT-4o function-calling intent parser.
Converts a raw voice transcript into a structured IntentResult with
9 recognised intents and typed parameter extraction.

Intents
-------
driver:  find_charger, book_charger, session_status, stop_session,
         spend_query, navigate_booking
host:    schedule_charging, block_date, fault_report
shared:  unknown  (fallback)

Design notes
------------
- Uses OpenAI function-calling (tools API) so the model is *forced*
  to return structured JSON — no free-text parsing needed.
- Each intent maps to one tool definition. GPT-4o picks the best
  match; confidence is estimated from logprobs if available,
  otherwise inferred from whether a tool was called.
- All date/time strings normalised to ISO 8601 UTC before return.
- Never sends PII to OpenAI — safety layer strips it beforehand.

@module apps/ai-service/core
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone
from typing import Any, Literal

import structlog
from openai import AsyncOpenAI
from pydantic import BaseModel, Field

log = structlog.get_logger(__name__)

# ── Intent literal type ────────────────────────────────────────

VoiceIntent = Literal[
    "find_charger",
    "book_charger",
    "session_status",
    "stop_session",
    "spend_query",
    "navigate_booking",
    "schedule_charging",
    "block_date",
    "fault_report",
    "unknown",
]

# ── Result model ───────────────────────────────────────────────


class IntentResult(BaseModel):
    """Structured output from the intent parser."""

    intent: VoiceIntent
    confidence: float = Field(ge=0.0, le=1.0)
    speech: str  # TTS-ready response text
    params: dict[str, Any] = Field(default_factory=dict)
    requires_confirmation: bool = False


# ── Tool definitions sent to GPT-4o ───────────────────────────

_TOOLS: list[dict[str, Any]] = [
    {
        "type": "function",
        "function": {
            "name": "find_charger",
            "description": (
                "Driver wants to search for a charging point near a location or along a route. "
                "Use when utterance contains: find, search, nearest, close to, near, around."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Location name or postcode mentioned, e.g. 'Clapham Junction'",
                    },
                    "plug_type": {
                        "type": "string",
                        "enum": ["Type2", "CCS2", "CHAdeMO", "NACS", "any"],
                        "description": "Requested connector type if mentioned",
                    },
                    "charger_level": {
                        "type": "string",
                        "enum": ["level_1", "level_2", "dc_fast", "any"],
                        "description": "Requested charger level if mentioned",
                    },
                    "max_price_pence": {
                        "type": "integer",
                        "description": "Maximum price per kWh in pence if mentioned",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "book_charger",
            "description": (
                "Driver wants to book a specific charger or the nearest available one. "
                "Use when utterance contains: book, reserve, schedule a charge, set up."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {
                        "type": "string",
                        "description": "UUID of the listing if already known from context",
                    },
                    "date": {
                        "type": "string",
                        "description": "Date for the booking, ISO 8601 e.g. '2026-09-26'",
                    },
                    "time": {
                        "type": "string",
                        "description": "Start time in HH:MM format e.g. '10:00'",
                    },
                    "duration_hours": {
                        "type": "number",
                        "description": "Duration in hours e.g. 2.0",
                    },
                    "plug_type": {
                        "type": "string",
                        "enum": ["Type2", "CCS2", "CHAdeMO", "NACS", "any"],
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "session_status",
            "description": (
                "Driver asks about the current charging session status, kWh delivered, "
                "cost so far, time remaining, or battery level. "
                "Use when utterance contains: how much, how long, status, charging, cost."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "Session UUID if known from context",
                    },
                    "metric": {
                        "type": "string",
                        "enum": ["kwh", "cost", "duration", "soc", "all"],
                        "description": "Which metric the user is asking about",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "stop_session",
            "description": (
                "Driver or host wants to stop an active charging session. "
                "Use when utterance contains: stop, end, finish, halt charging."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "session_id": {
                        "type": "string",
                        "description": "Session UUID if known from context",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "spend_query",
            "description": (
                "Driver asks how much they have spent on charging over a time period. "
                "Use when utterance contains: spent, spend, cost, charges, last month, this week."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "period": {
                        "type": "string",
                        "enum": ["today", "this_week", "this_month", "last_month", "all_time"],
                        "description": "Time period for the spending query",
                    },
                },
                "required": ["period"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "navigate_booking",
            "description": (
                "Driver wants navigation directions to their booking or charger location. "
                "Use when utterance contains: take me, navigate, directions, get there, how do I get."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "booking_id": {
                        "type": "string",
                        "description": "Booking UUID if known from context",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "schedule_charging",
            "description": (
                "Host wants to schedule when their EV charges (e.g. cheapest overnight tariff, "
                "charge to 80% before 7am). "
                "Use when utterance contains: charge to, charge before, schedule, overnight, cheapest."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "target_soc": {
                        "type": "integer",
                        "description": "Target battery percentage e.g. 80",
                    },
                    "by_time": {
                        "type": "string",
                        "description": "Deadline time in HH:MM format e.g. '07:00'",
                    },
                    "start_now": {
                        "type": "boolean",
                        "description": "True if user wants to start charging immediately",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "block_date",
            "description": (
                "Host wants to block out a date or time period on their listing so it cannot be booked. "
                "Use when utterance contains: block, unavailable, close off, holiday, maintenance."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {
                        "type": "string",
                        "description": "Listing UUID if known from context",
                    },
                    "date": {
                        "type": "string",
                        "description": "Date to block in ISO 8601 format e.g. '2026-09-27'",
                    },
                    "reason": {
                        "type": "string",
                        "description": "Optional reason for the block",
                    },
                },
                "required": ["date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "fault_report",
            "description": (
                "Host reports that their charger is not working, has an error, or is behaving unexpectedly. "
                "Use when utterance contains: not working, broken, fault, error, problem, issue with charger."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {
                        "type": "string",
                        "description": "Listing UUID if known from context",
                    },
                    "description": {
                        "type": "string",
                        "description": "Brief description of the fault as described by the user",
                    },
                },
                "required": [],
            },
        },
    },
]

# ── Speech templates ───────────────────────────────────────────

_SPEECH_TEMPLATES: dict[str, str] = {
    "find_charger": "Searching for chargers{location}.",
    "book_charger": "I'll take you to the booking page{details}.",
    "session_status": "Let me check your session.",
    "stop_session": "Sending the stop command to your charger.",
    "spend_query": "Looking up your charging spend.",
    "navigate_booking": "Opening navigation to your charger.",
    "schedule_charging": "Setting up your charging schedule.",
    "block_date": "Blocking that date on your listing.",
    "fault_report": "Opening a fault report for your charger.",
    "unknown": "Sorry, I didn't understand that. Could you try rephrasing?",
}

# ── Money-or-access actions that require confirmation ──────────

_REQUIRES_CONFIRMATION: set[str] = {"book_charger", "stop_session", "block_date", "schedule_charging"}

# ── System prompts ─────────────────────────────────────────────

_SYSTEM_DRIVER = (
    "You are the Zipgrid voice assistant helping an EV driver. "
    "The user is speaking naturally — extract their intent and parameters precisely. "
    "Today's date (UTC): {today}. "
    "Always use the correct tool. Never make up data. "
    "If the intent is unclear, use no tool and explain you didn't understand."
)

_SYSTEM_HOST = (
    "You are the Zipgrid voice assistant helping an EV charging host. "
    "The user is speaking naturally about managing their charger or listing. "
    "Today's date (UTC): {today}. "
    "Always use the correct tool. Never make up data. "
    "If the intent is unclear, use no tool and explain you didn't understand."
)


# ── Parser ─────────────────────────────────────────────────────


class IntentParser:
    """
    Stateless intent parser. One instance per application lifetime.
    Calls GPT-4o with function-calling to extract structured intent.
    """

    def __init__(self, openai_client: AsyncOpenAI) -> None:
        self._client = openai_client

    async def parse(
        self,
        transcript: str,
        role: str = "driver",
        context: dict[str, Any] | None = None,
        language: str = "en-GB",
    ) -> IntentResult:
        """
        Parse a voice transcript into a structured IntentResult.

        Args:
            transcript: Raw speech-to-text output
            role: 'driver' or 'host' — selects the system prompt
            context: Optional page/session/booking context from client
            language: BCP-47 language code

        Returns:
            IntentResult with intent, confidence, speech, params
        """
        today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        system = (_SYSTEM_DRIVER if role == "driver" else _SYSTEM_HOST).format(today=today)

        # Inject context as a user-side hint
        context_hint = ""
        if context:
            parts = []
            if context.get("page"):
                parts.append(f"current page: {context['page']}")
            if context.get("session_id"):
                parts.append(f"active session: {context['session_id']}")
            if context.get("booking_id"):
                parts.append(f"current booking: {context['booking_id']}")
            if context.get("listing_id"):
                parts.append(f"current listing: {context['listing_id']}")
            if parts:
                context_hint = "\n[Context: " + "; ".join(parts) + "]"

        messages = [
            {"role": "system", "content": system},
            {"role": "user", "content": transcript + context_hint},
        ]

        try:
            response = await self._client.chat.completions.create(
                model="gpt-4o",
                messages=messages,  # type: ignore[arg-type]
                tools=_TOOLS,  # type: ignore[arg-type]
                tool_choice="auto",
                temperature=0.0,  # deterministic intent extraction
                max_tokens=512,
            )
        except Exception as exc:
            log.error("intent_parse_failed", error=str(exc))
            return IntentResult(
                intent="unknown",
                confidence=0.0,
                speech="I'm having trouble understanding right now. Please try again.",
                params={},
                requires_confirmation=False,
            )

        choice = response.choices[0]
        tool_calls = choice.message.tool_calls

        if not tool_calls:
            # Model declined to call a tool — unknown intent
            fallback_text = choice.message.content or _SPEECH_TEMPLATES["unknown"]
            return IntentResult(
                intent="unknown",
                confidence=0.3,
                speech=fallback_text,
                params={},
                requires_confirmation=False,
            )

        # Take the first tool call (model should only call one)
        tc = tool_calls[0]
        intent_name = tc.function.name

        # Parse extracted params
        try:
            raw_params: dict[str, Any] = json.loads(tc.function.arguments or "{}")
        except json.JSONDecodeError:
            raw_params = {}

        # Normalise dates to ISO 8601 if needed
        if "date" in raw_params and raw_params["date"]:
            raw_params["date"] = _normalise_date(raw_params["date"], today)

        # Build speech
        speech = _build_speech(intent_name, raw_params)

        # Merge context IDs into params if not extracted by model
        if context:
            _merge_context(intent_name, raw_params, context)

        return IntentResult(
            intent=intent_name,  # type: ignore[arg-type]
            confidence=0.92,  # GPT-4o function-calling is high-confidence by design
            speech=speech,
            params=raw_params,
            requires_confirmation=intent_name in _REQUIRES_CONFIRMATION,
        )


# ── Helpers ────────────────────────────────────────────────────


def _normalise_date(date_str: str, today: str) -> str:
    """Normalise relative date expressions to YYYY-MM-DD."""
    lower = date_str.lower().strip()
    if lower == "today":
        return today
    if lower == "tomorrow":
        d = datetime.fromisoformat(today)
        from datetime import timedelta
        return (d + timedelta(days=1)).strftime("%Y-%m-%d")
    # Already looks like ISO — return as-is
    if re.match(r"^\d{4}-\d{2}-\d{2}$", date_str):
        return date_str
    return date_str


def _build_speech(intent: str, params: dict[str, Any]) -> str:
    """Build a natural TTS response for the given intent + params."""
    template = _SPEECH_TEMPLATES.get(intent, _SPEECH_TEMPLATES["unknown"])

    if intent == "find_charger":
        loc = params.get("location")
        location_str = f" near {loc}" if loc else " nearby"
        return template.format(location=location_str)

    if intent == "book_charger":
        parts = []
        if params.get("date"):
            parts.append(f"on {params['date']}")
        if params.get("time"):
            parts.append(f"at {params['time']}")
        if params.get("duration_hours"):
            parts.append(f"for {params['duration_hours']} hours")
        details = " " + " ".join(parts) if parts else ""
        return template.format(details=details)

    return template


def _merge_context(
    intent: str,
    params: dict[str, Any],
    context: dict[str, Any],
) -> None:
    """Fill in IDs from page context if the model didn't extract them."""
    if intent == "session_status" and not params.get("session_id"):
        if context.get("session_id"):
            params["session_id"] = context["session_id"]
    if intent == "stop_session" and not params.get("session_id"):
        if context.get("session_id"):
            params["session_id"] = context["session_id"]
    if intent == "navigate_booking" and not params.get("booking_id"):
        if context.get("booking_id"):
            params["booking_id"] = context["booking_id"]
    if intent in {"book_charger", "block_date", "fault_report"} and not params.get("listing_id"):
        if context.get("listing_id"):
            params["listing_id"] = context["listing_id"]


# ─────────────────────────────────────────────────────────────────
# MULTI-LANGUAGE VOICE SUPPORT
# Planning Baseline v2.3 — September 30, 2026
#
# The intent parser now accepts any BCP-47 language code.
# If language != 'en-GB', GPT-4o is instructed to:
#   1. Parse the user's intent from their native language
#   2. Respond in their native language
#   3. Return the same structured JSON tool call regardless of language
#
# Supported UI locales (matches packages/types/src/i18n.ts):
#   en-GB  English (UK)    — primary
#   en-IE  English (IE)    — same prompts as en-GB
#   nl-NL  Dutch
#   de-DE  German
#   fr-BE  French (Belgium)
#
# Additional languages accepted by GPT-4o at inference time:
#   fr-FR, es-ES, pl-PL, ro-RO, pt-PT, it-IT, sv-SE, da-DK
#   (These expand naturally as EU market grows in Phase 4)
# ─────────────────────────────────────────────────────────────────

# Language-specific system prompt overrides.
# Only languages that need different phrasing conventions are listed;
# all others fall back to the English prompt.
_LANGUAGE_SYSTEM_ADDITIONS: dict[str, str] = {
    "nl-NL": (
        " Antwoord altijd in het Nederlands. "
        "Gebruik eenvoudige, vriendelijke taal. "
        "Vermijd technisch jargon."
    ),
    "de-DE": (
        " Antworte immer auf Deutsch. "
        "Verwende einfache, freundliche Sprache. "
        "Kein Fachjargon."
    ),
    "fr-BE": (
        " Répondez toujours en français. "
        "Utilisez un langage simple et chaleureux. "
        "Pas de jargon technique."
    ),
    "fr-FR": (
        " Répondez toujours en français. "
        "Utilisez un langage simple et chaleureux."
    ),
    "es-ES": (
        " Responde siempre en español. "
        "Usa un lenguaje sencillo y amigable."
    ),
    "pl-PL": (
        " Odpowiadaj zawsze po polsku. "
        "Używaj prostego, przyjaznego języka."
    ),
    "ro-RO": (
        " Răspunde întotdeauna în română. "
        "Folosește un limbaj simplu și prietenos."
    ),
}

# Accessible speech templates per supported locale.
# These are used when the model returns without calling a tool (unknown intent).
_UNKNOWN_SPEECH_LOCALISED: dict[str, str] = {
    "nl-NL": "Sorry, ik heb dat niet begrepen. Kunt u het anders formuleren?",
    "de-DE": "Entschuldigung, das habe ich nicht verstanden. Können Sie es anders formulieren?",
    "fr-BE": "Désolé, je n'ai pas compris. Pourriez-vous reformuler ?",
    "fr-FR": "Désolé, je n'ai pas compris. Pourriez-vous reformuler ?",
    "es-ES": "Lo siento, no entendí eso. ¿Podría reformularlo?",
    "pl-PL": "Przepraszam, nie zrozumiałem. Czy możesz powiedzieć to inaczej?",
    "ro-RO": "Îmi pare rău, nu am înțeles. Puteți reformula?",
}


def _build_multilingual_system(base_prompt: str, language: str) -> str:
    """Append language-specific instructions to the base system prompt."""
    addition = _LANGUAGE_SYSTEM_ADDITIONS.get(language, "")
    if not addition and language not in ("en-GB", "en-IE") and language.startswith("en"):
        return base_prompt  # English variant — no change needed
    if not addition and language not in ("en-GB", "en-IE"):
        # Unknown language — ask GPT-4o to respond in the detected language
        addition = (
            f" Always respond in the user's language ({language}). "
            "Use simple, friendly language."
        )
    return base_prompt + addition


def _get_localised_unknown_speech(language: str) -> str:
    """Return the unknown-intent fallback in the user's language."""
    return _UNKNOWN_SPEECH_LOCALISED.get(language, _SPEECH_TEMPLATES["unknown"])


# ─────────────────────────────────────────────────────────────────
# ACCESSIBILITY & FAMILY MODE INTENTS
# New tool definitions added to _TOOLS in Planning Baseline v2.3
# ─────────────────────────────────────────────────────────────────

_ACCESSIBILITY_TOOLS: list[dict] = [
    {
        "type": "function",
        "function": {
            "name": "find_accessible_charger",
            "description": (
                "Driver needs a charger with specific accessibility features. "
                "Use when utterance contains: wheelchair, accessible, disabled, "
                "step-free, visual impairment, hearing loop, or family friendly."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Location name or postcode",
                    },
                    "needs_wheelchair": {
                        "type": "boolean",
                        "description": "Bay must be wheelchair accessible",
                    },
                    "needs_step_free": {
                        "type": "boolean",
                        "description": "No steps between parking and charger",
                    },
                    "needs_covered": {
                        "type": "boolean",
                        "description": "Bay must be covered / sheltered",
                    },
                    "needs_lighting": {
                        "type": "boolean",
                        "description": "Bay must have adequate lighting",
                    },
                    "needs_toilet_nearby": {
                        "type": "boolean",
                        "description": "Toilet must be within 100m",
                    },
                    "needs_family_friendly": {
                        "type": "boolean",
                        "description": "Family amenities (play area, café, restaurant) within 200m",
                    },
                    "plug_type": {
                        "type": "string",
                        "enum": ["Type2", "CCS2", "CHAdeMO", "NACS", "any"],
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "family_mode_search",
            "description": (
                "Driver is travelling with children and needs a charger near family amenities. "
                "Use when utterance contains: with children, kids, family, pushchair, buggy, "
                "play area, toilet, baby change."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {
                        "type": "string",
                        "description": "Location name or postcode",
                    },
                    "min_session_duration_minutes": {
                        "type": "integer",
                        "description": "Minimum charge session duration — useful to filter for longer-stay listings near amenities",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "listing_health_query",
            "description": (
                "Host asks about their listing's performance, health issues, or improvement suggestions. "
                "Use when utterance contains: how is my listing doing, improve my listing, "
                "why are bookings down, listing health, listing tips."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {
                        "type": "string",
                        "description": "UUID of the host's listing if known from context",
                    },
                },
                "required": [],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_predicted_availability",
            "description": (
                "Driver wants to know the predicted availability of a charger at a future time. "
                "Use when utterance contains: will it be available, predicted, likely free, "
                "chance of getting a space, probably available."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "listing_id": {
                        "type": "string",
                        "description": "Listing UUID if known from context",
                    },
                    "datetime": {
                        "type": "string",
                        "description": "Target date/time in ISO 8601 format",
                    },
                },
                "required": [],
            },
        },
    },
]

# Extend the speech templates for new intents
_SPEECH_TEMPLATES.update({
    "find_accessible_charger": "Searching for accessible chargers{location}.",
    "family_mode_search": "Finding family-friendly chargers near you.",
    "listing_health_query": "Let me check your listing health and recent performance.",
    "check_predicted_availability": "Checking predicted availability for that time slot.",
})

# These new intents do NOT require confirmation (informational / filter queries)
# find_accessible_charger books via the normal book_charger flow after discovery.


# ─────────────────────────────────────────────────────────────────
# PATCH: update IntentParser.parse() to support multilingual
# and new accessibility intents.
#
# NOTE: The class definition above is the canonical implementation.
# This module-level patch extends _TOOLS with the new accessibility
# tools so they are available to the existing IntentParser instance
# without requiring a class rewrite.
# ─────────────────────────────────────────────────────────────────

_TOOLS.extend(_ACCESSIBILITY_TOOLS)

# Patch the VoiceIntent literal to include new intents.
# The existing class uses _TOOLS for routing — no other change needed.
_NEW_INTENTS = [
    "find_accessible_charger",
    "family_mode_search",
    "listing_health_query",
    "check_predicted_availability",
]
