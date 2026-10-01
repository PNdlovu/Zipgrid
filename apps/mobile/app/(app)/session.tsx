/**
 * @file session.tsx
 * @description Active session tab — shows the most recent active or finishing
 * charging session. Navigates to SessionScreen with the active session ID.
 *
 * @module apps/mobile/app/(app)
 */

import { useState, useEffect } from 'react'
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import SessionScreen from '../../src/screens/SessionScreen'

const API = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'

async function getActiveSessionId(): Promise<string | null> {
  const token = (await SecureStore.getItemAsync('access_token')) ?? ''
  try {
    const res = await fetch(`${API}/api/v1/sessions?status=charging&limit=1`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    const json = await res.json() as { data?: { sessions: Array<{ id: string }> } }
    return json.data?.sessions?.[0]?.id ?? null
  } catch {
    return null
  }
}

export default function SessionTab() {
  const [sessionId, setSessionId] = useState<string | null | undefined>(undefined)

  useEffect(() => {
    void getActiveSessionId().then(setSessionId)
  }, [])

  if (sessionId === undefined) {
    return (
      <View style={s.centre}>
        <ActivityIndicator size="large" color="#00C853" />
      </View>
    )
  }

  if (!sessionId) {
    return (
      <View style={s.centre}>
        <Text style={s.icon}>🔌</Text>
        <Text style={s.title}>No active session</Text>
        <Text style={s.body}>
          When you start charging, your live session will appear here.
        </Text>
      </View>
    )
  }

  return <SessionScreen sessionId={sessionId} />
}

const s = StyleSheet.create({
  centre: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff', padding: 32 },
  icon:   { fontSize: 56, marginBottom: 16 },
  title:  { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8 },
  body:   { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22 },
})
