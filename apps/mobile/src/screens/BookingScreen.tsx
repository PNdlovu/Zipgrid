/**
 * @file BookingScreen.tsx
 * @description Driver booking list — shows upcoming, active, and past bookings.
 * Pulls from GET /api/v1/bookings/driver. Tapping a booking navigates to its detail.
 *
 * @module apps/mobile/screens
 */

import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl,
} from 'react-native'
import { useRouter } from 'expo-router'
import { api } from '../lib/api'

type Booking = {
  id: string
  status: string
  scheduledStart: string
  scheduledEnd: string
  estimatedCostPence: number
  listingTitle: string | null
  listingCity: string | null
}

const STATUS_COLORS: Record<string, string> = {
  pending:               '#F59E0B',
  confirmed:             '#00C853',
  active:                '#00C853',
  completed:             '#6B7280',
  cancelled_by_driver:   '#EF4444',
  cancelled_by_host:     '#EF4444',
  cancelled_by_platform: '#EF4444',
  no_show:               '#6B7280',
}

const STATUS_LABELS: Record<string, string> = {
  pending:               'Awaiting confirmation',
  confirmed:             'Confirmed',
  active:                'Session active',
  completed:             'Completed',
  cancelled_by_driver:   'Cancelled by you',
  cancelled_by_host:     'Cancelled by host',
  cancelled_by_platform: 'Cancelled',
  no_show:               'No show',
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', {
    weekday: 'short', day: 'numeric', month: 'short',
  })
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
}

export default function BookingScreen() {
  const router = useRouter()
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const fetchBookings = useCallback(async () => {
    const res = await api.get<Booking[]>('/api/v1/bookings/driver?pageSize=50')
    if (res.success) setBookings(res.data ?? [])
  }, [])

  useEffect(() => {
    void fetchBookings().finally(() => setLoading(false))
  }, [fetchBookings])

  const handleRefresh = useCallback(async () => {
    setRefreshing(true)
    await fetchBookings()
    setRefreshing(false)
  }, [fetchBookings])

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    )
  }

  return (
    <FlatList
      data={bookings}
      keyExtractor={(b) => b.id}
      contentContainerStyle={bookings.length === 0 ? styles.emptyContainer : styles.list}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor="#00C853" />}
      ListEmptyComponent={(
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>⚡</Text>
          <Text style={styles.emptyTitle}>No bookings yet</Text>
          <Text style={styles.emptyDesc}>Find a charger on the map and book your first session.</Text>
        </View>
      )}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={styles.card}
          onPress={() => router.push(`/driver/bookings/${item.id}`)}
          accessibilityRole="button"
          accessibilityLabel={`${item.listingTitle ?? 'Booking'} — ${STATUS_LABELS[item.status] ?? item.status}`}
        >
          {/* Date column */}
          <View style={styles.dateBox}>
            <Text style={styles.dateMonth}>
              {new Date(item.scheduledStart).toLocaleDateString('en-GB', { month: 'short' }).toUpperCase()}
            </Text>
            <Text style={styles.dateDay}>
              {new Date(item.scheduledStart).getDate()}
            </Text>
          </View>

          {/* Content */}
          <View style={styles.cardContent}>
            <View style={styles.cardRow}>
              <Text style={styles.cardTitle} numberOfLines={1}>
                {item.listingTitle ?? 'Booking'}
              </Text>
              <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLORS[item.status] ?? '#6B7280') + '20' }]}>
                <Text style={[styles.statusText, { color: STATUS_COLORS[item.status] ?? '#6B7280' }]}>
                  {STATUS_LABELS[item.status] ?? item.status}
                </Text>
              </View>
            </View>
            <Text style={styles.cardSub}>
              {item.listingCity ? `${item.listingCity} · ` : ''}
              {fmtDate(item.scheduledStart)} · {fmtTime(item.scheduledStart)}–{fmtTime(item.scheduledEnd)}
            </Text>
          </View>

          {/* Cost */}
          <Text style={styles.cost}>£{(item.estimatedCostPence / 100).toFixed(2)}</Text>
        </TouchableOpacity>
      )}
    />
  )
}

const styles = StyleSheet.create({
  list:           { paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 40 },
  centred:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyState:     { alignItems: 'center', gap: 8 },
  emptyIcon:      { fontSize: 40 },
  emptyTitle:     { fontSize: 16, fontWeight: '600', color: '#111', marginTop: 8 },
  emptyDesc:      { fontSize: 14, color: '#888', textAlign: 'center', marginTop: 4 },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: 14,
  },
  dateBox: {
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    paddingVertical: 8,
  },
  dateMonth:   { fontSize: 10, fontWeight: '700', color: '#6B7280', letterSpacing: 0.5 },
  dateDay:     { fontSize: 22, fontWeight: '700', color: '#111', marginTop: 2 },
  cardContent: { flex: 1 },
  cardRow:     { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  cardTitle:   { fontSize: 14, fontWeight: '600', color: '#111', flex: 1 },
  cardSub:     { fontSize: 12, color: '#6B7280', marginTop: 3 },
  statusBadge: { borderRadius: 20, paddingHorizontal: 8, paddingVertical: 2 },
  statusText:  { fontSize: 11, fontWeight: '600' },
  cost:        { fontSize: 14, fontWeight: '700', color: '#111', fontVariant: ['tabular-nums'] },
})
