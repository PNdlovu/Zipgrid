# Zipgrid Mobile — React Native / Expo

React Native app for EV drivers. Built with Expo SDK 51, Expo Router, and react-native-maps.

## Tech Stack

| Concern | Library |
|---------|---------|
| Framework | React Native 0.74 + Expo SDK 51 |
| Navigation | Expo Router 3 (file-based, mirrors Next.js) |
| Maps | react-native-maps (Apple Maps on iOS, Google Maps on Android) |
| Auth storage | expo-secure-store (JWT tokens) |
| Location | expo-location |
| Push notifications | expo-notifications |
| API client | Custom typed fetch wrapper (`src/lib/api.ts`) |

## Getting Started

```bash
# From workspace root
cd apps/mobile
npm install

# Start development server
npm start         # Expo Go (scan QR)
npm run ios       # iOS Simulator
npm run android   # Android Emulator
```

## Environment Variables

Create `.env` in this directory:

```
EXPO_PUBLIC_API_URL=http://localhost:3000   # or your Railway URL
```

## Project Structure

```
src/
├── lib/
│   └── api.ts           — typed API client (JWT from SecureStore)
├── navigation/
│   └── TabNavigator.tsx — bottom tab navigator (Map | Bookings)
└── screens/
    ├── MapScreen.tsx     — charger discovery map
    ├── BookingScreen.tsx — booking list + history
    └── SessionScreen.tsx — live charging session monitor
```

## Key Screens

**MapScreen** — fetches nearby listings via `/api/v1/listings/nearby`, renders as map markers. 
Marker colour: green = instant book, blue = manual approve. Tap callout → listing detail.

**BookingScreen** — paginated booking history. Pull-to-refresh. 
Status badges match web app colour coding.

**SessionScreen** — polls `/api/v1/sessions/[id]` every 5 seconds. 
Shows kWh, cost, power, SoC bar. Stop button → confirms then POSTs to `/api/v1/sessions/[id]/stop`.

## Build & Deploy

Production builds use [EAS Build](https://expo.dev/eas):

```bash
# iOS
npm run build:ios

# Android
npm run build:android
```

Update `eas.projectId` in `app.json` before building.
