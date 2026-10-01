/**
 * @file forgot-password.tsx
 * @description Forgot password screen — sends a reset link via email.
 *
 * @module apps/mobile/app/(auth)
 */

import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'

export default function ForgotPasswordScreen() {
  const router  = useRouter()
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)

  const handleSubmit = async () => {
    if (!email.trim()) {
      Alert.alert('Missing email', 'Please enter your email address.')
      return
    }

    setLoading(true)
    try {
      const apiUrl = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'
      const res = await fetch(`${apiUrl}/api/v1/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      })

      // We always show "sent" even if email doesn't exist (prevents user enumeration)
      if (res.ok || res.status === 404) {
        setSent(true)
      } else {
        Alert.alert('Error', 'Something went wrong. Please try again.')
      }
    } catch {
      Alert.alert('Connection error', 'Could not connect to Zipgrid. Check your internet connection.')
    } finally {
      setLoading(false)
    }
  }

  if (sent) {
    return (
      <View style={styles.centreContainer}>
        <Text style={styles.checkIcon}>✅</Text>
        <Text style={styles.sentTitle}>Check your inbox</Text>
        <Text style={styles.sentBody}>
          If an account exists for {email}, we've sent a password reset link. Check your spam folder if it doesn't arrive within a few minutes.
        </Text>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.replace('/(auth)/login')}
          accessibilityRole="button"
        >
          <Text style={styles.primaryBtnText}>Back to sign in</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.header}>
          <Text style={styles.logo}>🔑</Text>
          <Text style={styles.title}>Reset your password</Text>
          <Text style={styles.subtitle}>
            Enter your email and we'll send you a link to reset your password.
          </Text>
        </View>

        <Text style={styles.label}>Email address</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          placeholder="you@example.com"
          placeholderTextColor="#9CA3AF"
          returnKeyType="send"
          onSubmitEditing={handleSubmit}
          editable={!loading}
          accessibilityLabel="Email address"
          autoFocus
        />

        <TouchableOpacity
          style={[styles.primaryBtn, loading && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={loading}
          accessibilityRole="button"
          accessibilityLabel="Send reset link"
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={styles.primaryBtnText}>Send reset link</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => router.back()}
          accessibilityRole="button"
        >
          <Text style={styles.backBtnText}>← Back to sign in</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer:            { flex: 1, backgroundColor: '#fff' },
  container:        { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },
  centreContainer:  { flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 28, backgroundColor: '#fff' },
  header:           { marginBottom: 32 },
  logo:             { fontSize: 44, marginBottom: 12 },
  title:            { fontSize: 26, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  subtitle:         { fontSize: 15, color: '#6B7280', marginTop: 8, lineHeight: 22 },
  label:            { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    height: 48, borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, paddingHorizontal: 14, fontSize: 16,
    color: '#111', backgroundColor: '#F9FAFB', marginBottom: 20,
  },
  primaryBtn:       { height: 52, backgroundColor: '#00C853', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText:   { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:      { opacity: 0.6 },
  backBtn:          { marginTop: 20, alignItems: 'center' },
  backBtnText:      { fontSize: 14, color: '#00C853', fontWeight: '500' },
  checkIcon:        { fontSize: 56, marginBottom: 20 },
  sentTitle:        { fontSize: 24, fontWeight: '800', color: '#111', marginBottom: 12, textAlign: 'center' },
  sentBody:         { fontSize: 15, color: '#6B7280', textAlign: 'center', lineHeight: 22, marginBottom: 32 },
})
