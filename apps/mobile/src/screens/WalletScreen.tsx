/**
 * @file WalletScreen.tsx
 * @description Driver wallet — balance, top-up via Stripe, transaction history,
 * auto top-up toggle & configuration.
 *
 * @module apps/mobile/src/screens
 */

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal, TextInput,
  Switch,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'

/* ── Types ──────────────────────────────────────────────────── */

type WalletBalance = {
  balancePence: number
  pendingPence: number
  autoTopupEnabled: boolean
  autoTopupThresholdPence: number
  autoTopupAmountPence: number
}

type WalletTransaction = {
  id: string
  type: string
  amountPence: number
  balanceAfterPence: number
  description: string
  createdAt: string
}

/* ── API ─────────────────────────────────────────────────────── */

const API = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function getToken() {
  return (await SecureStore.getItemAsync('access_token')) ?? ''
}

async function fetchWallet(): Promise<WalletBalance> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/wallet`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json() as { data?: { wallet: WalletBalance } }
  if (!json.data?.wallet) throw new Error('Could not load wallet')
  return json.data.wallet
}

async function fetchTransactions(page = 1): Promise<WalletTransaction[]> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/wallet/transactions?page=${page}&limit=20`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const json = await res.json() as { data?: { transactions: WalletTransaction[] } }
  return json.data?.transactions ?? []
}

async function topUp(amountPence: number): Promise<{ clientSecret: string }> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/wallet/topup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ amountPence }),
  })
  const json = await res.json() as { success: boolean; data?: { clientSecret: string }; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Top-up failed')
  return { clientSecret: json.data!.clientSecret }
}

async function saveAutoTopup(settings: {
  enabled: boolean
  thresholdPence: number
  amountPence: number
}): Promise<void> {
  const token = await getToken()
  await fetch(`${API}/api/v1/wallet/autotopup`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(settings),
  })
}

/* ── Helpers ─────────────────────────────────────────────────── */

function fmtPence(p: number): string {
  const sign = p < 0 ? '-' : ''
  return `${sign}£${(Math.abs(p) / 100).toFixed(2)}`
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

const TX_LABELS: Record<string, string> = {
  topup:             'Wallet top-up',
  session_payment:   'Charging session',
  refund:            'Refund',
  reward_redemption: 'Rewards redemption',
  promotional:       'Promotional credit',
  adjustment:        'Adjustment',
  withdrawal:        'Withdrawal',
}

const TX_ICONS: Record<string, string> = {
  topup: '➕', session_payment: '⚡', refund: '↩️',
  reward_redemption: '🏆', promotional: '🎁', adjustment: '⚙️', withdrawal: '↗️',
}

/* ── Top-up Modal ─────────────────────────────────────────────── */

const TOP_UP_PRESETS = [500, 1000, 2000, 5000]  // pence

function TopUpModal({ visible, onClose, onSuccess }: {
  visible: boolean; onClose: () => void; onSuccess: () => void
}) {
  const [amount, setAmount]   = useState('')
  const [loading, setLoading] = useState(false)

  const handleTopUp = async (amountPence: number) => {
    setLoading(true)
    try {
      // In production, clientSecret feeds into Stripe React Native SDK
      await topUp(amountPence)
      Alert.alert('Top-up initiated', `£${(amountPence / 100).toFixed(2)} will be added to your wallet.`)
      onSuccess()
    } catch (err) {
      Alert.alert('Top-up failed', err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  const customAmount = Math.round(parseFloat(amount || '0') * 100)

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>Top up wallet</Text>
          <TouchableOpacity onPress={onClose}><Text style={modal.close}>Cancel</Text></TouchableOpacity>
        </View>
        <ScrollView style={modal.scroll}>
          <Text style={modal.sectionLabel}>Quick amounts</Text>
          <View style={modal.presets}>
            {TOP_UP_PRESETS.map((p) => (
              <TouchableOpacity
                key={p}
                style={[modal.presetBtn, loading && modal.presetBtnDisabled]}
                onPress={() => void handleTopUp(p)}
                disabled={loading}
                accessibilityRole="button"
              >
                {loading ? <ActivityIndicator color="#fff" size="small" /> : <Text style={modal.presetText}>£{p / 100}</Text>}
              </TouchableOpacity>
            ))}
          </View>

          <Text style={[modal.sectionLabel, { marginTop: 24 }]}>Custom amount</Text>
          <View style={modal.customRow}>
            <Text style={modal.poundSign}>£</Text>
            <TextInput
              style={modal.customInput}
              value={amount}
              onChangeText={setAmount}
              keyboardType="decimal-pad"
              placeholder="0.00"
              placeholderTextColor="#9CA3AF"
            />
          </View>
          <TouchableOpacity
            style={[modal.addBtn, (loading || customAmount < 100) && modal.addBtnDisabled]}
            disabled={loading || customAmount < 100}
            onPress={() => void handleTopUp(customAmount)}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={modal.addBtnText}>Add £{(customAmount / 100).toFixed(2)}</Text>
            }
          </TouchableOpacity>
        </ScrollView>
      </View>
    </Modal>
  )
}

/* ── Auto Top-up Modal ────────────────────────────────────────── */

function AutoTopupModal({ visible, wallet, onClose, onSaved }: {
  visible: boolean; wallet: WalletBalance; onClose: () => void; onSaved: () => void
}) {
  const [enabled, setEnabled]     = useState(wallet.autoTopupEnabled)
  const [threshold, setThreshold] = useState(String(wallet.autoTopupThresholdPence / 100))
  const [amount, setAmount]       = useState(String(wallet.autoTopupAmountPence / 100))
  const [saving, setSaving]       = useState(false)

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveAutoTopup({
        enabled,
        thresholdPence: Math.round(parseFloat(threshold || '0') * 100),
        amountPence:    Math.round(parseFloat(amount || '0') * 100),
      })
      onSaved()
    } catch {
      Alert.alert('Error', 'Could not save settings')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>Auto top-up</Text>
          <TouchableOpacity onPress={onClose}><Text style={modal.close}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={modal.scroll}>
          <View style={modal.autoRow}>
            <View>
              <Text style={modal.autoLabel}>Enable auto top-up</Text>
              <Text style={modal.autoSub}>Automatically top up when balance is low</Text>
            </View>
            <Switch
              value={enabled}
              onValueChange={setEnabled}
              trackColor={{ true: '#00C853' }}
            />
          </View>
          {enabled && (
            <>
              <Text style={[modal.sectionLabel, { marginTop: 20 }]}>Top up when balance falls below</Text>
              <View style={modal.customRow}>
                <Text style={modal.poundSign}>£</Text>
                <TextInput
                  style={modal.customInput}
                  value={threshold}
                  onChangeText={setThreshold}
                  keyboardType="decimal-pad"
                  placeholder="5.00"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
              <Text style={[modal.sectionLabel, { marginTop: 16 }]}>Top-up amount</Text>
              <View style={modal.customRow}>
                <Text style={modal.poundSign}>£</Text>
                <TextInput
                  style={modal.customInput}
                  value={amount}
                  onChangeText={setAmount}
                  keyboardType="decimal-pad"
                  placeholder="20.00"
                  placeholderTextColor="#9CA3AF"
                />
              </View>
            </>
          )}
          <TouchableOpacity
            style={[modal.addBtn, saving && modal.addBtnDisabled]}
            disabled={saving}
            onPress={() => void handleSave()}
            accessibilityRole="button"
          >
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={modal.addBtnText}>Save settings</Text>}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ── Main screen ─────────────────────────────────────────────── */

export default function WalletScreen() {
  const [wallet, setWallet]             = useState<WalletBalance | null>(null)
  const [txns, setTxns]                 = useState<WalletTransaction[]>([])
  const [loading, setLoading]           = useState(true)
  const [refreshing, setRefreshing]     = useState(false)
  const [showTopUp, setShowTopUp]       = useState(false)
  const [showAuto, setShowAuto]         = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const [w, t] = await Promise.all([fetchWallet(), fetchTransactions()])
      setWallet(w)
      setTxns(t)
    } catch {
      Alert.alert('Error', 'Could not load wallet')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) {
    return <View style={s.centre}><ActivityIndicator size="large" color="#00C853" /></View>
  }

  if (!wallet) return null

  return (
    <View style={s.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} tintColor="#00C853" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Balance card */}
        <View style={s.balanceCard}>
          <Text style={s.balanceLabel}>Available balance</Text>
          <Text style={s.balanceAmount}>{fmtPence(wallet.balancePence)}</Text>
          {wallet.pendingPence > 0 && (
            <Text style={s.pendingText}>{fmtPence(wallet.pendingPence)} pending</Text>
          )}
          <View style={s.cardActions}>
            <TouchableOpacity style={s.topUpBtn} onPress={() => setShowTopUp(true)} accessibilityRole="button">
              <Text style={s.topUpBtnText}>➕  Top up</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.autoBtn, wallet.autoTopupEnabled && s.autoBtnActive]}
              onPress={() => setShowAuto(true)}
              accessibilityRole="button"
            >
              <Text style={[s.autoBtnText, wallet.autoTopupEnabled && s.autoBtnTextActive]}>
                {wallet.autoTopupEnabled ? '⚡ Auto: On' : '⚡ Auto: Off'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Transactions */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent transactions</Text>
          {txns.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>💳</Text>
              <Text style={s.emptyText}>No transactions yet</Text>
            </View>
          ) : (
            txns.map((tx) => (
              <View key={tx.id} style={s.txRow}>
                <Text style={s.txIcon}>{TX_ICONS[tx.type] ?? '•'}</Text>
                <View style={s.txMid}>
                  <Text style={s.txLabel}>{TX_LABELS[tx.type] ?? tx.type}</Text>
                  <Text style={s.txDesc}>{tx.description || fmtDate(tx.createdAt)}</Text>
                </View>
                <View style={s.txRight}>
                  <Text style={[s.txAmount, { color: tx.amountPence >= 0 ? '#00C853' : '#EF4444' }]}>
                    {tx.amountPence >= 0 ? '+' : ''}{fmtPence(tx.amountPence)}
                  </Text>
                  <Text style={s.txBalance}>{fmtPence(tx.balanceAfterPence)}</Text>
                </View>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      <TopUpModal visible={showTopUp} onClose={() => setShowTopUp(false)} onSuccess={() => { setShowTopUp(false); void load(true) }} />
      {wallet && (
        <AutoTopupModal
          visible={showAuto}
          wallet={wallet}
          onClose={() => setShowAuto(false)}
          onSaved={() => { setShowAuto(false); void load(true) }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#F9FAFB' },
  centre:           { flex: 1, justifyContent: 'center', alignItems: 'center' },
  balanceCard:      { margin: 16, backgroundColor: '#00C853', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 4 },
  balanceLabel:     { fontSize: 14, color: 'rgba(255,255,255,0.75)', fontWeight: '600', marginBottom: 4 },
  balanceAmount:    { fontSize: 42, fontWeight: '900', color: '#fff', letterSpacing: -1 },
  pendingText:      { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 4 },
  cardActions:      { flexDirection: 'row', gap: 12, marginTop: 20 },
  topUpBtn:         { flex: 1, backgroundColor: '#fff', borderRadius: 8, height: 44, justifyContent: 'center', alignItems: 'center' },
  topUpBtnText:     { fontSize: 14, fontWeight: '700', color: '#00C853' },
  autoBtn:          { flex: 1, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 8, height: 44, justifyContent: 'center', alignItems: 'center', borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.4)' },
  autoBtnActive:    { backgroundColor: '#fff' },
  autoBtnText:      { fontSize: 13, fontWeight: '600', color: 'rgba(255,255,255,0.9)' },
  autoBtnTextActive:{ color: '#00C853' },
  section:          { margin: 16 },
  sectionTitle:     { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  txRow:            { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  txIcon:           { fontSize: 22, width: 32, textAlign: 'center' },
  txMid:            { flex: 1 },
  txLabel:          { fontSize: 14, fontWeight: '600', color: '#111' },
  txDesc:           { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
  txRight:          { alignItems: 'flex-end' },
  txAmount:         { fontSize: 15, fontWeight: '700' },
  txBalance:        { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  empty:            { alignItems: 'center', paddingVertical: 40 },
  emptyIcon:        { fontSize: 40, marginBottom: 8 },
  emptyText:        { fontSize: 15, color: '#9CA3AF' },
})

const modal = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fff' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:            { fontSize: 18, fontWeight: '800', color: '#111' },
  close:            { fontSize: 16, color: '#00C853', fontWeight: '600' },
  scroll:           { flex: 1, padding: 20 },
  sectionLabel:     { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 10 },
  presets:          { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  presetBtn:        { flex: 1, minWidth: 72, backgroundColor: '#00C853', borderRadius: 8, height: 48, justifyContent: 'center', alignItems: 'center' },
  presetBtnDisabled:{ opacity: 0.6 },
  presetText:       { fontSize: 16, fontWeight: '700', color: '#fff' },
  customRow:        { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, overflow: 'hidden', backgroundColor: '#F9FAFB' },
  poundSign:        { paddingHorizontal: 14, fontSize: 18, color: '#374151', fontWeight: '600' },
  customInput:      { flex: 1, height: 48, fontSize: 20, color: '#111', paddingRight: 14 },
  addBtn:           { marginTop: 20, height: 52, backgroundColor: '#00C853', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  addBtnDisabled:   { opacity: 0.5 },
  addBtnText:       { fontSize: 16, fontWeight: '700', color: '#fff' },
  autoRow:          { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F9FAFB', borderRadius: 10, padding: 16 },
  autoLabel:        { fontSize: 15, fontWeight: '600', color: '#111' },
  autoSub:          { fontSize: 12, color: '#9CA3AF', marginTop: 2 },
})
