/**
 * @file EmergencyChargingScreen.tsx
 * @description Emergency (SOS) charging — driver triggers with critically low
 * battery. Shows range-limited nearby chargers, broadcasts SOS to nearest
 * available hosts, and creates a booking on host acceptance.
 *
 * @module apps/mobile/src/screens
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, ScrollView, Modal, TextInput, Animated,
} from 'react-native'
import * as Location from 'expo-location'
import * as SecureStore from 'expo-secure-store'

/* ── Types ──────────────────────────────────────────────────── */

type EmergencySession = {
  id: string
  status: 'searching' | 'host_alerted' | 'accepted' | 'booking_created' | 'expired' | 'cancelled'
  batteryPct: number
  maxRangeMetres: number
  aleredCount: number
  acceptedListingId: string | null
  resultingBookingId: string | null
  expiresAt: string
}

type NearbyCharger = {
  listingId: string
  title: string
  city: string
  distanceMetres: number
  maxPowerKw: number
  plugTypes: string[]
  instantBookEnabled: boolean
}

/* ── API ─────────────────────────────────────────────────────── */

const API = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function getToken() {
  return (await SecureStore.getItemAsync('access_token')) ?? ''
}

async function triggerEmergency(payload: {
  batteryPct: number
  currentLat: number
  currentLng: number
  vehicleId?: string
}): Promise<EmergencySession> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/emergency`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json() as {
    success: boolean
    data?: { session: EmergencySession; nearbyChargers: NearbyCharger[] }
    error?: { message: string }
  }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Emergency request failed')
  return json.data!.session
}

async function pollSession(id: string): Promise<EmergencySession> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/emergency/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json() as { data?: { session: EmergencySession } }
  return json.data!.session
}

/* ── Helpers ─────────────────────────────────────────────────── */

function metersToMiles(m: number): string {
  return (m / 1609.34).toFixed(1)
}

function timeLeft(expiresAt: string): string {
  const secs = Math.max(0, Math.floor((new Date(expiresAt).getTime() - Date.now()) / 1000))
  const m = Math.floor(secs / 60)
  const s = secs % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

/* ── Battery selector ─────────────────────────────────────────── */

const BATTERY_PRESETS = [5, 10, 15, 20]

/* ── Pulsing SOS indicator ───────────────────────────────────── */

function PulseIndicator() {
  const scale = useRef(new Animated.Value(1)).current
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(scale, { toValue: 1.3, duration: 800, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 1.0, duration: 800, useNativeDriver: true }),
      ]),
    ).start()
    return () => scale.stopAnimation()
  }, [scale])
  return (
    <Animated.View style={[pulse.circle, { transform: [{ scale }] }]}>
      <Text style={pulse.icon}>🆘</Text>
    </Animated.View>
  )
}

const pulse = StyleSheet.create({
  circle: { width: 120, height: 120, borderRadius: 60, backgroundColor: '#FEF2F2', borderWidth: 4, borderColor: '#EF4444', justifyContent: 'center', alignItems: 'center' },
  icon:   { fontSize: 48 },
})

/* ── Main Screen ─────────────────────────────────────────────── */

type Step = 'idle' | 'confirm' | 'searching' | 'accepted' | 'expired'

export default function EmergencyChargingScreen({ onBookingCreated }: { onBookingCreated?: (id: string) => void }) {
  const [step, setStep]               = useState<Step>('idle')
  const [battery, setBattery]         = useState<number | null>(null)
  const [customBattery, setCustom]    = useState('')
  const [location, setLocation]       = useState<{ lat: number; lng: number } | null>(null)
  const [locLoading, setLocLoading]   = useState(false)
  const [session, setSession]         = useState<EmergencySession | null>(null)
  const [timeRemaining, setTimeLeft]  = useState('')
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // Get location
  const getLocation = useCallback(async () => {
    setLocLoading(true)
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        Alert.alert('Location required', 'Emergency charging needs your current location.')
        return
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setLocation({ lat: loc.coords.latitude, lng: loc.coords.longitude })
    } catch {
      Alert.alert('Location error', 'Could not get your location.')
    } finally {
      setLocLoading(false)
    }
  }, [])

  useEffect(() => { void getLocation() }, [getLocation])

  // Poll session status when searching
  useEffect(() => {
    if (step !== 'searching' || !session) return
    setTimeLeft(timeLeft(session.expiresAt))

    pollRef.current = setInterval(async () => {
      try {
        const updated = await pollSession(session.id)
        setSession(updated)
        setTimeLeft(timeLeft(updated.expiresAt))

        if (updated.status === 'accepted' || updated.status === 'booking_created') {
          clearInterval(pollRef.current!)
          setStep('accepted')
          if (updated.resultingBookingId && onBookingCreated) {
            onBookingCreated(updated.resultingBookingId)
          }
        } else if (updated.status === 'expired' || updated.status === 'cancelled') {
          clearInterval(pollRef.current!)
          setStep('expired')
        }
      } catch { /* silently fail */ }
    }, 5000)

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  }, [step, session, onBookingCreated])

  const handleTrigger = async () => {
    const bat = battery ?? parseInt(customBattery || '0', 10)
    if (!bat || bat < 1 || bat > 100) { Alert.alert('Battery required', 'Enter your current battery level.'); return }
    if (!location) { Alert.alert('Location needed', 'Getting your location...'); void getLocation(); return }

    try {
      const sess = await triggerEmergency({
        batteryPct: bat,
        currentLat: location.lat,
        currentLng: location.lng,
      })
      setSession(sess)
      setStep('searching')
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Could not trigger emergency')
    }
  }

  /* ── Idle / confirm step ─── */
  if (step === 'idle' || step === 'confirm') {
    return (
      <View style={s.container}>
        <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
          <View style={s.heroSection}>
            <Text style={s.heroIcon}>🔋</Text>
            <Text style={s.heroTitle}>Emergency Charging</Text>
            <Text style={s.heroSubtitle}>
              Running critically low? We'll find you the nearest available charger right now.
            </Text>
          </View>

          <View style={s.card}>
            <Text style={s.cardTitle}>Current battery level</Text>
            <View style={s.presets}>
              {BATTERY_PRESETS.map((b) => (
                <TouchableOpacity
                  key={b}
                  style={[s.presetBtn, battery === b && s.presetBtnActive]}
                  onPress={() => { setBattery(b); setCustom('') }}
                  accessibilityRole="button"
                >
                  <Text style={[s.presetText, battery === b && s.presetTextActive]}>{b}%</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.customRow}>
              <TextInput
                style={s.customInput}
                value={customBattery}
                onChangeText={(v) => { setCustom(v); setBattery(null) }}
                keyboardType="number-pad"
                placeholder="Or type %"
                placeholderTextColor="#9CA3AF"
                maxLength={3}
              />
              <Text style={s.pctSuffix}>%</Text>
            </View>
          </View>

          <View style={s.infoCard}>
            <Text style={s.infoTitle}>How it works</Text>
            <InfoRow icon="📍" text="We use your GPS to find chargers within your driveable range" />
            <InfoRow icon="📢" text="An SOS alert is sent to nearby available hosts" />
            <InfoRow icon="⚡" text="The first host to accept creates your booking instantly" />
            <InfoRow icon="💰" text="Platform fees are waived on all emergency sessions" />
          </View>

          {locLoading && (
            <View style={s.locRow}>
              <ActivityIndicator size="small" color="#EF4444" />
              <Text style={s.locText}>Getting your location...</Text>
            </View>
          )}
          {location && !locLoading && (
            <View style={s.locRow}>
              <Text style={s.locIcon}>📍</Text>
              <Text style={s.locText}>Location confirmed</Text>
            </View>
          )}
        </ScrollView>

        <View style={s.footer}>
          <TouchableOpacity
            style={[s.sosBtn, (!location || locLoading) && s.sosBtnDisabled]}
            onPress={() => void handleTrigger()}
            disabled={!location || locLoading}
            accessibilityRole="button"
            accessibilityLabel="Trigger emergency charging SOS"
          >
            <Text style={s.sosBtnText}>🆘  Trigger Emergency SOS</Text>
          </TouchableOpacity>
          <Text style={s.disclaimer}>Only use this feature when you genuinely need emergency assistance.</Text>
        </View>
      </View>
    )
  }

  /* ── Searching step ─── */
  if (step === 'searching' && session) {
    return (
      <View style={s.container}>
        <View style={s.searchingContainer}>
          <PulseIndicator />
          <Text style={s.searchingTitle}>Searching for a host...</Text>
          <Text style={s.searchingSubtitle}>
            SOS broadcast to {session.aleredCount ?? '...'} nearby hosts
          </Text>
          <View style={s.timerBox}>
            <Text style={s.timerLabel}>Expires in</Text>
            <Text style={s.timerValue}>{timeRemaining}</Text>
          </View>
          <Text style={s.searchingNote}>
            If no host responds, we'll show you the nearest public chargers.
          </Text>
        </View>
      </View>
    )
  }

  /* ── Accepted step ─── */
  if (step === 'accepted' && session) {
    return (
      <View style={s.container}>
        <View style={s.acceptedContainer}>
          <Text style={s.acceptedIcon}>✅</Text>
          <Text style={s.acceptedTitle}>Host found!</Text>
          <Text style={s.acceptedSubtitle}>
            A host has accepted your emergency request. Your booking has been created.
          </Text>
          {session.resultingBookingId && (
            <View style={s.bookingIdBox}>
              <Text style={s.bookingIdLabel}>Booking reference</Text>
              <Text style={s.bookingIdValue}>{session.resultingBookingId.slice(0, 8).toUpperCase()}</Text>
            </View>
          )}
          <TouchableOpacity style={s.doneBtn} onPress={() => setStep('idle')} accessibilityRole="button">
            <Text style={s.doneBtnText}>View booking</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  /* ── Expired step ─── */
  return (
    <View style={s.container}>
      <View style={s.acceptedContainer}>
        <Text style={s.acceptedIcon}>⏰</Text>
        <Text style={s.acceptedTitle}>No host responded</Text>
        <Text style={s.acceptedSubtitle}>
          No hosts were available near you. Please try again or check the map for public chargers.
        </Text>
        <TouchableOpacity style={s.doneBtn} onPress={() => setStep('idle')} accessibilityRole="button">
          <Text style={s.doneBtnText}>Try again</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

function InfoRow({ icon, text }: { icon: string; text: string }) {
  return (
    <View style={infoStyle.row}>
      <Text style={infoStyle.icon}>{icon}</Text>
      <Text style={infoStyle.text}>{text}</Text>
    </View>
  )
}

const infoStyle = StyleSheet.create({
  row:  { flexDirection: 'row', gap: 10, marginBottom: 10, alignItems: 'flex-start' },
  icon: { fontSize: 16, width: 24 },
  text: { flex: 1, fontSize: 13, color: '#374151', lineHeight: 20 },
})

const s = StyleSheet.create({
  container:           { flex: 1, backgroundColor: '#fff' },
  scroll:              { padding: 20, paddingBottom: 100 },
  heroSection:         { alignItems: 'center', marginBottom: 24 },
  heroIcon:            { fontSize: 48, marginBottom: 8 },
  heroTitle:           { fontSize: 24, fontWeight: '800', color: '#111' },
  heroSubtitle:        { fontSize: 14, color: '#6B7280', textAlign: 'center', marginTop: 6, lineHeight: 20 },
  card:                { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 16, borderWidth: 1, borderColor: '#E5E7EB' },
  cardTitle:           { fontSize: 15, fontWeight: '700', color: '#111', marginBottom: 12 },
  presets:             { flexDirection: 'row', gap: 10, marginBottom: 12 },
  presetBtn:           { flex: 1, height: 44, borderRadius: 8, borderWidth: 1.5, borderColor: '#D1D5DB', justifyContent: 'center', alignItems: 'center' },
  presetBtnActive:     { borderColor: '#EF4444', backgroundColor: '#FEF2F2' },
  presetText:          { fontSize: 16, fontWeight: '700', color: '#374151' },
  presetTextActive:    { color: '#EF4444' },
  customRow:           { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, overflow: 'hidden', backgroundColor: '#fff' },
  customInput:         { flex: 1, height: 44, fontSize: 18, color: '#111', paddingHorizontal: 14 },
  pctSuffix:           { paddingHorizontal: 12, fontSize: 18, color: '#374151', fontWeight: '600' },
  infoCard:            { backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#BBF7D0' },
  infoTitle:           { fontSize: 14, fontWeight: '700', color: '#15803D', marginBottom: 10 },
  locRow:              { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 12 },
  locIcon:             { fontSize: 16 },
  locText:             { fontSize: 13, color: '#6B7280' },
  footer:              { padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#fff' },
  sosBtn:              { height: 56, backgroundColor: '#EF4444', borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#EF4444', shadowOpacity: 0.4, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  sosBtnDisabled:      { opacity: 0.5 },
  sosBtnText:          { fontSize: 17, fontWeight: '800', color: '#fff' },
  disclaimer:          { fontSize: 11, color: '#9CA3AF', textAlign: 'center', marginTop: 10 },
  searchingContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  searchingTitle:      { fontSize: 22, fontWeight: '800', color: '#111', marginTop: 24, marginBottom: 8 },
  searchingSubtitle:   { fontSize: 15, color: '#6B7280', textAlign: 'center', marginBottom: 24 },
  timerBox:            { backgroundColor: '#FEF2F2', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12, alignItems: 'center', marginBottom: 20 },
  timerLabel:          { fontSize: 12, color: '#EF4444', fontWeight: '600' },
  timerValue:          { fontSize: 32, fontWeight: '900', color: '#EF4444', fontVariant: ['tabular-nums'] },
  searchingNote:       { fontSize: 13, color: '#9CA3AF', textAlign: 'center' },
  acceptedContainer:   { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  acceptedIcon:        { fontSize: 64, marginBottom: 16 },
  acceptedTitle:       { fontSize: 26, fontWeight: '800', color: '#111', marginBottom: 8 },
  acceptedSubtitle:    { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  bookingIdBox:        { backgroundColor: '#F0FDF4', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 24 },
  bookingIdLabel:      { fontSize: 12, color: '#6B7280', marginBottom: 4 },
  bookingIdValue:      { fontSize: 20, fontWeight: '800', color: '#00C853', letterSpacing: 2 },
  doneBtn:             { height: 52, backgroundColor: '#00C853', borderRadius: 10, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 40 },
  doneBtnText:         { fontSize: 16, fontWeight: '700', color: '#fff' },
})
