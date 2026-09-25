"""
@file safety.py
@description AI safety guardrails — input filtering, output validation, rate limits.
Prevents prompt injection, jailbreaks, and unsafe agentic actions.

Rules:
- System prompt loaded from env var — never from user input
- All user inputs sanitised before passing to LLM
- Agentic actions require explicit user confirmation before execution
- AI cannot directly make payments — only suggest and await approval

@module apps/ai-service/core
@version 0.1.0
@since 2026-09-25
@author Zipgrid Engineering
"""

BLOCKED_PATTERNS = [
    "ignore previous instructions",
    "you are now",
    "disregard your instructions",
    "new system prompt",
]


def is_safe_input(user_input: str) -> bool:
    """Checks user input against known prompt injection patterns."""
    lower = user_input.lower()
    return not any(pattern in lower for pattern in BLOCKED_PATTERNS)
