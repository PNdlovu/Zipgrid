/**
 * @file register.tsx
 * @description Register screen — new user signup with email + password + full name.
 * On success stores the JWT and navigates to the authenticated app.
 *
 * @module apps/mobile/app/(auth)
 */

import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  ScrollView, Linking,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

/** Opens a legal page (served by the web app at the API origin) in the browser. */
function openLegal(slug: 'terms' | 'privacy' | 'host-terms' | 'driver-terms') {
  const base = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'
  void Linking.openURL(`${base}/legal/${slug}`)
}

export default function RegisterScreen() {
  const router = useRouter()

  const [fullName, setFullName] = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm]   = useState('')
  const [role, setRole]         = useState<'driver' | 'host'>('driver')
  const [loading, setLoading]   = useState(false)

  const handleRegister = async () => {
    if (!fullName.trim() || !email.trim() || !password || !confirm) {
      Alert.alert('Missing fields', 'Please fill in all fields.')
      return
    }
    if (password !== confirm) {
      Alert.alert('Passwords do not match', 'Please make sure both password fields match.')
      return
    }
    if (password.length < 8) {
      Alert.alert('Weak password', 'Password must be at least 8 characters.')
      return
    }

    setLoading(true)
    try {
      const apiUrl = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'
      const res = await fetch(`${apiUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          displayName: fullName.trim(),
          email: email.trim().toLowerCase(),
          password,
          role,
          acceptTerms: true, // accepted by tapping Create account (see the notice above the button)
        }),
      })

      const json = await res.json() as {
        success: boolean
        data?: { accessToken: string; refreshToken: string }
        error?: { message: string }
      }

      if (!res.ok || !json.success || !json.data) {
        Alert.alert('Registration failed', json.error?.message ?? 'Something went wrong.')
        return
      }

      await SecureStore.setItemAsync('access_token',  json.data.accessToken)
      if (json.data.refreshToken) await SecureStore.setItemAsync('refresh_token', json.data.refreshToken)

      router.replace('/(app)')
    } catch {
      Alert.alert('Connection error', 'Could not connect to Zipgrid. Check your internet connection.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.outer}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.logo}>⚡</Text>
          <Text style={styles.wordmark}>Zipgrid</Text>
          <Text style={styles.tagline}>Create your account</Text>
        </View>

        {/* Role toggle */}
        <View style={styles.roleRow}>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'driver' && styles.roleBtnActive]}
            onPress={() => setRole('driver')}
            accessibilityRole="button"
            accessibilityState={{ selected: role === 'driver' }}
          >
            <Text style={[styles.roleBtnText, role === 'driver' && styles.roleBtnTextActive]}>
              🚗  I'm a Driver
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.roleBtn, role === 'host' && styles.roleBtnActive]}
            onPress={() => setRole('host')}
            accessibilityRole="button"
            accessibilityState={{ selected: role === 'host' }}
          >
            <Text style={[styles.roleBtnText, role === 'host' && styles.roleBtnTextActive]}>
              🏠  I'm a Host
            </Text>
          </TouchableOpacity>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Full name</Text>
          <TextInput
            style={styles.input}
            value={fullName}
            onChangeText={setFullName}
            autoCapitalize="words"
            textContentType="name"
            autoComplete="name"
            placeholder="Jane Smith"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
            editable={!loading}
            accessibilityLabel="Full name"
          />

          <Text style={[styles.label, styles.mt16]}>Email</Text>
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
            returnKeyType="next"
            editable={!loading}
            accessibilityLabel="Email address"
          />

          <Text style={[styles.label, styles.mt16]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="newPassword"
            autoComplete="password-new"
            placeholder="Min. 8 characters"
            placeholderTextColor="#9CA3AF"
            returnKeyType="next"
            editable={!loading}
            accessibilityLabel="Password"
          />

          <Text style={[styles.label, styles.mt16]}>Confirm password</Text>
          <TextInput
            style={styles.input}
            value={confirm}
            onChangeText={setConfirm}
            secureTextEntry
            textContentType="newPassword"
            placeholder="Repeat password"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            onSubmitEditing={handleRegister}
            editable={!loading}
            accessibilityLabel="Confirm password"
          />

          <Text style={styles.terms}>
            By creating an account you agree to our{' '}
            <Text style={styles.termsLink} onPress={() => openLegal('terms')} accessibilityRole="link">Terms of Service</Text>
            ,{' '}
            <Text style={styles.termsLink} onPress={() => openLegal('privacy')} accessibilityRole="link">Privacy Policy</Text>
            {' '}and the{' '}
            {role === 'host'
              ? <Text style={styles.termsLink} onPress={() => openLegal('host-terms')} accessibilityRole="link">Host Terms</Text>
              : <Text style={styles.termsLink} onPress={() => openLegal('driver-terms')} accessibilityRole="link">Driver Responsibilities</Text>}.
          </Text>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleRegister}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Create account"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Create account</Text>
            }
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.back()}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Already have an account? Sign in</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer:              { flex: 1, backgroundColor: '#fff' },
  container:          { flexGrow: 1, paddingHorizontal: 28, paddingVertical: 40 },
  header:             { alignItems: 'center', marginBottom: 28 },
  logo:               { fontSize: 44, marginBottom: 4 },
  wordmark:           { fontSize: 28, fontWeight: '800', color: '#111', letterSpacing: -1 },
  tagline:            { fontSize: 15, color: '#6B7280', marginTop: 4 },
  roleRow:            { flexDirection: 'row', gap: 12, marginBottom: 24 },
  roleBtn:            { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#D1D5DB', alignItems: 'center' },
  roleBtnActive:      { borderColor: '#00C853', backgroundColor: '#F0FDF4' },
  roleBtnText:        { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  roleBtnTextActive:  { color: '#00C853' },
  form:               { gap: 0 },
  label:              { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  mt16:               { marginTop: 16 },
  input: {
    height: 48, borderWidth: 1, borderColor: '#D1D5DB',
    borderRadius: 8, paddingHorizontal: 14, fontSize: 16,
    color: '#111', backgroundColor: '#F9FAFB',
  },
  terms:              { fontSize: 12, color: '#9CA3AF', marginTop: 16, marginBottom: 24, textAlign: 'center', lineHeight: 18 },
  termsLink:          { color: '#00C853', fontWeight: '500' },
  primaryBtn:         { height: 52, backgroundColor: '#00C853', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  primaryBtnText:     { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:        { opacity: 0.6 },
  dividerRow:         { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine:        { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText:        { fontSize: 13, color: '#9CA3AF' },
  secondaryBtn:       { height: 52, borderWidth: 1.5, borderColor: '#00C853', borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  secondaryBtnText:   { color: '#00C853', fontSize: 15, fontWeight: '600' },
})
