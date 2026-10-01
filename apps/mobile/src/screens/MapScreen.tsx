/**
 * @file MapScreen.tsx
 * @description Map-based charger discovery screen.
 * Uses expo-location + react-native-maps. Fetches nearby listings
 * and renders them as map markers. Tapping a marker navigates to the listing detail.
 *
 * @module apps/mobile/screens
 */

import { useEffect, useState, useCallback } from 'react'
import {
  View, Text, StyleSheet, ActivityIndicator,
  TouchableOpacity, Platform,
} from 'react-native'
import * as Location from 'expo-location'
import MapView, { Marker, Region } from 'react-native-maps'
import { useRouter } from 'expo-router'
import { api } from '../lib/api'

type Listing = {
  id: string
  title: string
  city: string
  latitude: number
  longitude: number
  maxPowerKw: number
  pricePerKwhPence: number | null
  averageRating: number | null
  instantBookEnabled: boolean
}

export default function MapScreen() {
  const router = useRouter()
  const [region, setRegion] = useState<Region | null>(null)
  const [listings, setListings] = useState<Listing[]>([])
  const [loading, setLoading] = useState(true)
  const [locationError, setLocationError] = useState<string | null>(null)

  const fetchListings = useCallback(async (lat: number, lng: number) => {
    const res = await api.get<{ listings: Listing[] }>(
      `/api/v1/listings/nearby?lat=${lat}&lng=${lng}&radius=10000&pageSize=50`,
    )
    if (res.success) setListings(res.data.listings ?? [])
  }, [])

  useEffect(() => {
    void (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        setLocationError('Location permission is required to find nearby chargers.')
        // Fallback to London centre
        const fallback = { latitude: 51.5074, longitude: -0.1278, latitudeDelta: 0.0922, longitudeDelta: 0.0421 }
        setRegion(fallback)
        await fetchListings(fallback.latitude, fallback.longitude)
        setLoading(false)
        return
      }

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      const { latitude, longitude } = loc.coords
      setRegion({ latitude, longitude, latitudeDelta: 0.0922, longitudeDelta: 0.0421 })
      await fetchListings(latitude, longitude)
      setLoading(false)
    })()
  }, [fetchListings])

  if (loading) {
    return (
      <View style={styles.centred}>
        <ActivityIndicator size="large" color="#00C853" />
        <Text style={styles.loadingText}>Finding chargers near you…</Text>
      </View>
    )
  }

  if (!region) return null

  return (
    <View style={styles.container}>
      {locationError && (
        <View style={styles.banner}>
          <Text style={styles.bannerText}>{locationError}</Text>
        </View>
      )}

      <MapView
        style={styles.map}
        region={region}
        onRegionChangeComplete={setRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {listings.map((listing) => (
          <Marker
            key={listing.id}
            coordinate={{ latitude: listing.latitude, longitude: listing.longitude }}
            title={listing.title}
            description={`${listing.maxPowerKw}kW${listing.pricePerKwhPence != null ? ` · ${listing.pricePerKwhPence}p/kWh` : ''}`}
            pinColor={listing.instantBookEnabled ? '#00C853' : '#1A73E8'}
            onCalloutPress={() => router.push(`/listings/${listing.id}`)}
          />
        ))}
      </MapView>

      {/* Bottom listing count badge */}
      <TouchableOpacity
        style={styles.countBadge}
        onPress={() => router.push('/listings')}
        accessibilityRole="button"
        accessibilityLabel={`${listings.length} chargers nearby — tap to view list`}
      >
        <Text style={styles.countText}>⚡ {listings.length} chargers nearby</Text>
      </TouchableOpacity>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map:       { flex: 1 },
  centred:   { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  loadingText: { fontSize: 14, color: '#888', marginTop: 8 },
  banner: {
    backgroundColor: '#FFF3CD',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  bannerText: { fontSize: 13, color: '#856404', textAlign: 'center' },
  countBadge: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 20,
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  countText: { color: '#fff', fontSize: 14, fontWeight: '600' },
})
