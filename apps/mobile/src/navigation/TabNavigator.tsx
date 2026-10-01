/**
 * @file TabNavigator.tsx
 * @description Bottom tab navigator for the Zipgrid mobile app.
 * Tabs: Map | Bookings | Session | Profile
 *
 * @module apps/mobile/navigation
 */

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text } from 'react-native'
import MapScreen from '../screens/MapScreen'
import BookingScreen from '../screens/BookingScreen'

const Tab = createBottomTabNavigator()

/** Root tab navigator — rendered by the Expo Router root layout. */
export function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: true,
        tabBarActiveTintColor: '#00C853',
        tabBarInactiveTintColor: '#9CA3AF',
        tabBarStyle: {
          borderTopColor: '#E5E7EB',
          backgroundColor: '#fff',
        },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          title: 'Find a charger',
          tabBarLabel: 'Map',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚡</Text>,
        }}
      />
      <Tab.Screen
        name="Bookings"
        component={BookingScreen}
        options={{
          title: 'My bookings',
          tabBarLabel: 'Bookings',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📅</Text>,
        }}
      />
    </Tab.Navigator>
  )
}
