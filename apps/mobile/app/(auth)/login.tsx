/**
 * @file login.tsx
 * @description Login screen — email + password authentication.
 * On success stores the JWT in expo-secure-store and navigates to the app.
 *
 * @module apps/mobile/app/(auth)
 */

import { useState } from 'react'
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, Alert, ScrollView,
} from 'react-native'
import { useRouter } from 'expo-router'
import * as SecureStore from 'expo-secure-store'

export default function LoginScreen() {
  const router = useRouter()
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading]   = useState(false)

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      Alert.alert('Missing fields', 'Please enter your email and password.')
      return
    }

    setLoading(true)
    try {
      const apiUrl = process.env['EXPO_PUBLIC_API_URL'] ?? 'https://api.zipgrid.co.uk'
      const res = await fetch(`${apiUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })

      const json = await res.json() as {
        success: boolean
        data?: { accessToken: string; refreshToken: string }
        error?: { message: string }
      }

      if (!res.ok || !json.success || !json.data) {
        Alert.alert('Login failed', json.error?.message ?? 'Invalid email or password.')
        return
      }

      // Persist tokens
      await SecureStore.setItemAsync('access_token',  json.data.accessToken)
      await SecureStore.setItemAsync('refresh_token', json.data.refreshToken)

      // Navigate to authenticated app
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
      >
        {/* Logo / wordmark */}
        <View style={styles.header}>
          <Text style={styles.logo}>⚡</Text>
          <Text style={styles.wordmark}>Zipgrid</Text>
          <Text style={styles.tagline}>EV charging, simplified.</Text>
        </View>

        {/* Form */}
        <View style={styles.form}>
          <Text style={styles.label}>Email</Text>
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

          <Text style={[styles.label, { marginTop: 16 }]}>Password</Text>
          <TextInput
            style={styles.input}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
            placeholder="••••••••"
            placeholderTextColor="#9CA3AF"
            returnKeyType="done"
            onSubmitEditing={handleLogin}
            editable={!loading}
            accessibilityLabel="Password"
          />

          <TouchableOpacity
            style={[styles.forgotBtn]}
            onPress={() => router.push('/(auth)/forgot-password')}
            accessibilityRole="button"
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.primaryBtn, loading && styles.btnDisabled]}
            onPress={handleLogin}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in"
          >
            {loading
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.primaryBtnText}>Sign in</Text>
            }
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          <TouchableOpacity
            style={styles.secondaryBtn}
            onPress={() => router.push('/(auth)/register')}
            accessibilityRole="button"
          >
            <Text style={styles.secondaryBtnText}>Create an account</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

const styles = StyleSheet.create({
  outer:          { flex: 1, backgroundColor: '#fff' },
  container:      { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 28, paddingVertical: 48 },
  header:         { alignItems: 'center', marginBottom: 40 },
  logo:           { fontSize: 52, marginBottom: 4 },
  wordmark:       { fontSize: 32, fontWeight: '800', color: '#111', letterSpacing: -1 },
  tagline:        { fontSize: 15, color: '#6B7280', marginTop: 4 },
  form:           { gap: 0 },
  label:          { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6 },
  input: {
    height: 48,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 8,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111',
    backgroundColor: '#F9FAFB',
  },
  forgotBtn:      { alignSelf: 'flex-end', marginTop: 8, marginBottom: 24 },
  forgotText:     { fontSize: 13, color: '#00C853', fontWeight: '500' },
  primaryBtn: {
    height: 52,
    backgroundColor: '#00C853',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  btnDisabled:    { opacity: 0.6 },
  dividerRow:     { flexDirection: 'row', alignItems: 'center', marginVertical: 20, gap: 12 },
  dividerLine:    { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText:    { fontSize: 13, color: '#9CA3AF' },
  secondaryBtn: {
    height: 52,
    borderWidth: 1.5,
    borderColor: '#00C853',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryBtnText: { color: '#00C853', fontSize: 16, fontWeight: '600' },
})
