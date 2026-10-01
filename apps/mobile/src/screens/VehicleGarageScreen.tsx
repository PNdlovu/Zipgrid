/**
 * @file VehicleGarageScreen.tsx
 * @description Vehicle garage — list, add, and delete driver vehicles.
 * Each vehicle stores make/model/year/plug types for booking compatibility checks.
 *
 * @module apps/mobile/src/screens
 */

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  ActivityIndicator, Alert, Modal, TextInput, ScrollView,
  RefreshControl,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'

/* ── Types ──────────────────────────────────────────────────── */

type Vehicle = {
  id: string
  make: string
  model: string
  year: number
  color: string | null
  licensePlate: string | null
  plugTypes: string[]
  isPrimary: boolean
  isActive: boolean
}

const PLUG_OPTIONS = ['CCS1', 'CCS2', 'NACS', 'CHAdeMO', 'Type2', 'J1772', 'NEMA_14_50'] as const
type PlugType = typeof PLUG_OPTIONS[number]

/* ── API helpers ────────────────────────────────────────────── */

async function getToken(): Promise<string> {
  return (await SecureStore.getItemAsync('access_token')) ?? ''
}

const API = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function fetchVehicles(): Promise<Vehicle[]> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/vehicles`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json() as { success: boolean; data?: { vehicles: Vehicle[] } }
  return json.data?.vehicles ?? []
}

async function addVehicle(payload: {
  make: string; model: string; year: number; color?: string
  licensePlate?: string; plugTypes: string[]
}): Promise<void> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/vehicles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const err = await res.json() as { error?: { message?: string } }
    throw new Error(err.error?.message ?? 'Failed to add vehicle')
  }
}

async function deleteVehicle(id: string): Promise<void> {
  const token = await getToken()
  await fetch(`${API}/api/v1/vehicles/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  })
}

async function setPrimary(id: string): Promise<void> {
  const token = await getToken()
  await fetch(`${API}/api/v1/vehicles/${id}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ isPrimary: true }),
  })
}

/* ── Add Vehicle Modal ──────────────────────────────────────── */

function AddVehicleModal({
  visible, onClose, onAdded,
}: { visible: boolean; onClose: () => void; onAdded: () => void }) {
  const [make, setMake]               = useState('')
  const [model, setModel]             = useState('')
  const [year, setYear]               = useState(String(new Date().getFullYear()))
  const [color, setColor]             = useState('')
  const [plate, setPlate]             = useState('')
  const [plugs, setPlugs]             = useState<Set<PlugType>>(new Set())
  const [saving, setSaving]           = useState(false)

  const togglePlug = (p: PlugType) => {
    setPlugs((prev) => {
      const next = new Set(prev)
      next.has(p) ? next.delete(p) : next.add(p)
      return next
    })
  }

  const handleAdd = async () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert('Missing fields', 'Please enter make and model.')
      return
    }
    if (plugs.size === 0) {
      Alert.alert('Plug types required', 'Select at least one plug type for your vehicle.')
      return
    }
    setSaving(true)
    try {
      await addVehicle({
        make: make.trim(),
        model: model.trim(),
        year: parseInt(year, 10) || new Date().getFullYear(),
        color: color.trim() || undefined,
        licensePlate: plate.trim() || undefined,
        plugTypes: Array.from(plugs),
      })
      onAdded()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Failed to add vehicle')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>Add vehicle</Text>
          <TouchableOpacity onPress={onClose} accessibilityRole="button" accessibilityLabel="Close">
            <Text style={modal.closeText}>Cancel</Text>
          </TouchableOpacity>
        </View>
        <ScrollView style={modal.scroll} keyboardShouldPersistTaps="handled">
          {([
            ['Make', make, setMake, 'words', 'default', 'e.g. Tesla'],
            ['Model', model, setModel, 'words', 'default', 'e.g. Model 3'],
            ['Year', year, setYear, 'none', 'numeric', 'e.g. 2023'],
            ['Colour (optional)', color, setColor, 'sentences', 'default', 'e.g. Midnight Blue'],
            ['Number plate (optional)', plate, setPlate, 'characters', 'default', 'e.g. EV21 ZGR'],
          ] as const).map(([label, val, setter, caps, kbd, ph]) => (
            <View key={label} style={modal.field}>
              <Text style={modal.label}>{label}</Text>
              <TextInput
                style={modal.input}
                value={val}
                onChangeText={setter as (v: string) => void}
                autoCapitalize={caps}
                keyboardType={kbd}
                placeholder={ph}
                placeholderTextColor="#9CA3AF"
              />
            </View>
          ))}

          <Text style={[modal.label, { marginTop: 16 }]}>Plug types *</Text>
          <View style={modal.plugRow}>
            {PLUG_OPTIONS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[modal.plugBtn, plugs.has(p) && modal.plugBtnActive]}
                onPress={() => togglePlug(p)}
                accessibilityRole="button"
                accessibilityState={{ selected: plugs.has(p) }}
              >
                <Text style={[modal.plugBtnText, plugs.has(p) && modal.plugBtnTextActive]}>{p}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        <View style={modal.footer}>
          <TouchableOpacity
            style={[modal.addBtn, saving && modal.addBtnDisabled]}
            onPress={handleAdd}
            disabled={saving}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={modal.addBtnText}>Add vehicle</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ── Main screen ────────────────────────────────────────────── */

export default function VehicleGarageScreen() {
  const [vehicles, setVehicles]   = useState<Vehicle[]>([])
  const [loading, setLoading]     = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showAdd, setShowAdd]     = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const data = await fetchVehicles()
      setVehicles(data)
    } catch {
      Alert.alert('Error', 'Could not load vehicles.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  const handleDelete = (v: Vehicle) => {
    Alert.alert(
      'Remove vehicle',
      `Remove ${v.year} ${v.make} ${v.model}?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove', style: 'destructive',
          onPress: async () => {
            await deleteVehicle(v.id)
            await load(true)
          },
        },
      ],
    )
  }

  const handleSetPrimary = async (id: string) => {
    await setPrimary(id)
    await load(true)
  }

  if (loading) {
    return (
      <View style={styles.centre}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.title}>My vehicles</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => setShowAdd(true)}
          accessibilityRole="button"
          accessibilityLabel="Add vehicle"
        >
          <Text style={styles.addBtnText}>+ Add</Text>
        </TouchableOpacity>
      </View>

      <FlatList
        data={vehicles}
        keyExtractor={(v) => v.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} tintColor="#00C853" />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>🚗</Text>
            <Text style={styles.emptyTitle}>No vehicles yet</Text>
            <Text style={styles.emptyBody}>Add your EV to start booking chargers.</Text>
          </View>
        }
        renderItem={({ item: v }) => (
          <View style={styles.card}>
            <View style={styles.cardLeft}>
              <Text style={styles.vehicleTitle}>{v.year} {v.make} {v.model}</Text>
              {v.color ? <Text style={styles.vehicleSub}>{v.color}</Text> : null}
              {v.licensePlate ? <Text style={styles.vehicleSub}>{v.licensePlate}</Text> : null}
              <View style={styles.plugRow}>
                {v.plugTypes.map((p) => (
                  <View key={p} style={styles.plugChip}>
                    <Text style={styles.plugChipText}>{p}</Text>
                  </View>
                ))}
              </View>
            </View>
            <View style={styles.cardRight}>
              {v.isPrimary ? (
                <View style={styles.primaryBadge}>
                  <Text style={styles.primaryBadgeText}>Primary</Text>
                </View>
              ) : (
                <TouchableOpacity onPress={() => void handleSetPrimary(v.id)} style={styles.setBtn} accessibilityRole="button">
                  <Text style={styles.setBtnText}>Set primary</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleDelete(v)} style={styles.deleteBtn} accessibilityRole="button" accessibilityLabel="Remove vehicle">
                <Text style={styles.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      />

      <AddVehicleModal
        visible={showAdd}
        onClose={() => setShowAdd(false)}
        onAdded={() => { setShowAdd(false); void load(true) }}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F9FAFB' },
  centre:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  topBar:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:            { fontSize: 22, fontWeight: '800', color: '#111' },
  addBtn:           { backgroundColor: '#00C853', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  addBtnText:       { color: '#fff', fontWeight: '700', fontSize: 14 },
  list:             { padding: 16, gap: 12 },
  card:             { backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 2 },
  cardLeft:         { flex: 1, gap: 4 },
  cardRight:        { alignItems: 'flex-end', gap: 8 },
  vehicleTitle:     { fontSize: 16, fontWeight: '700', color: '#111' },
  vehicleSub:       { fontSize: 13, color: '#6B7280' },
  plugRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  plugChip:         { backgroundColor: '#F0FDF4', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#BBF7D0' },
  plugChipText:     { fontSize: 11, fontWeight: '600', color: '#15803D' },
  primaryBadge:     { backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  primaryBadgeText: { fontSize: 12, fontWeight: '700', color: '#00C853' },
  setBtn:           { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#D1D5DB' },
  setBtnText:       { fontSize: 12, color: '#6B7280' },
  deleteBtn:        { padding: 4 },
  deleteBtnText:    { fontSize: 18 },
  empty:            { alignItems: 'center', marginTop: 80 },
  emptyIcon:        { fontSize: 56, marginBottom: 12 },
  emptyTitle:       { fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 6 },
  emptyBody:        { fontSize: 15, color: '#6B7280', textAlign: 'center' },
})

const modal = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fff' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:            { fontSize: 18, fontWeight: '800', color: '#111' },
  closeText:        { fontSize: 16, color: '#00C853', fontWeight: '600' },
  scroll:           { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  field:            { marginBottom: 16 },
  label:            { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input:            { height: 48, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 14, fontSize: 16, color: '#111', backgroundColor: '#F9FAFB' },
  plugRow:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  plugBtn:          { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#D1D5DB', backgroundColor: '#fff' },
  plugBtnActive:    { borderColor: '#00C853', backgroundColor: '#F0FDF4' },
  plugBtnText:      { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  plugBtnTextActive:{ color: '#00C853' },
  footer:           { padding: 20, borderTopWidth: 1, borderTopColor: '#E5E7EB' },
  addBtn:           { height: 52, backgroundColor: '#00C853', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  addBtnDisabled:   { opacity: 0.6 },
  addBtnText:       { color: '#fff', fontSize: 16, fontWeight: '700' },
})
