/**
 * @file SessionScreen.tsx
 * @description Live charging session monitor screen.
 * Polls GET /api/v1/sessions/[id] every 5 seconds for real-time meter values.
 * Displays kWh, cost, power, SoC, elapsed time. Stop button sends RemoteStop.
 *
 * @module apps/mobile/screens
 */

import { useEffect, useState, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity,
  ActivityIndicator, Alert, Platform,
} from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { api } from '../lib/api'

type SessionState = {
  id: string
  status: 'preparing' | 'charging' | 'paused' | 'finishing' | 'completed' | 'faulted'
  bookingId: string
  energyConsumedWh: number
  totalCostPence: number
  pricePerKwhPence: number
  powerW: number | null
  socPercent: number | null
  startedAt: string
  listingTitle: string
  listingCity: string
  listingId: string | null
}

function formatDuration(startedAt: string): string {
  const ms = Date.now() - new Date(startedAt).getTime()
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  const s = Math.floor((ms % 60_000) / 1000)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()

  const [session, setSession] = useState<SessionState | null>(null)
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(false)
  const [elapsed, setElapsed] = useState('0s')
  const intervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchSession = useCallback(async () => {
    const res = await api.get<SessionState>(`/api/v1/sessions/${id}`)
    if (res.success) setSession(res.data)
    setLoading(false)
  }, [id])

  // Poll every 5 seconds
  useEffect(() => {
    void fetchSession()
    intervalRef.current = setInterval(() => void fetchSession(), 5000)
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [fetchSession])

  // Elapsed timer
  useEffect(() => {
    if (!session?.startedAt || session.status === 'completed') return
    const timer = setInterval(() => setElapsed(formatDuration(session.startedAt)), 1000)
    return () => clearInterval(timer)
  }, [session?.startedAt, session?.status])

  const handleStop = () => {
    Alert.alert(
      'Stop charging?',
      'Your session will end and payment will be captured.',
      [
        { text: 'Keep charging', style: 'cancel' },
        {
          text: 'Stop',
          style: 'destructive',
          onPress: async () => {
            setStopping(true)
            const res = await api.post(`/api/v1/sessions/${id}/stop`, {})
            setStopping(false)
            if (res.success) void fetchSession()
            else Alert.alert('Error', 'Stop command failed. Please try again.')
          },
        },
      ],
    )
  }

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    )
  }

  if (!session) {
    return (
      <View style={styles.centred}>
        <Text style={styles.errorText}>Session not found.</Text>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.link}>← Back to bookings</Text>
        </TouchableOpacity>
      </View>
    )
  }

  const kwhDelivered = session.energyConsumedWh / 1000
  const costPounds   = session.totalCostPence / 100
  const powerKw      = session.powerW != null ? session.powerW / 1000 : null
  const isActive     = ['preparing', 'charging', 'paused', 'finishing'].includes(session.status)
  const isCompleted  = session.status === 'completed'
  const isCharging   = session.status === 'charging'

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle} numberOfLines={1}>{session.listingTitle}</Text>
        <Text style={styles.headerSub}>{session.listingCity}</Text>
        <View style={[styles.statusPill, { backgroundColor: isCharging ? '#00C85320' : '#F3F4F6' }]}>
          <Text style={[styles.statusText, { color: isCharging ? '#00C853' : '#6B7280' }]}>
            {isCharging ? '⚡ Charging' : session.status.charAt(0).toUpperCase() + session.status.slice(1)}
          </Text>
        </View>
      </View>

      {/* Primary metric */}
      <View style={styles.primaryMetric}>
        <Text style={styles.kwhValue}>{kwhDelivered.toFixed(2)}</Text>
        <Text style={styles.kwhUnit}>kWh delivered</Text>
      </View>

      {/* Secondary metrics */}
      <View style={styles.metricGrid}>
        {[
          { label: 'Cost',     value: `£${costPounds.toFixed(2)}` },
          { label: 'Duration', value: isCompleted ? '—' : elapsed },
          { label: powerKw != null ? 'Power' : 'Rate',
            value: powerKw != null ? `${powerKw.toFixed(1)}kW` : `${session.pricePerKwhPence}p/kWh` },
        ].map(({ label, value }) => (
          <View key={label} style={styles.metricCell}>
            <Text style={styles.metricLabel}>{label}</Text>
            <Text style={styles.metricValue}>{value}</Text>
          </View>
        ))}
      </View>

      {/* SoC bar */}
      {session.socPercent != null && (
        <View style={styles.socContainer}>
          <View style={styles.socRow}>
            <Text style={styles.socLabel}>🔋 Battery</Text>
            <Text style={styles.socPct}>{session.socPercent}%</Text>
          </View>
          <View style={styles.socTrack}>
            <View style={[styles.socFill, { width: `${session.socPercent}%` as `${number}%` }]} />
          </View>
        </View>
      )}

      {/* Stop button */}
      {isActive && (
        <TouchableOpacity
          style={[styles.stopBtn, stopping && styles.stopBtnDisabled]}
          onPress={handleStop}
          disabled={stopping}
          accessibilityRole="button"
          accessibilityLabel="Stop charging"
        >
          {stopping
            ? <ActivityIndicator color="#EF4444" />
            : <Text style={styles.stopBtnText}>■  Stop charging</Text>
          }
        </TouchableOpacity>
      )}

      {/* Completed state */}
      {isCompleted && (
        <View style={styles.completedState}>
          <Text style={styles.completedIcon}>✅</Text>
          <Text style={styles.completedTitle}>Session complete</Text>
          <Text style={styles.completedSub}>
            {kwhDelivered.toFixed(2)} kWh · £{costPounds.toFixed(2)}
          </Text>
          <TouchableOpacity
            style={styles.viewReceiptBtn}
            onPress={() => router.push(`/driver/bookings/${session.bookingId}`)}
          >
            <Text style={styles.viewReceiptText}>View session receipt</Text>
          </TouchableOpacity>
        </View>
      )}

      {isCharging && (
        <Text style={styles.pollNote}>Updates every 5 seconds</Text>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container:       { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 20, gap: 24 },
  centred:         { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 },
  header:          { alignItems: 'center', gap: 4 },
  headerTitle:     { fontSize: 16, fontWeight: '700', color: '#111' },
  headerSub:       { fontSize: 13, color: '#6B7280' },
  statusPill:      { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, marginTop: 4 },
  statusText:      { fontSize: 12, fontWeight: '600' },
  primaryMetric:   { alignItems: 'center', gap: 4 },
  kwhValue:        { fontSize: 72, fontWeight: '800', color: '#111', fontVariant: ['tabular-nums'], letterSpacing: -2 },
  kwhUnit:         { fontSize: 14, color: '#6B7280' },
  metricGrid:      { flexDirection: 'row', gap: 12 },
  metricCell:      { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingVertical: 12 },
  metricLabel:     { fontSize: 11, color: '#6B7280' },
  metricValue:     { fontSize: 16, fontWeight: '700', color: '#111', marginTop: 4, fontVariant: ['tabular-nums'] },
  socContainer:    { gap: 8 },
  socRow:          { flexDirection: 'row', justifyContent: 'space-between' },
  socLabel:        { fontSize: 13, color: '#6B7280' },
  socPct:          { fontSize: 13, fontWeight: '700', color: '#111' },
  socTrack:        { height: 12, backgroundColor: '#F3F4F6', borderRadius: 8, overflow: 'hidden' },
  socFill:         { height: '100%', backgroundColor: '#00C853', borderRadius: 8 },
  stopBtn: {
    height: 56,
    borderWidth: 2,
    borderColor: '#EF444460',
    backgroundColor: '#EF444410',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 8,
  },
  stopBtnDisabled: { opacity: 0.6 },
  stopBtnText:     { fontSize: 16, fontWeight: '700', color: '#EF4444' },
  completedState:  { alignItems: 'center', gap: 8, paddingVertical: 24 },
  completedIcon:   { fontSize: 48 },
  completedTitle:  { fontSize: 18, fontWeight: '700', color: '#111' },
  completedSub:    { fontSize: 14, color: '#6B7280' },
  viewReceiptBtn:  { marginTop: 8, backgroundColor: '#00C853', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  viewReceiptText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  errorText:       { fontSize: 14, color: '#888' },
  link:            { color: '#00C853', fontWeight: '600', marginTop: 8 },
  pollNote:        { textAlign: 'center', fontSize: 11, color: '#9CA3AF', paddingBottom: Platform.OS === 'ios' ? 24 : 8 },
})
