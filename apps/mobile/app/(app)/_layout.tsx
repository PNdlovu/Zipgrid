/**
 * @file _layout.tsx
 * @description Authenticated app layout — bottom tab navigator.
 * Tabs: Map | Bookings | Session | Wallet | Rewards | Emergency | Profile
 *
 * @module apps/mobile/app/(app)
 */

import { Tabs } from 'expo-router'
import { Text } from 'react-native'

const TAB_ICON: Record<string, string> = {
  index:     '⚡',   // Map / Find
  bookings:  '📅',   // Bookings
  session:   '🔌',   // Active Session
  wallet:    '💳',   // Wallet
  rewards:   '🏆',   // Rewards
  emergency: '🆘',   // Emergency
  vehicles:  '🚗',   // Vehicle Garage
  profile:   '👤',   // Profile
}

export default function AppLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#00C853',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopColor: '#E5E7EB',
          backgroundColor: '#fff',
          paddingBottom: 4,
        },
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Find a charger',
          tabBarLabel: 'Map',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['index']}</Text>,
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'My bookings',
          tabBarLabel: 'Bookings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['bookings']}</Text>,
        }}
      />
      <Tabs.Screen
        name="session"
        options={{
          title: 'Charging',
          tabBarLabel: 'Session',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['session']}</Text>,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: 'Wallet',
          tabBarLabel: 'Wallet',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['wallet']}</Text>,
        }}
      />
      <Tabs.Screen
        name="rewards"
        options={{
          title: 'Rewards',
          tabBarLabel: 'Rewards',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['rewards']}</Text>,
        }}
      />
      <Tabs.Screen
        name="emergency"
        options={{
          title: 'Emergency',
          tabBarLabel: 'SOS',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['emergency']}</Text>,
          tabBarActiveTintColor: '#EF4444',
        }}
      />
      <Tabs.Screen
        name="vehicles"
        options={{
          title: 'My vehicles',
          tabBarLabel: 'Vehicles',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['vehicles']}</Text>,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: 'Profile',
          tabBarLabel: 'Profile',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>{TAB_ICON['profile']}</Text>,
        }}
      />
    </Tabs>
  )
}
