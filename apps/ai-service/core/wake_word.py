"""
@file wake_word.py
@description "Hey Zipgrid" always-on wake word detection.

Architecture:
  Browser: Web Audio API → AudioWorklet → keyword detector (Porcupine.js or Picovoice)
  Mobile:  expo-av + custom keyword detection OR Picovoice React Native SDK
  Server:  This module processes the confirmed wake word event and returns
           a greeting + opening prompt to the voice interface.

Wake word flow:
  1. Client detects "Hey Zipgrid" locally (on-device, no audio sent to server)
  2. Client sends POST /api/v1/voice/wake with { userId, context }
  3. Server returns { greeting, mode } — client plays greeting via TTS
  4. Client opens microphone for intent capture
  5. Captured audio/transcript routed to /agent/voice for processing

This module handles step 3 — returning a context-aware greeting.

@module apps/ai-service/core
@version 0.1.0
@since 2026-09-29
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
import random
from typing import Any

import structlog

log = structlog.get_logger(__name__)

# Greeting variants (rotated to avoid feeling robotic)
_DRIVER_GREETINGS = [
    "Hi, how can I help with your charging today?",
    "Hey! Ready to find or manage your charge?",
    "Zipgrid here. What do you need?",
    "Hello! Looking for a charger, or checking your session?",
]

_HOST_GREETINGS = [
    "Hi! Want to check your earnings or manage your charger?",
    "Hey, what's on your mind — bookings, earnings, or your charger?",
    "Zipgrid here. How can I help with your listing today?",
]

_CONTEXT_GREETINGS = {
    "map":            "I can see you're on the map. Want me to find a charger near you?",
    "session":        "You're in an active session. How's it going — need to check status or stop charging?",
    "booking":        "You've got a booking open. Need to check details or get directions?",
    "host/dashboard": "You're in the host dashboard. Earnings check, session status, or something else?",
    "host/listings":  "Looking at your listings. Want to update pricing, availability, or something else?",
}


def build_greeting(
    role: str,
    context: dict[str, Any] | None = None,
) -> dict[str, str]:
    """
    Build a wake word greeting response.

    Args:
        role:    'driver' or 'host'
        context: Optional page/session context dict
                 e.g. {'page': 'session', 'sessionId': 'xxx'}

    Returns:
        dict with 'greeting' (for TTS) and 'mode' (standard|hybrid|agentic)
    """
    # Check for context-specific greeting
    page = (context or {}).get("page", "")
    if page and page in _CONTEXT_GREETINGS:
        greeting = _CONTEXT_GREETINGS[page]
    elif role == "host":
        greeting = random.choice(_HOST_GREETINGS)
    else:
        greeting = random.choice(_DRIVER_GREETINGS)

    # Determine AI mode based on context
    mode = "hybrid"
    if (context or {}).get("sessionId"):
        mode = "standard"   # fast response during active charging
    elif role == "host" and page in ("host/analytics", "smb/analytics"):
        mode = "agentic"    # complex queries need more tool calls

    log.info("wake_word_triggered", role=role, page=page, mode=mode)

    return {
        "greeting":  greeting,
        "mode":      mode,
        "listening": True,
    }
