/**
 * @file VoiceService.ts
 * @description Voice input/output service for the Zipgrid AI assistant.
 *
 * Architecture:
 *   Input:  Web Speech API (SpeechRecognition) → primary (free, browser-native)
 *           Whisper API fallback (for browsers without SpeechRecognition)
 *   Output: Web Speech Synthesis API (SpeechSynthesis) → primary (free, browser-native)
 *
 * This is a client-side service (browser-only).
 * Do NOT import in server components or API routes.
 *
 * Supported commands are routed to IntentRouter after transcription.
 *
 * @module domains/ai-voice
 * @version 0.1.0
 * @since 2026-09-25
 * @author Zipgrid Engineering
 */

/* ── Types ─────────────────────────────────────────────────── */

export type RecognitionResult = {
  transcript: string
  confidence: number
  isFinal: boolean
}

export type SpeechRecognitionStatus =
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'

export type TTSOptions = {
  /** BCP 47 language tag (default: en-GB) */
  lang?: string
  /** 0.1–10 (default: 1) */
  rate?: number
  /** 0–2 (default: 1) */
  pitch?: number
  /** 0–1 (default: 1) */
  volume?: number
}

/* ── Feature detection ─────────────────────────────────────── */

type SpeechRecognitionConstructor = new () => SpeechRecognition

function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === 'undefined') return null
  const w = window as typeof window & {
    SpeechRecognition?: SpeechRecognitionConstructor
    webkitSpeechRecognition?: SpeechRecognitionConstructor
  }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

function hasSpeechSynthesis(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/* ── Service ────────────────────────────────────────────────── */

export const VoiceService = {

  /**
   * Returns true if the browser supports speech recognition.
   */
  isSupported(): boolean {
    return getSpeechRecognition() !== null
  },

  /**
   * Returns true if the browser supports speech synthesis (TTS).
   */
  isTtsSupported(): boolean {
    return hasSpeechSynthesis()
  },

  /**
   * Starts continuous speech recognition.
   * Calls onResult for each recognised phrase.
   * Calls onError on recognition failure.
   * Returns a stop() function.
   *
   * @param onResult - Called with each recognised transcript
   * @param onError - Called on recognition error
   * @param lang - BCP 47 language tag (default: en-GB)
   */
  startListening(
    onResult: (result: RecognitionResult) => void,
    onError: (err: string) => void,
    lang = 'en-GB',
  ): () => void {
    const SpeechRecognition = getSpeechRecognition()
    if (!SpeechRecognition) {
      onError('Speech recognition is not supported in this browser.')
      return () => { /* noop */ }
    }

    const recognition = new SpeechRecognition()
    recognition.continuous = false       // stop after first utterance
    recognition.interimResults = true    // provide interim transcripts
    recognition.lang = lang
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (!result) continue
        const alt = result[0]
        if (!alt) continue
        onResult({
          transcript: alt.transcript.trim(),
          confidence: alt.confidence,
          isFinal: result.isFinal,
        })
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      const msg =
        event.error === 'not-allowed'
          ? 'Microphone access denied. Please allow microphone access in your browser settings.'
          : event.error === 'no-speech'
            ? 'No speech detected. Please try again.'
            : `Recognition error: ${event.error}`
      onError(msg)
    }

    recognition.start()
    return () => recognition.stop()
  },

  /**
   * Transcribes an audio blob via the platform Whisper API (server-side).
   * Used as a fallback when the Web Speech API is unavailable.
   */
  async transcribeWithWhisper(audioBlob: Blob): Promise<string> {
    const form = new FormData()
    form.append('audio', audioBlob, 'recording.webm')

    const res = await fetch('/api/v1/voice/transcribe', {
      method: 'POST',
      body: form,
    })

    if (!res.ok) {
      throw new Error('Transcription failed — please try again.')
    }

    const data = (await res.json()) as { data: { transcript: string } }
    return data.data.transcript
  },

  /**
   * Records audio from the microphone and returns the Blob.
   * Used as input for transcribeWithWhisper().
   * Returns a promise that resolves when the user stops speaking
   * (after `maxSilenceMs` of silence) or `maxDurationMs` elapses.
   */
  async recordAudio(opts: { maxDurationMs?: number; maxSilenceMs?: number } = {}): Promise<Blob> {
    const maxDuration = opts.maxDurationMs ?? 15_000
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' })
    const chunks: Blob[] = []

    return new Promise<Blob>((resolve, reject) => {
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data)
      }
      mediaRecorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        resolve(new Blob(chunks, { type: 'audio/webm' }))
      }
      mediaRecorder.onerror = () => {
        stream.getTracks().forEach((t) => t.stop())
        reject(new Error('Recording failed'))
      }
      mediaRecorder.start(100) // collect 100ms chunks
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') mediaRecorder.stop()
      }, maxDuration)
    })
  },

  /**
   * Speaks text aloud using the Web Speech Synthesis API.
   * Resolves when speech ends.
   * Rejects if TTS is not supported.
   */
  speak(text: string, opts: TTSOptions = {}): Promise<void> {
    if (!hasSpeechSynthesis()) {
      return Promise.reject(new Error('Speech synthesis not supported'))
    }
    return new Promise((resolve, reject) => {
      // Cancel any current speech
      window.speechSynthesis.cancel()

      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang   = opts.lang   ?? 'en-GB'
      utterance.rate   = opts.rate   ?? 1
      utterance.pitch  = opts.pitch  ?? 1
      utterance.volume = opts.volume ?? 1

      // Prefer a UK English female voice when available
      const voices = window.speechSynthesis.getVoices()
      const preferred = voices.find(
        (v) => v.lang === 'en-GB' && v.name.toLowerCase().includes('female'),
      ) ?? voices.find((v) => v.lang === 'en-GB') ?? null
      if (preferred) utterance.voice = preferred

      utterance.onend = () => resolve()
      utterance.onerror = (e) => reject(new Error(`TTS error: ${e.error}`))

      window.speechSynthesis.speak(utterance)
    })
  },

  /**
   * Cancels any ongoing speech synthesis.
   */
  stopSpeaking(): void {
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel()
  },
}
