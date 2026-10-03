/**
 * @file ConciergeChat.tsx
 * @description Chat with the AI concierge (POST /api/v1/concierge). Shared by
 * the driver concierge and the host revenue advisor; the server decides what
 * the user can do from their role.
 *
 * Voice: the mic uses the browser's speech recognition; replies can be read
 * aloud. Location is only sent when the user turns it on.
 *
 * @module components/concierge
 */

'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { CheckCircle2, Loader2, LocateFixed, Mic, MicOff, Plus, Send, Sparkles, Volume2, VolumeX } from 'lucide-react'
import { cn } from '@/lib/utils'

type Line = { role: 'user' | 'assistant'; text: string }
type Pending = { actionId: string; summary: string }
type Reply = {
  conversationId: string
  reply: string
  pendingActions: Pending[]
  completedActions: { kind: string; summary: string }[]
}
type Envelope<T> = { success: true; data: T } | { success: false; error: { code: string; message: string } }

// Minimal typing for the Web Speech API (not in lib.dom for all browsers).
type Recognition = {
  lang: string
  interimResults: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}
function speechRecognition(): (new () => Recognition) | null {
  if (typeof window === 'undefined') return null
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null
}

async function api<T>(init?: { method: string; body: unknown }): Promise<T> {
  const res = await fetch('/api/v1/concierge', {
    method: init?.method ?? 'GET',
    credentials: 'include',
    headers: init ? { 'Content-Type': 'application/json' } : undefined,
    body: init ? JSON.stringify(init.body) : undefined,
  })
  const json = await res.json().catch(() => null) as Envelope<T> | null
  if (!json) throw new Error('Something went wrong. Please try again.')
  if (!json.success) {
    throw new Error(json.error.code === 'SERVICE_UNAVAILABLE'
      ? "The concierge isn't switched on yet. Please try again later."
      : json.error.message)
  }
  return json.data
}

/** Concierge chat. */
export function ConciergeChat({ title, tagline, intro, suggestions, placeholder, footer, className, initialMessage }: {
  title: string
  tagline: string
  intro: string
  suggestions: string[]
  placeholder: string
  footer?: React.ReactNode
  /** Pre-filled into the message box (e.g. a request handed over from the trip planner). */
  initialMessage?: string | undefined
  className?: string
}) {
  const [lines, setLines] = useState<Line[]>([])
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [pending, setPending] = useState<Pending[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [listening, setListening] = useState(false)
  const [speak, setSpeak] = useState(false)
  const [location, setLocation] = useState<{ lat: number; lng: number } | null>(null)
  const [locating, setLocating] = useState(false)
  const recognition = useRef<Recognition | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const canListen = speechRecognition() !== null
  const initialSent = useRef(false)

  useEffect(() => {
    api<{ conversationId: string | null; lines: Line[] }>()
      .then((d) => { setConversationId(d.conversationId); setLines(d.lines) })
      .catch(() => undefined)
    try { setSpeak(localStorage.getItem('zg:concierge:speak') === '1') } catch { /* storage unavailable */ }
  }, [])

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }) }, [lines, busy])

  const say = useCallback((text: string) => {
    if (!speak || typeof window === 'undefined' || !('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-GB'
    window.speechSynthesis.speak(u)
  }, [speak])

  const send = useCallback(async (text: string) => {
    const message = text.trim()
    if (!message || busy) return
    setBusy(true)
    setError(null)
    setInput('')
    setPending([])
    setLines((l) => [...l, { role: 'user', text: message }])
    try {
      const r = await api<Reply>({ method: 'POST', body: { message, conversationId, location } })
      setConversationId(r.conversationId)
      setLines((l) => [...l, { role: 'assistant', text: r.reply }])
      setPending(r.pendingActions)
      say(r.reply)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }, [busy, conversationId, location, say])

  // A handed-over request fills the box; the user sends it. Never auto-send:
  // a crafted link could otherwise say "yes" to a pending booking for them.
  useEffect(() => {
    if (!initialMessage || initialSent.current) return
    initialSent.current = true
    setInput(initialMessage)
    window.history.replaceState(null, '', window.location.pathname)
  }, [initialMessage])

  const toggleMic = () => {
    if (listening) { recognition.current?.stop(); return }
    const Ctor = speechRecognition()
    if (!Ctor) return
    const rec = new Ctor()
    rec.lang = 'en-GB'
    rec.interimResults = false
    rec.onresult = (e) => {
      const transcript = e.results[0]?.[0]?.transcript ?? ''
      if (transcript) void send(transcript)
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recognition.current = rec
    setListening(true)
    rec.start()
  }

  const toggleLocation = () => {
    if (location) { setLocation(null); return }
    if (!navigator.geolocation) { setError('Location is not available on this device.'); return }
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (p) => { setLocation({ lat: p.coords.latitude, lng: p.coords.longitude }); setLocating(false) },
      () => { setError('Could not get your location. You can type a town or postcode instead.'); setLocating(false) },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    )
  }

  const toggleSpeak = () => {
    setSpeak((s) => {
      try { localStorage.setItem('zg:concierge:speak', s ? '0' : '1') } catch { /* storage unavailable */ }
      if (s && typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel()
      return !s
    })
  }

  const newChat = () => {
    setConversationId(null); setLines([]); setPending([]); setError(null)
  }

  return (
    <div className={cn('mx-auto flex max-w-2xl flex-col', className)}>
      <header className="flex items-center justify-between gap-2 border-b border-[hsl(var(--border))] px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)]">
            <Sparkles className="h-4 w-4 text-[hsl(var(--primary))]" aria-hidden="true" />
          </span>
          <div>
            <h1 className="text-base font-semibold leading-tight">{title}</h1>
            <p className="text-xs text-[hsl(var(--muted-foreground))]">{tagline}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <IconToggle on={speak} onClick={toggleSpeak} label={speak ? 'Stop reading replies aloud' : 'Read replies aloud'}>
            {speak ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          </IconToggle>
          <IconToggle on={Boolean(location)} onClick={toggleLocation} label={location ? 'Stop sharing location' : 'Share my location'}>
            {locating ? <Loader2 className="h-4 w-4 animate-spin" /> : <LocateFixed className="h-4 w-4" />}
          </IconToggle>
          <IconToggle on={false} onClick={newChat} label="New conversation">
            <Plus className="h-4 w-4" />
          </IconToggle>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-4" aria-live="polite">
        {lines.length === 0 && !busy && (
          <div className="flex flex-col gap-3 pt-6">
            <p className="text-sm text-[hsl(var(--muted-foreground))]">{intro}</p>
            <div className="flex flex-col gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void send(s)}
                  className="rounded-lg border border-[hsl(var(--border))] px-3 py-2 text-left text-sm transition-colors hover:bg-[hsl(var(--muted))]"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}

        <ol className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <li key={i} className={cn('flex', l.role === 'user' ? 'justify-end' : 'justify-start')}>
              <p className={cn(
                'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm',
                l.role === 'user'
                  ? 'bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]'
                  : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]',
              )}>
                {l.text}
              </p>
            </li>
          ))}
        </ol>

        {pending.length > 0 && !busy && (
          <div className="mt-3 flex flex-col gap-2">
            {pending.length > 1 && (
              <button
                type="button"
                onClick={() => void send(`Yes, go ahead with all ${pending.length}: ${pending.map((p) => p.summary).join(' ')}`)}
                className="inline-flex items-center justify-center gap-1.5 self-start rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
              >
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Confirm all {pending.length}
              </button>
            )}
            {pending.map((p) => (
              <div key={p.actionId} className="flex flex-col gap-2 rounded-lg border border-[hsl(var(--primary)/0.4)] bg-[hsl(var(--primary)/0.05)] p-3">
                <p className="text-sm">{p.summary}</p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void send(`Yes, go ahead: ${p.summary}`)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(var(--primary))] px-3 py-1.5 text-sm font-semibold text-[hsl(var(--primary-foreground))]"
                  >
                    <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => void send("No, don't do that.")}
                    className="rounded-md border border-[hsl(var(--border))] px-3 py-1.5 text-sm"
                  >
                    Not now
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {busy && (
          <p className="mt-3 inline-flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Working on it…
          </p>
        )}
        {error && <p role="alert" className="mt-3 text-sm text-[hsl(var(--destructive))]">{error}</p>}
        <div ref={endRef} />
      </div>

      <form
        onSubmit={(e) => { e.preventDefault(); void send(input) }}
        className="flex items-center gap-2 border-t border-[hsl(var(--border))] px-3 py-3"
      >
        {canListen && (
          <button
            type="button"
            onClick={toggleMic}
            disabled={busy}
            aria-label={listening ? 'Stop listening' : 'Speak'}
            className={cn(
              'flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full transition-colors disabled:opacity-50',
              listening ? 'animate-pulse bg-[hsl(var(--destructive))] text-white' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]',
            )}
          >
            {listening ? <MicOff className="h-5 w-5" /> : <Mic className="h-5 w-5" />}
          </button>
        )}
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          maxLength={2000}
          placeholder={listening ? 'Listening…' : placeholder}
          aria-label="Message the concierge"
          className="h-10 min-w-0 flex-1 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 text-sm focus:outline-none focus:ring-2 focus:ring-[hsl(var(--primary)/0.4)]"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="Send"
          className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] disabled:opacity-50"
        >
          <Send className="h-4 w-4" />
        </button>
      </form>
      {footer && <p className="px-4 pb-2 text-center text-[10px] text-[hsl(var(--muted-foreground))]">{footer}</p>}
    </div>
  )
}

function IconToggle({ on, onClick, label, children }: { on: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={on}
      title={label}
      className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full transition-colors',
        on ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]',
      )}
    >
      {children}
    </button>
  )
}
