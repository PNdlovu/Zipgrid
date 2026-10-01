# Zipgrid — EV Charging Ecosystem Platform

> **"We don't sell charging. We sell convenience."**

Zipgrid is a UK-first AI-powered EV charging marketplace — peer-to-peer sessions, voice commands, agentic automation, fleet management, community hub, and a hardware installer marketplace in one platform.

**Status: ✅ All 4 phases built · 17 migrations · 10 seed files · Planning Baseline v2.3 — Voice-First Complete**

---

## Architecture at a Glance

```
apps/
├── web/          Next.js 15 App Router — main platform (Vercel)
├── ocpp-service/ Node.js WebSocket OCPP 1.6J/2.0.1 Central System (Railway)
├── ai-service/   Python FastAPI + LangChain AI/Voice service (Railway)
└── mobile/       React Native / Expo SDK 51 — driver mobile app

packages/
├── types/        Shared TypeScript types (@zipgrid/types)
├── api-client/   TanStack Query hooks for all API domains
├── utils/        Shared utilities (currency, dates, geo, validation)
└── ui-primitives/ Design tokens (colours, typography, spacing)

db/
├── migrations/   15 PostgreSQL migration files (001–015)
├── seeds/        Full demo dataset (001–010)
└── migrate.sql   Single-file migration runner
```

---

## Stack

| Layer | Technology |
|-------|------------|
| Web framework | Next.js 15 App Router + TypeScript strict |
| Database | PostgreSQL 14 + PostGIS (Railway eu-west Amsterdam) |
| ORM | Raw SQL via `postgres.js` — no ORM overhead |
| Auth | JWT (HS256, 15-min access / 30-day refresh) via `jose` |
| Payments | Stripe Connect + PaymentIntents (`capture_method: manual`) |
| OCPP | Custom Node.js WebSocket server (OCPP 1.6J + 2.0.1) |
| AI / Voice | LangChain + GPT-4o + OpenAI Whisper + Pinecone RAG |
| Maps | Mapbox GL JS + PostGIS spatial queries |
| Notifications | Push via FCM/APNs · Email via Resend |
| Mobile | React Native 0.74 + Expo SDK 51 + Expo Router |
| Cache | Upstash Redis (session presence, rate limiting, AI hot store) |
| CI/CD | GitHub Actions → Vercel (web) + Railway (OCPP + AI) |

---

## Quick Start

### Prerequisites

- Node.js ≥ 20
- Python ≥ 3.11 (`uv` or pip)
- PostgreSQL 14+ with PostGIS
- A `.env` file in each app (see `.env.example` files)

### 1 — Install dependencies

```bash
# From workspace root (installs all apps + packages)
npm install
```

### 2 — Set up the database

```bash
# Create database
psql -U postgres -c "CREATE DATABASE zipgrid_dev;"

# Run all migrations (001–015)
psql -U postgres -d zipgrid_dev -f db/migrate.sql

# Load demo data — full investor demo dataset
psql -U postgres -d zipgrid_dev -f db/seeds/001_seed.sql
psql -U postgres -d zipgrid_dev -f db/seeds/002_demo_extended.sql
psql -U postgres -d zipgrid_dev -f db/seeds/003_demo_personas.sql
psql -U postgres -d zipgrid_dev -f db/seeds/004_demo_listings.sql
psql -U postgres -d zipgrid_dev -f db/seeds/005_demo_bookings.sql
psql -U postgres -d zipgrid_dev -f db/seeds/006_demo_sessions.sql
psql -U postgres -d zipgrid_dev -f db/seeds/007_demo_reviews.sql
psql -U postgres -d zipgrid_dev -f db/seeds/008_demo_wallets_rewards.sql
psql -U postgres -d zipgrid_dev -f db/seeds/009_demo_agent_sessions.sql
psql -U postgres -d zipgrid_dev -f db/seeds/010_demo_community_fleet.sql
```

### 3 — Configure environment

Copy the `.env.example` files and fill in your values:

```bash
cp apps/web/.env.example          apps/web/.env.local
cp apps/ocpp-service/.env.example apps/ocpp-service/.env
cp apps/ai-service/.env.example   apps/ai-service/.env
```

Minimum required for local dev:
```bash
# apps/web/.env.local
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/zipgrid_dev
JWT_SECRET=your-dev-jwt-secret-minimum-32-characters-long
JWT_REFRESH_SECRET=your-dev-refresh-secret-minimum-32-characters-long
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_MAPBOX_TOKEN=pk.your_token_here
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
OCPP_SERVICE_URL=http://localhost:3001
OCPP_SERVICE_SECRET=dev-ocpp-shared-secret-min-32-chars
AI_SERVICE_URL=http://localhost:8000
AI_SERVICE_SECRET=dev-ai-shared-secret-min-32-chars
OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
UPSTASH_REDIS_URL=https://...
UPSTASH_REDIS_TOKEN=...
```

### 4 — Start development servers

Each service runs independently in its own terminal:

```bash
# Terminal 1 — Web app (Next.js)
cd apps/web && npm run dev          # → http://localhost:3000

# Terminal 2 — OCPP service
cd apps/ocpp-service && npm run dev # → ws://localhost:3001/ocpp/:cpId

# Terminal 3 — AI service
cd apps/ai-service
pip install -e ".[dev]"
uvicorn main:app --reload --port 8000  # → http://localhost:8000

# Terminal 4 — Mobile (Expo Go app or simulator)
cd apps/mobile && npm start
```

---

## Database Schema — 17 Migrations

| Migration | Tables | Status |
|-----------|--------|--------|
| `001_extensions.sql` | postgis, pgcrypto, citext | ✅ |
| `002_core_users.sql` | users, driver_profiles, vehicles, host_profiles | ✅ |
| `003_charger_listings.sql` | charger_listings (PostGIS), availability, photos | ✅ |
| `004_bookings_sessions_payments.sql` | bookings, sessions, transactions, payouts | ✅ |
| `005_reviews_notifications_insurance.sql` | reviews, notifications, incidents, disputes, audit_log | ✅ |
| `006_auth_otp_sessions.sql` | auth OTP + session tokens | ✅ |
| `006_wallet_rewards_safety.sql` | wallet, rewards, safety schema bootstrap | ✅ |
| `007_charger_devices_ocpp_log.sql` | charger_devices, ocpp_event_log, meter_values | ✅ |
| `008_booking_flow_payments.sql` | booking flow states, payment capture hooks | ✅ |
| `009_ai_sessions_agent_tasks.sql` | ai_sessions, agent_tasks, voice_commands | ✅ |
| `010_marketplace.sql` | installer_profiles, products, job_requests | ✅ |
| `011_wallet_rewards_emergency_safety_webhooks.sql` | wallet_balances, wallet_transactions, reward_points, reward_balances, reward_badges, emergency_sessions, safety_scores, webhooks | ✅ |
| `012_payout_gdpr_support_charger_connectors.sql` | payouts, gdpr_requests, support_tickets, charger_connectors | ✅ |
| `013_fleet_accounts.sql` | fleet_accounts, fleet_members, fleet_booking_summary view | ✅ |
| `014_user_preferences_referrals_saved.sql` | user_preferences, saved_listings, user_referrals | ✅ |
| `015_community_parking_esg_phase3.sql` | community_posts/replies/votes/reports, parking_listings/bookings, session_carbon_records, esg_totals, api_tenants, grid_schedules, driver_subscriptions, ocpi_roaming_sessions, blog_post_threads | ✅ |
| `016_wearable_commute_agent.sql` | wearable_devices, wearable_notifications, commute_patterns, commute_schedules, vertical_site_profiles | ✅ |
| `017_accessibility_listing_health.sql` | charger_listings accessibility columns, listing_health_scores, listing_availability_predictions, listing_pois | ✅ |

## Demo Seed Dataset — 10 Files

| Seed | Contents | Status |
|------|----------|--------|
| `001_seed.sql` | Base data, enums, extensions bootstrap | ✅ |
| `002_demo_extended.sql` | Extended fixture data | ✅ |
| `003_demo_personas.sql` | 5 personas: Sarah, Dev, Marcus, Andy, Claire | ✅ |
| `004_demo_listings.sql` | 12 charger listings (London, Manchester, Edinburgh, Bristol) | ✅ |
| `005_demo_bookings.sql` | 4 bookings across all statuses + transaction | ✅ |
| `006_demo_sessions.sql` | Completed session + live active session with meter data | ✅ |
| `007_demo_reviews.sql` | Blind-reveal reviews (both sides published) | ✅ |
| `008_demo_wallets_rewards.sql` | Wallet balances/txns, reward ledger, badges, Driver Plus sub, ESG totals | ✅ |
| `009_demo_agent_sessions.sql` | 4 AI conversations, 5 agent tasks, 7 voice commands, 2 grid schedules | ✅ |
| `010_demo_community_fleet.sql` | 4 community posts + 7 replies, fleet account, parking listing, webhooks, API tenant | ✅ |

---

## Project Structure

### `apps/web/src/`

```
app/
├── (admin)/        Admin panel — users, listings, disputes, payouts, audit
├── (auth)/         Auth — login, register, verify-email, verify-phone, reset-password
├── (driver)/       Driver app — map, bookings, session, wallet, rewards, emergency,
│                   fleet, trip/plan, vehicles, profile, settings, leaderboard, notifications
├── (host)/         Host dashboard — listings, chargers, bookings, earnings,
│                   sessions, onboarding, settings, vendor
├── (marketing)/    Public site — homepage, for-*, pricing, safety, blog, listings
├── (marketplace)/  Marketplace — browse products and OZEV installers
├── (smb)/          SMB host portal — analytics, multi-charger dashboard,
│                   billing, export, pricing
├── api/v1/         REST API (34+ resource groups, ~120 routes)
│   ├── account/    └── admin/    └── agents/   └── auth/
│   ├── bookings/   └── carbon/   └── chargers/ └── cron/
│   ├── developer/  └── disputes/ └── emergency/└── fleet/
│   ├── gamification/ └── grid/   └── host/     └── interop/
│   ├── listings/   └── marketplace/ └── notifications/ └── payments/
│   ├── region/     └── reviews/  └── rewards/  └── roadside/
│   ├── sessions/   └── support/  └── trip/     └── vehicle/
│   ├── voice/      └── wallet/   └── webhooks/ └── white-label/
└── listings/       Public listing detail + booking funnel

components/
├── auth/           Auth forms, OTP input, KYC step
├── booking/        BookingCard, BookingStatusBadge
├── forms/          FormField, FieldGroup
├── host/           StatCard, EarningsChart, ChargerStatusBadge
├── listing/        ListingCard, ListingGrid
├── map/            MapboxEmbed, ChargerPin
├── marketing/      Navbar, Footer, FeatureCard, PricingTable
├── reviews/        LeaveReviewModal, StarRating
├── session/        SessionMonitor, MeterValueRow, SessionTimer
├── shared/         LoadingState, EmptyState, ErrorBoundary, Pagination
├── ui/             Button, Badge, Input, Select, Textarea, ThemeToggle
└── voice/          VoiceButton, TranscriptDisplay

domains/            DDD bounded contexts — business logic only
├── ai-voice/       VoiceService, IntentRouter
├── booking/        BookingService
├── charging/       ListingService, AvailabilityService, OcppService
├── compliance/     AuditLogger, GdprService
├── identity/       AuthService, KycService, UserService
├── marketplace/    InstallerService, ProductService
├── notifications/  NotificationService
├── payments/       StripeService, WalletService, PayoutService
├── region/         RegionService, TariffEngine, CurrencyService
├── rewards/        RewardsService, RewardEventHandlers
├── safety/         SafetyScoreService
├── sessions/       SessionService
├── trust/          ReviewService, IncidentService
└── webhooks/       WebhookDeliveryService
```

### `apps/ocpp-service/src/`

```
commands/     Outbound OCPP: RemoteStart, RemoteStop, Reset, ChangeAvailability
connection/   ConnectionManager — WebSocket registry + heartbeat tracking
events/       ChargerEventEmitter — publishes to platform API
handlers/
  actions/    Inbound: BootNotification, StartTransaction, StopTransaction,
              MeterValues, Heartbeat, StatusNotification, DiagnosticsStatusNotification
  db.ts       postgres.js client (direct writes for meter telemetry)
http/
  HttpApi.ts              Internal HTTP for command dispatch
  OcppCommandDispatcher   Sends OCPP Calls, resolves CallResults with timeout
lib/          Logger (pino)
```

### `apps/ai-service/`

```
main.py               FastAPI — /voice, /agent, /workflows, /health
core/
  agent.py            LangChain ZipgridAgent (Standard/Hybrid/Agentic modes)
  intent.py           Intent classification + entity extraction (GPT-4o)
  safety.py           SafetyGuard — PII redaction, policy enforcement
  transcribe.py       Whisper STT fallback endpoint
  wake_word.py        "Hey Zipgrid" wake word detection
  rag/
    knowledge_base.py Vector store queries (Pinecone eu-west)
  tools/              10 LangChain tools:
                        search_listings, create_booking, get_session,
                        stop_session, get_earnings, block_availability,
                        schedule_charging, tariff_scheduler,
                        energy_optimise, proactive_alerts
  workflows/
    fault_diagnosis.py  OCPP fault → GPT-4o diagnosis → host notification
```

### `apps/mobile/`

```
app/
├── (auth)/     Login, Register, Forgot Password
└── (app)/      Home, Bookings, Session, Wallet, Rewards,
                Vehicles, Profile, Emergency
src/
├── screens/    MapScreen, ListingDetailScreen, BookingScreen,
                SessionScreen, WalletScreen, RewardsScreen,
                VehicleGarageScreen, EmergencyChargingScreen
├── navigation/ TabNavigator
└── lib/        api.ts — typed fetch client
```

---

## Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| Raw SQL over ORM | Full PostGIS query control; no N+1 surprises; explicit migration files |
| Pence/cents everywhere | No floating-point money bugs; `INT` columns throughout |
| OCPP as a separate service | WebSocket connections are long-lived — incompatible with Vercel serverless |
| JWT in header + cookie | Bearer for API clients; `__zg_at` cookie for SSR pages |
| Blind review mechanic | Both sides reveal simultaneously or after 14 days — prevents retaliation |
| 3-mode AI | Standard (manual) / Hybrid (default, confirms before acting) / Agentic (fully automated) |
| Feature flags | All Phase 2+ features flagged off until accounts configured — safe zero-downtime rollout |
| Demo data | Fixed UUIDs throughout seeds — reliable deep-links for investor demos |
| No stubs rule | Zero — complete features only, or feature flag `OFF` |

---

## Running Tests

```bash
# TypeScript type check — web app
cd apps/web && npx tsc --noEmit

# OCPP service — Vitest
cd apps/ocpp-service && npm test

# AI service — pytest
cd apps/ai-service && pytest tests/ -v

# Lint all workspaces
npx turbo lint

# Full build (catches import errors)
npx turbo build
```

---

## Deployment

All services deploy automatically on merge to `main` via `.github/workflows/deploy.yml`:

| Service | Host | URL pattern |
|---------|------|-------------|
| `apps/web` | Vercel | `zipgrid.co.uk` |
| `apps/ocpp-service` | Railway eu-west | `ocpp.zipgrid.co.uk` |
| `apps/ai-service` | Railway eu-west | `ai.zipgrid.co.uk` |

Required GitHub Secrets — see `.github/workflows/deploy.yml` for the full list:
- `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID_WEB`
- `RAILWAY_TOKEN`
- All production env vars from each `.env.example`

---

## Demo Personas — Investor Walkthrough

| Persona | Role | Key Demo Flow |
|---------|------|---------------|
| **Marcus Wright** | Frequent driver · Platinum · Tesla Model 3 | Voice booking → live session → AI smart schedule → rewards dashboard |
| **Sarah Chen** | Homeowner host · SW London · Zappi | Host dashboard → earnings → AI pricing suggestion → review reveal |
| **Dev Patel** | SMB host · Nexus Coworking Manchester | Multi-charger dashboard → fault diagnosis → fleet bookings → payout |
| **Andy Okafor** | New driver · Nissan Leaf · Bristol | First booking → emergency mode → community question |
| **Claire Nkosi** | OZEV installer · Birmingham | Marketplace profile → job request → installer booking |

All personas are seeded with fixed UUIDs — use `db/seeds/003_demo_personas.sql` through `010_demo_community_fleet.sql`.

---

## Docs

Full planning documentation (56 documents, Planning Baseline v2.1) lives in `docs/`:

| Category | Documents |
|----------|-----------|
| `docs/01-business/` | Business model, revenue model (11 streams, Y3 £7.43M ARR), investor pitch, risk register |
| `docs/02-product/` | PRD v0.4 (Modules A–S), feature roadmap v0.3, UX guidelines, community module |
| `docs/03-technical/` | Architecture, API spec, OCPP integration, security, DDD blueprint, AI agent guide |
| `docs/04-operations/` | Trust & safety policy, support playbook, KPIs, AI support system |
| `docs/05-legal-compliance/` | Insurance, GDPR, ToS outline, anti-fraud, compliance certifications |
| `docs/06-go-to-market/` | GTM strategy, launch plan, partnerships (Octopus, OZEV installers) |
| `docs/07-global-expansion/` | UK→EU→Americas roadmap, Y5 £28M ARR |

Start with `docs/00-INDEX.md` for the full navigation guide.

---

## Contributing

1. Branch off `develop` — `git checkout -b feat/your-feature`
2. No stubs — every feature must be complete or behind a `NEXT_PUBLIC_FEATURE_*` flag
3. Run `npx tsc --noEmit` before opening a PR
4. All monetary values in pence/cents — never floats
5. All API routes use `apiResponse()` / `apiError()` from `@/lib/api/response`
6. All domain errors are subclasses of `AppError` from `@/lib/errors/AppError`
7. New migrations must be sequential (`016_`, `017_`, ...) and non-destructive

See `docs/03-technical/3.10-engineering-standards.md` for the full engineering standards.

---

*Zipgrid Engineering — September 2026 · Planning Baseline v2.1*
