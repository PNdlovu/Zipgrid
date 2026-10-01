/**
 * @file RewardsScreen.tsx
 * @description Loyalty rewards — points balance, tier progress, badges,
 * points history, and redeem points as wallet credit.
 *
 * @module apps/mobile/src/screens
 */

import { useState, useEffect, useCallback } from 'react'
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Alert, RefreshControl, Modal, TextInput,
} from 'react-native'
import * as SecureStore from 'expo-secure-store'

/* ── Types ──────────────────────────────────────────────────── */

type RewardBalance = {
  totalPoints: number
  lifetimePoints: number
  currentTier: 'standard' | 'silver' | 'gold' | 'platinum'
  tierQualifyingPts: number
  nextTier: string | null
  pointsToNextTier: number | null
  cashValuePence: number   // 100 points = £1
  multiplier: number
}

type RewardBadge = {
  id: number
  badgeType: string
  earnedAt: string
}

type PointEvent = {
  id: number
  action: string
  points: number
  description: string | null
  createdAt: string
}

/* ── API ─────────────────────────────────────────────────────── */

const API = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function getToken() {
  return (await SecureStore.getItemAsync('access_token')) ?? ''
}

async function fetchRewards(): Promise<{ balance: RewardBalance; badges: RewardBadge[]; recent: PointEvent[] }> {
  const token = await getToken()
  const [bRes, badgeRes] = await Promise.all([
    fetch(`${API}/api/v1/rewards`, { headers: { Authorization: `Bearer ${token}` } }),
    fetch(`${API}/api/v1/rewards/badges`, { headers: { Authorization: `Bearer ${token}` } }),
  ])
  const bJson = await bRes.json() as { data?: { balance: RewardBalance; recent: PointEvent[] } }
  const badgeJson = await badgeRes.json() as { data?: { badges: RewardBadge[] } }
  return {
    balance: bJson.data!.balance,
    badges: badgeJson.data?.badges ?? [],
    recent: bJson.data?.recent ?? [],
  }
}

async function redeemPoints(points: number): Promise<{ walletCreditPence: number }> {
  const token = await getToken()
  const res = await fetch(`${API}/api/v1/rewards/redeem`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
  })
  const json = await res.json() as { success: boolean; data?: { walletCreditPence: number }; error?: { message: string } }
  if (!res.ok || !json.success) throw new Error(json.error?.message ?? 'Redemption failed')
  return { walletCreditPence: json.data!.walletCreditPence }
}

/* ── Helpers ─────────────────────────────────────────────────── */

const TIER_COLORS: Record<string, string> = {
  standard: '#6B7280',
  silver:   '#9CA3AF',
  gold:     '#D97706',
  platinum: '#7C3AED',
}

const TIER_ICONS: Record<string, string> = {
  standard: '🌱', silver: '🥈', gold: '🥇', platinum: '💎',
}

const ACTION_LABELS: Record<string, string> = {
  session_completed:    '⚡ Charging session',
  host_session_earned:  '🏠 Session hosted',
  review_submitted:     '⭐ Review submitted',
  referral_friend:      '👥 Friend referred',
  welcome_bonus:        '🎉 Welcome bonus',
  birthday_bonus:       '🎂 Birthday bonus',
  off_peak_bonus:       '🌙 Off-peak bonus',
  streak_bonus:         '🔥 Streak bonus',
  admin_grant:          '🎁 Bonus awarded',
  redemption:           '💳 Points redeemed',
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

/* ── Redeem Modal ────────────────────────────────────────────── */

function RedeemModal({ visible, balance, onClose, onRedeemed }: {
  visible: boolean; balance: RewardBalance; onClose: () => void; onRedeemed: () => void
}) {
  const [pointsStr, setPointsStr] = useState('')
  const [loading, setLoading]     = useState(false)
  const points = parseInt(pointsStr || '0', 10)
  const creditPence = Math.round((points / 100) * 100)  // 100 pts = £1

  const handleRedeem = async () => {
    if (points < 100) { Alert.alert('Minimum redemption', 'You need at least 100 points to redeem.'); return }
    if (points > balance.totalPoints) { Alert.alert('Insufficient points', 'You don\'t have enough points.'); return }
    setLoading(true)
    try {
      const { walletCreditPence } = await redeemPoints(points)
      Alert.alert('Redeemed!', `${points} points converted to £${(walletCreditPence / 100).toFixed(2)} wallet credit.`)
      onRedeemed()
    } catch (err) {
      Alert.alert('Error', err instanceof Error ? err.message : 'Redemption failed')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <View style={modal.container}>
        <View style={modal.header}>
          <Text style={modal.title}>Redeem points</Text>
          <TouchableOpacity onPress={onClose}><Text style={modal.close}>Cancel</Text></TouchableOpacity>
        </View>
        <View style={modal.body}>
          <Text style={modal.availableLabel}>Available</Text>
          <Text style={modal.availablePoints}>{balance.totalPoints.toLocaleString()} pts</Text>
          <Text style={modal.rateNote}>100 points = £1.00 wallet credit</Text>

          <Text style={modal.fieldLabel}>Points to redeem</Text>
          <TextInput
            style={modal.input}
            value={pointsStr}
            onChangeText={setPointsStr}
            keyboardType="number-pad"
            placeholder="e.g. 500"
            placeholderTextColor="#9CA3AF"
          />
          {points >= 100 && (
            <Text style={modal.creditPreview}>You'll receive: £{(creditPence / 100).toFixed(2)}</Text>
          )}

          <TouchableOpacity
            style={[modal.redeemBtn, (loading || points < 100) && modal.redeemBtnDisabled]}
            onPress={handleRedeem}
            disabled={loading || points < 100}
            accessibilityRole="button"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={modal.redeemBtnText}>Redeem {points >= 100 ? `${points} pts` : 'points'}</Text>
            }
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}

/* ── Tier progress bar ────────────────────────────────────────── */

const TIER_THRESHOLDS: Record<string, number> = {
  standard: 0, silver: 500, gold: 1500, platinum: 5000,
}

function TierProgress({ balance }: { balance: RewardBalance }) {
  const tiers = ['standard', 'silver', 'gold', 'platinum']
  const idx = tiers.indexOf(balance.currentTier)
  const nextTier = tiers[idx + 1]
  if (!nextTier) return (
    <View style={prog.row}>
      <Text style={prog.maxLabel}>💎 You've reached the highest tier — Platinum!</Text>
    </View>
  )
  const start = TIER_THRESHOLDS[balance.currentTier] ?? 0
  const end   = TIER_THRESHOLDS[nextTier] ?? 5000
  const ratio = Math.min(1, (balance.tierQualifyingPts - start) / (end - start))
  return (
    <View>
      <View style={prog.labelRow}>
        <Text style={prog.tierLabel}>{TIER_ICONS[balance.currentTier]} {balance.currentTier.charAt(0).toUpperCase() + balance.currentTier.slice(1)}</Text>
        <Text style={prog.nextLabel}>{TIER_ICONS[nextTier]} {nextTier.charAt(0).toUpperCase() + nextTier.slice(1)}</Text>
      </View>
      <View style={prog.track}>
        <View style={[prog.fill, { width: `${ratio * 100}%`, backgroundColor: TIER_COLORS[balance.currentTier] }]} />
      </View>
      {balance.pointsToNextTier != null && (
        <Text style={prog.remaining}>{balance.pointsToNextTier.toLocaleString()} pts to {nextTier}</Text>
      )}
    </View>
  )
}

/* ── Main Screen ─────────────────────────────────────────────── */

export default function RewardsScreen() {
  const [data, setData]             = useState<{ balance: RewardBalance; badges: RewardBadge[]; recent: PointEvent[] } | null>(null)
  const [loading, setLoading]       = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [showRedeem, setShowRedeem] = useState(false)

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true)
    try {
      const d = await fetchRewards()
      setData(d)
    } catch {
      Alert.alert('Error', 'Could not load rewards')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  if (loading) return <View style={s.centre}><ActivityIndicator size="large" color="#00C853" /></View>
  if (!data) return null

  const { balance, badges, recent } = data
  const tierColor = TIER_COLORS[balance.currentTier] ?? '#6B7280'

  return (
    <View style={s.container}>
      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(true) }} tintColor="#00C853" />}
        showsVerticalScrollIndicator={false}
      >
        {/* Points card */}
        <View style={[s.pointsCard, { borderTopColor: tierColor }]}>
          <View style={s.tierBadge}>
            <Text style={[s.tierText, { color: tierColor }]}>
              {TIER_ICONS[balance.currentTier]} {balance.currentTier.toUpperCase()}
            </Text>
            {balance.multiplier > 1 && (
              <View style={s.multiplierBadge}>
                <Text style={s.multiplierText}>{balance.multiplier}× points</Text>
              </View>
            )}
          </View>
          <Text style={s.pointsLabel}>Your points</Text>
          <Text style={s.pointsValue}>{balance.totalPoints.toLocaleString()}</Text>
          <Text style={s.cashValue}>≈ £{(balance.cashValuePence / 100).toFixed(2)} value</Text>

          <View style={s.tierProgressWrap}>
            <TierProgress balance={balance} />
          </View>

          <TouchableOpacity
            style={[s.redeemBtn, balance.totalPoints < 100 && s.redeemBtnDisabled]}
            onPress={() => setShowRedeem(true)}
            disabled={balance.totalPoints < 100}
            accessibilityRole="button"
          >
            <Text style={s.redeemBtnText}>Redeem for wallet credit</Text>
          </TouchableOpacity>
        </View>

        {/* Badges */}
        {badges.length > 0 && (
          <View style={s.section}>
            <Text style={s.sectionTitle}>Badges earned</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.badgeRow}>
              {badges.map((b) => (
                <View key={b.id} style={s.badgeCard}>
                  <Text style={s.badgeIcon}>🏅</Text>
                  <Text style={s.badgeLabel}>{b.badgeType.replaceAll('_', ' ')}</Text>
                  <Text style={s.badgeDate}>{fmtDate(b.earnedAt)}</Text>
                </View>
              ))}
            </ScrollView>
          </View>
        )}

        {/* Recent activity */}
        <View style={s.section}>
          <Text style={s.sectionTitle}>Recent activity</Text>
          {recent.length === 0 ? (
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🏆</Text>
              <Text style={s.emptyText}>Earn points by charging</Text>
            </View>
          ) : (
            recent.map((ev) => (
              <View key={ev.id} style={s.eventRow}>
                <Text style={s.eventIcon}>{ACTION_LABELS[ev.action]?.split(' ')[0] ?? '•'}</Text>
                <View style={s.eventMid}>
                  <Text style={s.eventLabel}>{ACTION_LABELS[ev.action]?.slice(2) ?? ev.action}</Text>
                  {ev.description ? <Text style={s.eventDesc}>{ev.description}</Text> : null}
                  <Text style={s.eventDate}>{fmtDate(ev.createdAt)}</Text>
                </View>
                <Text style={[s.eventPoints, { color: ev.points >= 0 ? '#00C853' : '#EF4444' }]}>
                  {ev.points >= 0 ? '+' : ''}{ev.points} pts
                </Text>
              </View>
            ))
          )}
        </View>
      </ScrollView>

      {data && (
        <RedeemModal
          visible={showRedeem}
          balance={data.balance}
          onClose={() => setShowRedeem(false)}
          onRedeemed={() => { setShowRedeem(false); void load(true) }}
        />
      )}
    </View>
  )
}

const s = StyleSheet.create({
  container:          { flex: 1, backgroundColor: '#F9FAFB' },
  centre:             { flex: 1, justifyContent: 'center', alignItems: 'center' },
  pointsCard:         { margin: 16, backgroundColor: '#fff', borderRadius: 16, padding: 20, borderTopWidth: 4, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  tierBadge:          { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
  tierText:           { fontSize: 14, fontWeight: '800', letterSpacing: 1 },
  multiplierBadge:    { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 20 },
  multiplierText:     { fontSize: 12, fontWeight: '700', color: '#D97706' },
  pointsLabel:        { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  pointsValue:        { fontSize: 48, fontWeight: '900', color: '#111', letterSpacing: -2, lineHeight: 56 },
  cashValue:          { fontSize: 14, color: '#6B7280', marginBottom: 16 },
  tierProgressWrap:   { marginBottom: 20 },
  redeemBtn:          { backgroundColor: '#00C853', borderRadius: 8, height: 44, justifyContent: 'center', alignItems: 'center' },
  redeemBtnDisabled:  { opacity: 0.4 },
  redeemBtnText:      { fontSize: 14, fontWeight: '700', color: '#fff' },
  section:            { marginHorizontal: 16, marginBottom: 20 },
  sectionTitle:       { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 12 },
  badgeRow:           { paddingLeft: 2 },
  badgeCard:          { width: 90, backgroundColor: '#fff', borderRadius: 10, padding: 12, alignItems: 'center', marginRight: 10, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  badgeIcon:          { fontSize: 28, marginBottom: 6 },
  badgeLabel:         { fontSize: 10, fontWeight: '600', color: '#374151', textAlign: 'center', textTransform: 'capitalize' },
  badgeDate:          { fontSize: 10, color: '#9CA3AF', marginTop: 2 },
  eventRow:           { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  eventIcon:          { fontSize: 20, width: 28, textAlign: 'center' },
  eventMid:           { flex: 1 },
  eventLabel:         { fontSize: 14, fontWeight: '600', color: '#111' },
  eventDesc:          { fontSize: 12, color: '#6B7280', marginTop: 1 },
  eventDate:          { fontSize: 11, color: '#9CA3AF', marginTop: 2 },
  eventPoints:        { fontSize: 15, fontWeight: '700' },
  empty:              { alignItems: 'center', paddingVertical: 32 },
  emptyIcon:          { fontSize: 40, marginBottom: 8 },
  emptyText:          { fontSize: 14, color: '#9CA3AF' },
})

const prog = StyleSheet.create({
  row:        { paddingVertical: 8 },
  maxLabel:   { fontSize: 13, color: '#7C3AED', fontWeight: '600', textAlign: 'center' },
  labelRow:   { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  tierLabel:  { fontSize: 12, fontWeight: '600', color: '#374151' },
  nextLabel:  { fontSize: 12, fontWeight: '600', color: '#374151' },
  track:      { height: 8, backgroundColor: '#E5E7EB', borderRadius: 4, overflow: 'hidden' },
  fill:       { height: 8, borderRadius: 4 },
  remaining:  { fontSize: 11, color: '#9CA3AF', marginTop: 4, textAlign: 'center' },
})

const modal = StyleSheet.create({
  container:        { flex: 1, backgroundColor: '#fff' },
  header:           { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#E5E7EB' },
  title:            { fontSize: 18, fontWeight: '800', color: '#111' },
  close:            { fontSize: 16, color: '#00C853', fontWeight: '600' },
  body:             { padding: 20 },
  availableLabel:   { fontSize: 13, color: '#9CA3AF', fontWeight: '500' },
  availablePoints:  { fontSize: 36, fontWeight: '900', color: '#111', marginBottom: 4 },
  rateNote:         { fontSize: 13, color: '#6B7280', marginBottom: 24 },
  fieldLabel:       { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  input:            { height: 52, borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, paddingHorizontal: 16, fontSize: 22, color: '#111', backgroundColor: '#F9FAFB', marginBottom: 8 },
  creditPreview:    { fontSize: 15, fontWeight: '600', color: '#00C853', marginBottom: 20 },
  redeemBtn:        { height: 52, backgroundColor: '#00C853', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  redeemBtnDisabled:{ opacity: 0.5 },
  redeemBtnText:    { fontSize: 16, fontWeight: '700', color: '#fff' },
})
