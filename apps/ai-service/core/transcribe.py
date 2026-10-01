"""
@file transcribe.py
@description Whisper STT (speech-to-text) fallback transcription module.

Used when the client browser does not support the Web Speech API (Firefox,
some Android WebViews) or when higher accuracy is required (noisy environments).

Architecture
------------
- POST /agent/transcribe accepts multipart/form-data with an audio file
- Audio is passed directly to the OpenAI Whisper API (whisper-1 model)
- Returns transcript + confidence metadata
- Max audio file size: 25 MB (OpenAI Whisper limit)
- Supported formats: mp3, mp4, mpeg, mpga, m4a, wav, webm

Rate limiting: 20 transcriptions per minute per user_id (more expensive than text).

@module apps/ai-service/core
@version 0.1.0
@since 2026-09-29
@author Zipgrid Engineering
"""

from __future__ import annotations

import os
from typing import TYPE_CHECKING

import structlog
from fastapi import HTTPException, UploadFile

if TYPE_CHECKING:
    from openai import AsyncOpenAI

log = structlog.get_logger(__name__)

# Supported audio MIME types / extensions accepted by Whisper
SUPPORTED_CONTENT_TYPES = {
    "audio/mpeg",
    "audio/mp3",
    "audio/mp4",
    "audio/x-m4a",
    "audio/m4a",
    "audio/wav",
    "audio/x-wav",
    "audio/webm",
    "audio/ogg",
    "video/webm",       # webm from browser MediaRecorder
    "application/octet-stream",  # fallback for some mobile browsers
}

# Extension fallback map when content-type is generic
EXTENSION_MAP = {
    ".mp3": "audio/mpeg",
    ".mp4": "audio/mp4",
    ".m4a": "audio/x-m4a",
    ".wav": "audio/wav",
    ".webm": "video/webm",
    ".ogg": "audio/ogg",
    ".mpga": "audio/mpeg",
}

MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB Whisper limit

# Rate limit counters: {user_id: count} — reset externally by main.py
_transcription_counters: dict[str, int] = {}
TRANSCRIPTION_RATE_LIMIT = 20  # per minute


class TranscriptionResult:
    __slots__ = ("text", "language", "duration_seconds", "word_count")

    def __init__(
        self,
        text: str,
        language: str = "en",
        duration_seconds: float = 0.0,
    ) -> None:
        self.text             = text.strip()
        self.language         = language
        self.duration_seconds = duration_seconds
        self.word_count       = len(text.split())


async def transcribe_audio(
    audio_file: UploadFile,
    user_id: str,
    language: str,
    openai_client: "AsyncOpenAI",
) -> TranscriptionResult:
    """
    Transcribe an audio file using OpenAI Whisper.

    Args:
        audio_file:    The uploaded audio file (FastAPI UploadFile)
        user_id:       Authenticated user ID (for rate limiting + logging)
        language:      BCP 47 language hint (e.g. 'en', 'en-GB')
        openai_client: Shared AsyncOpenAI instance from app lifespan

    Returns:
        TranscriptionResult with transcript text and metadata

    Raises:
        HTTPException 400 — unsupported file type or file too large
        HTTPException 429 — rate limit exceeded
        HTTPException 502 — Whisper API error
    """
    # Rate limit check
    count = _transcription_counters.get(user_id, 0)
    if count >= TRANSCRIPTION_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail="Transcription rate limit exceeded — 20 per minute",
        )
    _transcription_counters[user_id] = count + 1

    # Validate content type
    content_type = audio_file.content_type or "application/octet-stream"
    filename = audio_file.filename or "audio.webm"
    ext = "." + filename.rsplit(".", 1)[-1].lower() if "." in filename else ""

    if content_type not in SUPPORTED_CONTENT_TYPES:
        # Try to infer from extension
        inferred = EXTENSION_MAP.get(ext)
        if inferred:
            content_type = inferred
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported audio type: {content_type}. Use mp3, m4a, wav, webm, or ogg.",
            )

    # Read file bytes
    audio_bytes = await audio_file.read()

    if len(audio_bytes) == 0:
        raise HTTPException(status_code=400, detail="Empty audio file")

    if len(audio_bytes) > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"Audio file too large: {len(audio_bytes) // 1024 // 1024} MB. Max is 25 MB.",
        )

    # Normalise language code (BCP 47 → ISO 639-1 that Whisper expects)
    whisper_language = language.split("-")[0].lower() if language else "en"

    log.info(
        "transcribe_start",
        user_id=user_id,
        size_bytes=len(audio_bytes),
        content_type=content_type,
        language=whisper_language,
    )

    # Call Whisper API
    try:
        # Build a file-like tuple for the OpenAI client
        file_tuple = (filename, audio_bytes, content_type)

        response = await openai_client.audio.transcriptions.create(
            model="whisper-1",
            file=file_tuple,  # type: ignore[arg-type]
            language=whisper_language,
            response_format="verbose_json",  # includes duration + language detection
        )

        # verbose_json returns a Transcription object with text + segments
        text: str = getattr(response, "text", "") or ""
        detected_language: str = getattr(response, "language", whisper_language) or whisper_language
        duration: float = getattr(response, "duration", 0.0) or 0.0

        log.info(
            "transcribe_success",
            user_id=user_id,
            word_count=len(text.split()),
            duration_seconds=duration,
            detected_language=detected_language,
        )

        return TranscriptionResult(
            text=text,
            language=detected_language,
            duration_seconds=duration,
        )

    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        log.error("transcribe_error", user_id=user_id, error=str(exc))
        raise HTTPException(
            status_code=502,
            detail="Transcription service temporarily unavailable. Please try again.",
        ) from exc


def reset_rate_counters() -> None:
    """Reset all per-user transcription counters. Called every minute by main.py."""
    _transcription_counters.clear()
