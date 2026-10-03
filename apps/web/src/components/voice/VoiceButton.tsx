/**
 * @file VoiceButton.tsx
 * @description Floating voice assistant button.
 * Integrates with VoiceService (Web Speech API + Whisper fallback) and
 * IntentRouter to execute commands on behalf of the driver or host.
 *
 * Usage: drop <VoiceButton role="driver" /> into any authenticated layout.
 * The button floats bottom-right, expands to show transcript, and collapses after speaking.
 *
 * @module apps/web/components/voice
 * @version 0.1.0
 * @since 2026-09-29
 * @author Zipgrid Engineering
 */

'use client'

import { useState, useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { Mic, MicOff, X, Loader2, Volume2 } from 'lucide-react'
import { cn } from '@/lib/utils'

/* ── Types ──────────────────────────────────────────────────── */

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking' | 'error'

type VoiceAction = {
  type: string
  url?: string
  sessionId?: string
  listingId?: string
  bookingId?: string
  date?: string
  hours?: number
}

type AgentResponse = {
  intent: string
  confidence: number
  speech: string
  action: VoiceAction
  requiresConfirmation: boolean
}

/* ── API ─────────────────────────────────────────────────────── */

/** Sends a voice transcript to the AI voice endpoint and returns a structured response. */
async function runVoiceCommand(transcript: string, role: string, context?: Record<string, string>): Promise<AgentResponse> {
  const res = await fetch('/api/v1/voice/command', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ transcript, role, context: context ?? {} }),
  })
  const json = await res.json() as { success: boolean; data?: AgentResponse; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Voice command failed')
  return json.data!
}

/* ── Component ──────────────────────────────────────────────── */

type Props = {
  role?: 'driver' | 'host'
  /** Optional page context to inject (e.g. current session/booking ID) */
  context?: Record<string, string>
  className?: string
}

/** Floating voice assistant button. Handles STT → AI → TTS + navigation. */
export function VoiceButton({ role = 'driver', context, className }: Props) {
  const router = useRouter()
  const [status, setStatusState]    = useState<VoiceStatus>('idle')
  const [transcript, setTranscriptState] = useState('')
  const [response, setResponse]     = useState('')
  const [expanded, setExpanded]     = useState(false)
  const [supported, setSupported]   = useState(true)
  const recognitionRef = useRef<SpeechRecognition | null>(null)
  // Recognition callbacks outlive renders; refs give them the live values.
  const statusRef = useRef<VoiceStatus>('idle')
  const transcriptRef = useRef('')

  const setStatus = useCallback((next: VoiceStatus) => {
    statusRef.current = next
    setStatusState(next)
  }, [])
  const setTranscript = useCallback((next: string) => {
    transcriptRef.current = next
    setTranscriptState(next)
  }, [])

  // Feature-detect on mount
  useEffect(() => {
    setSupported(Boolean(window.SpeechRecognition ?? window.webkitSpeechRecognition))
  }, [])

  const speak = useCallback((text: string) => {
    if (!('speechSynthesis' in window)) { setStatus('idle'); return }
    window.speechSynthesis.cancel()
    const utt = new SpeechSynthesisUtterance(text)
    utt.lang = 'en-GB'
    utt.rate = 1.05
    utt.onstart  = () => setStatus('speaking')
    utt.onend    = () => setStatus('idle')
    utt.onerror  = () => setStatus('idle')
    window.speechSynthesis.speak(utt)
  }, [setStatus])

  const executeAction = useCallback((action: VoiceAction) => {
    switch (action.type) {
      case 'navigate':
        if (action.url?.startsWith('/')) router.push(action.url)
        break
      case 'show_session_status':
        if (action.sessionId) router.push(`/session/${action.sessionId}`)
        break
      case 'navigate_to_booking':
        if (action.bookingId) router.push(`/bookings/${action.bookingId}`)
        break
      case 'stop_session':
        // The session page offers the stop control after navigation.
        if (action.sessionId) router.push(`/session/${action.sessionId}?action=stop`)
        break
      default:
        break
    }
  }, [router])

  const submit = useCallback(async (finalTranscript: string) => {
    if (!finalTranscript.trim()) { setStatus('idle'); return }
    setStatus('processing')
    try {
      const result = await runVoiceCommand(finalTranscript, role, context)
      setResponse(result.speech)
      speak(result.speech)
      if (!result.requiresConfirmation) executeAction(result.action)
    } catch {
      setStatus('error')
      const errMsg = "Sorry, I couldn't process that. Please try again."
      setResponse(errMsg)
      speak(errMsg)
    }
  }, [role, context, speak, executeAction, setStatus])

  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition ?? window.webkitSpeechRecognition
    if (!SR) { setStatus('error'); return }

    const recognition = new SR()
    recognition.lang = 'en-GB'
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    recognitionRef.current = recognition

    recognition.onstart = () => { setStatus('listening'); setExpanded(true); setTranscript('') }
    recognition.onresult = (e) => {
      const t = Array.from({ length: e.results.length }, (_, i) => e.results[i]?.[0]?.transcript ?? '').join('')
      setTranscript(t)
    }
    recognition.onerror = () => { setStatus('error'); setTimeout(() => setStatus('idle'), 2000) }
    recognition.onend = () => {
      recognitionRef.current = null
      // Natural end or user tapped stop: submit what we heard.
      if (statusRef.current === 'listening') void submit(transcriptRef.current)
    }

    recognition.start()
  }, [setStatus, setTranscript, submit])

  /** Stops listening (and submits), or stops speaking. */
  const stop = useCallback(() => {
    if (statusRef.current === 'listening') {
      recognitionRef.current?.stop()
      return
    }
    if (statusRef.current === 'speaking') window.speechSynthesis.cancel()
    setStatus('idle')
  }, [setStatus])

  /** Closes the panel, discarding anything in progress. */
  const dismiss = useCallback(() => {
    setStatus('idle')
    recognitionRef.current?.abort()
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setExpanded(false)
    setTranscript('')
    setResponse('')
  }, [setStatus, setTranscript])

  if (!supported) return null

  return (
    <div className={cn('fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3', className)}>
      {/* Expanded transcript card */}
      {expanded && (transcript || response) && (
        <div className="w-72 rounded-2xl bg-white shadow-xl border border-gray-200 p-4">
          <button onClick={dismiss} className="float-right text-gray-400 hover:text-gray-600" aria-label="Close voice assistant">
            <X className="h-4 w-4" />
          </button>
          {transcript && (
            <div className="mb-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">You said</p>
              <p className="mt-0.5 text-sm text-gray-900">{transcript}</p>
            </div>
          )}
          {response && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Assistant</p>
              <p className="mt-0.5 text-sm text-gray-700 leading-relaxed">{response}</p>
            </div>
          )}
        </div>
      )}

      {/* Main mic button */}
      <button
        onClick={status === 'idle' ? startListening : stop}
        aria-label={status === 'idle' ? 'Start voice command' : 'Stop listening'}
        aria-busy={status === 'processing'}
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-full shadow-lg transition-all focus-visible:outline focus-visible:outline-2 focus-visible:outline-green-500',
          status === 'idle'        && 'bg-green-600 hover:bg-green-700',
          status === 'listening'   && 'bg-red-500 animate-pulse hover:bg-red-600',
          status === 'processing'  && 'bg-amber-500 cursor-wait',
          status === 'speaking'    && 'bg-blue-500',
          status === 'error'       && 'bg-red-400',
        )}
      >
        {status === 'processing' ? (
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        ) : status === 'speaking' ? (
          <Volume2 className="h-6 w-6 text-white" />
        ) : status === 'listening' ? (
          <MicOff className="h-6 w-6 text-white" />
        ) : (
          <Mic className="h-6 w-6 text-white" />
        )}
      </button>

      {/* Status label */}
      {status !== 'idle' && (
        <span className="rounded-full bg-gray-900/80 px-3 py-1 text-xs font-medium text-white backdrop-blur-sm">
          {status === 'listening'  && '🎙 Listening…'}
          {status === 'processing' && '⚡ Processing…'}
          {status === 'speaking'   && '🔊 Speaking…'}
          {status === 'error'      && '❌ Error — tap to retry'}
        </span>
      )}
    </div>
  )
}
