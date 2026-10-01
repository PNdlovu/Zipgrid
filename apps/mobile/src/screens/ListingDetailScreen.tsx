/**
 * @file ListingDetailScreen.tsx
 * @description Listing detail + booking flow.
 * Step 1: View listing details, pricing, amenities, photos.
 * Step 2: Pick date/time + vehicle → show estimated cost.
 * Step 3: Confirm booking → calls /api/v1/bookings.
 *
 * @module apps/mobile/src/screens
 */

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, Modal, Platform,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'
import DateTimePicker from '@react-native-community/datetimepicker'

/* ── Types ──────────────────────────────────────────────────── */

type ListingDetail = {
  id: string
  title: string
  description: string | null
  city: string
  address: string
  chargerLevel: string
  maxPowerKw: number
  plugTypes: string[]
  pricingModel: string
  pricePerKwhPence: number | null
  pricePerHourPence: number | null
  pricePerSessionPence: number | null
  idleFeePerMinPence: number
  instantBookEnabled: boolean
  minBookingHours: number
  maxBookingHours: number
  averageRating: number | null
  reviewCount: number
  amenityTags: string[]
  hostName: string
  isSuperhost: boolean
  safetyScore: number | null
  photoUrls: string[]
}

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  plugTypes: string[]
  isPrimary: boolean
}

type BookingEstimate = {
  estimatedCostPence: number
  durationMinutes: number
}

/* ── API ─────────────────────────────────────────────────────── */

const API = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function getToken() {
  return (await SecureStore.getItemAsync('access_token')) ?? ''
}

async function fetchListing(id: string): Promise<ListingDetail> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/listings/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json() as { success: boolean; data?: { listing: ListingDetail } }
  if (!json.data?.listing) throw new Error('Listing not found')
  return json.data.listing
}

async function fetchVehicles(): Promise<Vehicle[]> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json() as { data?: { vehicles: Vehicle[] } }
  return json.data?.vehicles ?? []
}

async function createBooking(payload: {
  listingId: string
  vehicleId: string
  scheduledStart: string
  scheduledEnd: string
}): Promise<{ bookingId: string }> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/bookings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  const json = await res.json() as { success: boolean; data?: { booking: { id: string } }; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Booking failed')
  return { bookingId: json.data!.booking.id }
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number) { return `£${(p / 100).toFixed(2)}` }

function formatDateTime(d: Date) {
  return d.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
}

function estimateCost(listing: ListingDetail, start: Date, end: Date): number {
  const hours = (end.getTime() - start.getTime()) / 3_600_000
  if (listing.pricingModel === 'per_hour' && listing.pricePerHourPence) {
    return Math.round(listing.pricePerHourPence * hours)
  }
  if (listing.pricingModel === 'per_kwh' && listing.pricePerKwhPence) {
    const estimatedKwh = hours * listing.maxPowerKw * 0.7  // 70% efficiency factor
    return Math.round(listing.pricePerKwhPence * estimatedKwh)
  }
  if (listing.pricingModel === 'per_session' && listing.pricePerSessionPence) {
    return listing.pricePerSessionPence
  }
  return 0
}

/* ── Screen ──────────────────────────────────────────────────── */

type Props = {
  listingId: string
  onBack: () => void
  onBookingCreated: (bookingId: string) => void
}

type Step = 'detail' | 'booking' | 'confirming'

export default function ListingDetailScreen({ listingId, onBack, onBookingCreated }: Props) {
  const [listing, setListing]         = useState<ListingDetail | null>(null)
  const [vehicles, setVehicles]       = useState<Vehicle[]>([])
  const [loading, setLoading]         = useState(true)
  const [step, setStep]               = useState<Step>('detail')

  // Booking form state
  const [startDate, setStartDate]     = useState(() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d })
  const [endDate, setEndDate]         = useState(() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 2); return d })
  const [selectedVehicle, setSelVeh]  = useState<string | null>(null)
  const [showStart, setShowStart]     = useState(false)
  const [showEnd, setShowEnd]         = useState(false)
  const [booking, setBooking]         = useState(false)

  const load = useCallback(async () => {
    try {
      const [l, v] = await Promise.all([fetchListing(listingId), fetchVehicles()])
      setListing(l)
      setVehicles(v)
      const primary = v.find((x) => x.isPrimary)
      if (primary) setSelVeh(primary.id)
    } catch {
      Alert.alert('Error', 'Could not load listing.')
      onBack()
    } finally {
      setLoading(false)
    }
  }, [listingId, onBack])

  useEffect(() => { void load() }, [load])

  const handleBook = async () => {
    if (!selectedVehicle) { Alert.alert('Select a vehicle', 'Please select which vehicle you are charging.'); return }
    setBooking(true)
    try {
      const { bookingId } = await createBooking({
        listingId,
        vehicleId: selectedVehicle,
        scheduledStart: startDate.toISOString(),
        scheduledEnd: endDate.toISOString(),
      })
      onBookingCreated(bookingId)
    } catch (err) {
      Alert.alert('Booking failed', err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setBooking(false)
    }
  }

  if (loading || !listing) {
    return <View style={styles.centre}><ActivityIndicator size="large" color="#00C853" /></View>
  }

  const estimatedCost = estimateCost(listing, startDate, endDate)

  /* Detail view */
  if (step === 'detail') {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity onPress={onBack} accessibilityRole="button" style={styles.backBtn}>
            <Text style={styles.backText}>← Back</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          {/* Photo placeholder */}
          <View style={styles.photoPlaceholder}>
            <Text style={styles.photoIcon}>📸</Text>
            <Text style={styles.photoText}>{listing.photoUrls.length} photos</Text>
          </View>

          <View style={styles.body}>
            {listing.isSuperhost && <Text style={styles.superhostBadge}>⭐ Superhost</Text>}
            <Text style={styles.listingTitle}>{listing.title}</Text>
            <Text style={styles.location}>📍 {listing.city}</Text>

            {listing.averageRating != null && (
              <Text style={styles.rating}>★ {listing.averageRating.toFixed(1)}  ({listing.reviewCount} reviews)</Text>
            )}

            {listing.safetyScore != null && (
              <View style={styles.safetyRow}>
                <Text style={styles.safetyLabel}>🛡 Safety Score</Text>
                <Text style={[styles.safetyScore, { color: listing.safetyScore >= 70 ? '#00C853' : listing.safetyScore >= 50 ? '#F59E0B' : '#EF4444' }]}>
                  {listing.safetyScore}/100
                </Text>
              </View>
            )}

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Charger details</Text>
            <View style={styles.specRow}>
              <SpecItem icon="⚡" label="Level" value={listing.chargerLevel.replace('_', ' ')} />
              <SpecItem icon="🔌" label="Max power" value={`${listing.maxPowerKw} kW`} />
            </View>
            <View style={styles.plugRow}>
              {listing.plugTypes.map((p) => (
                <View key={p} style={styles.plugChip}>
                  <Text style={styles.plugChipText}>{p}</Text>
                </View>
              ))}
            </View>

            <View style={styles.divider} />

            <Text style={styles.sectionTitle}>Pricing</Text>
            <PricingBlock listing={listing} />

            {listing.amenityTags.length > 0 && (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>Amenities</Text>
                <View style={styles.plugRow}>
                  {listing.amenityTags.map((t) => (
                    <View key={t} style={styles.amenityChip}>
                      <Text style={styles.amenityText}>{t.replaceAll('_', ' ')}</Text>
                    </View>
                  ))}
                </View>
              </>
            )}

            {listing.description ? (
              <>
                <View style={styles.divider} />
                <Text style={styles.sectionTitle}>About this charger</Text>
                <Text style={styles.description}>{listing.description}</Text>
              </>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <View>
            <Text style={styles.footerFrom}>from</Text>
            <Text style={styles.footerPrice}>
              {listing.pricePerKwhPence ? `${fmtPence(listing.pricePerKwhPence)}/kWh` : listing.pricePerHourPence ? `${fmtPence(listing.pricePerHourPence)}/hr` : fmtPence(listing.pricePerSessionPence ?? 0)}
            </Text>
          </View>
          <TouchableOpacity style={styles.bookBtn} onPress={() => setStep('booking')} accessibilityRole="button">
            <Text style={styles.bookBtnText}>{listing.instantBookEnabled ? 'Book now' : 'Request to book'}</Text>
          </TouchableOpacity>
        </View>
      </View>
    )
  }

  /* Booking step */
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => setStep('detail')} style={styles.backBtn} accessibilityRole="button">
          <Text style={styles.backText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Book charger</Text>
      </View>
      <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.body}>
          <Text style={styles.sectionTitle}>Start time</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowStart(true)} accessibilityRole="button">
            <Text style={styles.dateBtnText}>{formatDateTime(startDate)}</Text>
          </TouchableOpacity>
          {showStart && (
            <DateTimePicker
              value={startDate}
              mode="datetime"
              minimumDate={new Date()}
              onChange={(_, d) => { setShowStart(Platform.OS === 'android' ? false : showStart); if (d) setStartDate(d) }}
            />
          )}

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>End time</Text>
          <TouchableOpacity style={styles.dateBtn} onPress={() => setShowEnd(true)} accessibilityRole="button">
            <Text style={styles.dateBtnText}>{formatDateTime(endDate)}</Text>
          </TouchableOpacity>
          {showEnd && (
            <DateTimePicker
              value={endDate}
              mode="datetime"
              minimumDate={startDate}
              onChange={(_, d) => { setShowEnd(Platform.OS === 'android' ? false : showEnd); if (d) setEndDate(d) }}
            />
          )}

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Vehicle</Text>
          {vehicles.length === 0 ? (
            <Text style={styles.noVehicleText}>No vehicles added. Please add a vehicle in your profile.</Text>
          ) : (
            vehicles.map((v) => (
              <TouchableOpacity
                key={v.id}
                style={[styles.vehicleOption, selectedVehicle === v.id && styles.vehicleOptionActive]}
                onPress={() => setSelVeh(v.id)}
                accessibilityRole="radio"
                accessibilityState={{ checked: selectedVehicle === v.id }}
              >
                <Text style={[styles.vehicleOptionText, selectedVehicle === v.id && { color: '#00C853' }]}>
                  {v.year} {v.make} {v.model}
                </Text>
                <Text style={styles.vehiclePlugs}>{v.plugTypes.join(', ')}</Text>
              </TouchableOpacity>
            ))
          )}

          <View style={[styles.divider, { marginTop: 20 }]} />

          <View style={styles.costRow}>
            <Text style={styles.costLabel}>Estimated cost</Text>
            <Text style={styles.costValue}>{fmtPence(estimatedCost)}</Text>
          </View>
          <Text style={styles.costNote}>Final charge is based on actual energy used. Your card is held and only charged when your session ends.</Text>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity
          style={[styles.bookBtn, { flex: 1 }, booking && styles.bookBtnDisabled]}
          onPress={handleBook}
          disabled={booking}
          accessibilityRole="button"
        >
          {booking
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.bookBtnText}>Confirm booking · {fmtPence(estimatedCost)}</Text>
          }
        </TouchableOpacity>
      </View>
    </View>
  )
}

function SpecItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={styles.specItem}>
      <Text style={styles.specIcon}>{icon}</Text>
      <View>
        <Text style={styles.specLabel}>{label}</Text>
        <Text style={styles.specValue}>{value}</Text>
      </View>
    </View>
  )
}

function PricingBlock({ listing }: { listing: ListingDetail }) {
  const items = []
  if (listing.pricePerKwhPence) items.push(`${fmtPence(listing.pricePerKwhPence)} per kWh`)
  if (listing.pricePerHourPence) items.push(`${fmtPence(listing.pricePerHourPence)} per hour`)
  if (listing.pricePerSessionPence) items.push(`${fmtPence(listing.pricePerSessionPence)} flat fee`)
  if (listing.idleFeePerMinPence > 0) items.push(`${fmtPence(listing.idleFeePerMinPence)}/min idle fee after disconnect`)
  return (
    <View style={styles.pricingList}>
      {items.map((item) => (
        <Text key={item} style={styles.pricingItem}>• {item}</Text>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#fff' },
  centre:             { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header:             { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  backBtn:            { paddingRight: 16 },
  backText:           { fontSize: 15, color: '#00C853', fontWeight: '600' },
  headerTitle:        { fontSize: 17, fontWeight: '700', color: '#111' },
  scroll:             { flex: 1 },
  photoPlaceholder:   { height: 200, backgroundColor: '#F3F4F6', justifyContent: 'center', alignItems: 'center' },
  photoIcon:          { fontSize: 40 },
  photoText:          { fontSize: 13, color: '#6B7280', marginTop: 4 },
  body:               { padding: 20 },
  superhostBadge:     { fontSize: 12, fontWeight: '700', color: '#D97706', marginBottom: 6 },
  listingTitle:       { fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 4 },
  location:           { fontSize: 14, color: '#6B7280', marginBottom: 4 },
  rating:             { fontSize: 14, color: '#111', marginBottom: 8 },
  safetyRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  safetyLabel:        { fontSize: 14, color: '#374151', fontWeight: '600' },
  safetyScore:        { fontSize: 16, fontWeight: '800' },
  divider:            { height: 1, backgroundColor: '#E5E7EB', marginVertical: 16 },
  sectionTitle:       { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  specRow:            { flexDirection: 'row', gap: 20, marginBottom: 12 },
  specItem:           { flexDirection: 'row', alignItems: 'center', gap: 8 },
  specIcon:           { fontSize: 20 },
  specLabel:          { fontSize: 11, color: '#9CA3AF' },
  specValue:          { fontSize: 14, fontWeight: '600', color: '#111' },
  plugRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  plugChip:           { backgroundColor: '#F0FDF4', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#BBF7D0' },
  plugChipText:       { fontSize: 12, fontWeight: '600', color: '#15803D' },
  amenityChip:        { backgroundColor: '#F9FAFB', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' },
  amenityText:        { fontSize: 12, color: '#374151', textTransform: 'capitalize' },
  pricingList:        { gap: 4 },
  pricingItem:        { fontSize: 14, color: '#374151', lineHeight: 22 },
  description:        { fontSize: 14, color: '#374151', lineHeight: 22 },
  footer:             { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderTopWidth: 1, borderTopColor: '#E5E7EB', backgroundColor: '#fff' },
  footerFrom:         { fontSize: 11, color: '#9CA3AF' },
  footerPrice:        { fontSize: 18, fontWeight: '800', color: '#111' },
  bookBtn:            { backgroundColor: '#00C853', paddingHorizontal: 24, paddingVertical: 14, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  bookBtnText:        { color: '#fff', fontSize: 15, fontWeight: '700' },
  bookBtnDisabled:    { opacity: 0.6 },
  dateBtn:            { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, justifyContent: 'center', paddingHorizontal: 14, backgroundColor: '#F9FAFB' },
  dateBtnText:        { fontSize: 15, color: '#111' },
  vehicleOption:      { padding: 14, borderWidth: 1.5, borderColor: '#D1D5DB', borderRadius: 8, marginBottom: 8 },
  vehicleOptionActive:{ borderColor: '#00C853', backgroundColor: '#F0FDF4' },
  vehicleOptionText:  { fontSize: 15, fontWeight: '600', color: '#111' },
  vehiclePlugs:       { fontSize: 12, color: '#6B7280', marginTop: 2 },
  noVehicleText:      { fontSize: 14, color: '#9CA3AF', textAlign: 'center', marginTop: 8 },
  costRow:            { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  costLabel:          { fontSize: 16, fontWeight: '600', color: '#374151' },
  costValue:          { fontSize: 20, fontWeight: '800', color: '#111' },
  costNote:           { fontSize: 12, color: '#9CA3AF', lineHeight: 18 },
})
