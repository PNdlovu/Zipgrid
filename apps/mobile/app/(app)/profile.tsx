/**
 * @file profile.tsx
 * @description Profile tab — account details, vehicles, settings, and logout.
 * @module apps/mobile/app/(app)
 */

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Alert, ActivityIndicator,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'
import { api } from '../../src/lib/api'

type UserProfile = {
  id: string
  fullName: string
  email: string
  roles: string[]
  kycStatus: string
  totalSessions?: number
  totalKwh?: number
}

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  isPrimary: boolean
  plugTypes: string[]
  batteryCapacityKwh: number | null
}

export default function ProfileScreen() {
  const router = useRouter()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [loading, setLoading] = useState(true)

  const fetchAll = useCallback(async () => {
    const [profileRes, vehiclesRes] = await Promise.all([
      api.get<UserProfile>('/api/v1/auth/me'),
      api.get<Vehicle[]>('/api/v1/vehicles'),
    ])
    if (profileRes.success) setProfile(profileRes.data)
    if (vehiclesRes.success) setVehicles(vehiclesRes.data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { void fetchAll() }, [fetchAll])

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await Promise.all([
            SecureStore.deleteItemAsync('access_token'),
            SecureStore.deleteItemAsync('refresh_token'),
          ])
          // Call logout endpoint (best-effort)
          void fetch(`${process.env['EXPO_PUBLIC_API_URL'] ?? ''}/api/v1/auth/logout`, { method: 'POST' })
          router.replace('/(auth)/login')
        },
      },
    ])
  }

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    )
  }

  const isHost = profile?.roles.includes('host')
  const kycVerified = profile?.kycStatus === 'verified'

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>

      {/* Avatar + name */}
      <View style={styles.avatarSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarLetter}>
            {profile?.fullName?.charAt(0).toUpperCase() ?? '?'}
          </Text>
        </View>
        <Text style={styles.name}>{profile?.fullName ?? 'Driver'}</Text>
        <Text style={styles.email}>{profile?.email}</Text>
        <View style={styles.badgeRow}>
          {kycVerified && (
            <View style={[styles.badge, styles.badgeGreen]}>
              <Text style={styles.badgeText}>✓ Verified</Text>
            </View>
          )}
          {isHost && (
            <View style={[styles.badge, styles.badgeBlue]}>
              <Text style={styles.badgeText}>Host</Text>
            </View>
          )}
        </View>
      </View>

      {/* Stats */}
      {(profile?.totalSessions != null || profile?.totalKwh != null) && (
        <View style={styles.statsRow}>
          <View style={styles.statCell}>
            <Text style={styles.statValue}>{profile.totalSessions ?? 0}</Text>
            <Text style={styles.statLabel}>Sessions</Text>
          </View>
          <View style={[styles.statCell, styles.statDivider]}>
            <Text style={styles.statValue}>{(profile.totalKwh ?? 0).toFixed(0)}</Text>
            <Text style={styles.statLabel}>kWh charged</Text>
          </View>
        </View>
      )}

      {/* Vehicles */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>My vehicles</Text>
        {vehicles.length === 0 ? (
          <Text style={styles.emptyText}>No vehicles added yet.</Text>
        ) : (
          vehicles.map((v) => (
            <View key={v.id} style={styles.vehicleRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.vehicleName}>{v.year} {v.make} {v.model}</Text>
                <Text style={styles.vehicleSub}>
                  {v.plugTypes.join(', ')}
                  {v.batteryCapacityKwh ? ` · ${v.batteryCapacityKwh}kWh` : ''}
                </Text>
              </View>
              {v.isPrimary && (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>Default</Text>
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Quick links */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Account</Text>
        {[
          { label: 'Wallet & payments',      route: '/wallet' as const },
          { label: 'Rewards & badges',       route: '/rewards' as const },
          { label: 'Carbon impact',          route: '/carbon' as const },
          { label: 'Notifications',          route: '/settings' as const },
          { label: 'Help & support',         route: '/help' as const },
          { label: 'Privacy & data',         route: '/privacy' as const },
        ].map(({ label, route }) => (
          <TouchableOpacity
            key={label}
            style={styles.linkRow}
            onPress={() => router.push(route)}
            accessibilityRole="button"
          >
            <Text style={styles.linkText}>{label}</Text>
            <Text style={styles.chevron}>›</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Sign out */}
      <TouchableOpacity style={styles.signOutBtn} onPress={handleLogout} accessibilityRole="button">
        <Text style={styles.signOutText}>Sign out</Text>
      </TouchableOpacity>

      <Text style={styles.version}>Zipgrid v1.0.0</Text>
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container:      { flex: 1, backgroundColor: '#F9FAFB' },
  content:        { paddingBottom: 40 },
  centred:        { flex: 1, justifyContent: 'center', alignItems: 'center' },
  avatarSection:  { alignItems: 'center', paddingVertical: 28, backgroundColor: '#fff' },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: '#00C85320',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 10,
  },
  avatarLetter:   { fontSize: 32, fontWeight: '700', color: '#00C853' },
  name:           { fontSize: 20, fontWeight: '700', color: '#111' },
  email:          { fontSize: 14, color: '#6B7280', marginTop: 2 },
  badgeRow:       { flexDirection: 'row', gap: 8, marginTop: 8 },
  badge:          { borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  badgeGreen:     { backgroundColor: '#D1FAE5' },
  badgeBlue:      { backgroundColor: '#DBEAFE' },
  badgeText:      { fontSize: 12, fontWeight: '600', color: '#374151' },
  statsRow: {
    flexDirection: 'row', backgroundColor: '#fff',
    marginTop: 1, borderRadius: 0,
  },
  statCell:       { flex: 1, alignItems: 'center', paddingVertical: 16 },
  statDivider:    { borderLeftWidth: 1, borderLeftColor: '#E5E7EB' },
  statValue:      { fontSize: 22, fontWeight: '700', color: '#111', fontVariant: ['tabular-nums'] },
  statLabel:      { fontSize: 12, color: '#6B7280', marginTop: 2 },
  section:        { marginTop: 16, backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12 },
  sectionTitle:   { fontSize: 12, fontWeight: '600', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 8 },
  emptyText:      { fontSize: 14, color: '#9CA3AF' },
  vehicleRow: {
    flexDirection: 'row', alignItems: 'center',
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
    paddingVertical: 10,
  },
  vehicleName:    { fontSize: 14, fontWeight: '600', color: '#111' },
  vehicleSub:     { fontSize: 12, color: '#6B7280', marginTop: 2 },
  primaryBadge:   { backgroundColor: '#F0FDF4', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 3 },
  primaryBadgeText: { fontSize: 11, color: '#15803D', fontWeight: '600' },
  linkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  linkText:       { fontSize: 15, color: '#111' },
  chevron:        { fontSize: 20, color: '#9CA3AF' },
  signOutBtn: {
    marginTop: 24, marginHorizontal: 16, height: 52,
    borderWidth: 1.5, borderColor: '#EF4444', borderRadius: 8,
    justifyContent: 'center', alignItems: 'center',
  },
  signOutText:    { color: '#EF4444', fontSize: 16, fontWeight: '600' },
  version:        { textAlign: 'center', marginTop: 20, fontSize: 12, color: '#D1D5DB' },
})
