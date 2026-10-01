/**
 * @file emergency.tsx
 * @description Emergency SOS tab — wraps EmergencyChargingScreen.
 * @module apps/mobile/app/(app)
 */

import { useRouter } from 'expo-router'
import EmergencyChargingScreen from '../../src/screens/EmergencyChargingScreen'

export default function EmergencyTab() {
  const router = useRouter()
  return (
    <EmergencyChargingScreen
      onBookingCreated={(bookingId) => {
        // Navigate to bookings tab on successful SOS booking
        void router.push('/(app)/bookings')
      }}
    />
  )
}
