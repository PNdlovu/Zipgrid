# Zipgrid — Database Schema Reference

PostgreSQL 14+ with PostGIS. All monetary values in **cents (INT)**. All geometry in **GEOGRAPHY(POINT, 4326)** (WGS84).

---

## Quick Start

```bash
# 1. Create the database
psql -U postgres -c "CREATE DATABASE zipgrid_dev;"

# 2. Run all migrations
psql -U postgres -d zipgrid_dev -f db/migrate.sql

# 3. Load seed data (dev / staging only)
psql -U postgres -d zipgrid_dev -f db/seeds/001_seed.sql
```

---

## Migration Files

| File | Contents |
|------|----------|
| `001_extensions.sql` | `postgis`, `pgcrypto`, `citext`, `uuid-ossp` |
| `002_core_users.sql` | `users`, `driver_profiles`, `driver_vehicles`, `host_profiles` |
| `003_charger_listings.sql` | `charger_listings`, `listing_availability_schedules`, `listing_blackout_dates`, `listing_photos` |
| `004_bookings_sessions_payments.sql` | `bookings`, `charging_sessions`, `session_meter_values`, `transactions`, `payouts`, `payout_line_items` |
| `005_reviews_notifications_insurance.sql` | `reviews`, `notifications`, `notification_preferences`, `incident_reports`, `insurance_claims`, `disputes`, `audit_log` |
| `006_auth_otp_sessions.sql` | `otp_codes`, `auth_sessions` — OTP verification + refresh token sessions |
| `007_charger_devices_ocpp_log.sql` | `charger_devices`, `ocpp_event_log` — OCPP device registry + telemetry log |
| `008_booking_flow_payments.sql` | `stripe_webhook_events` idempotency table + booking flow payment columns |
| `009_ai_sessions_agent_tasks.sql` | `ai_conversation_sessions`, `agent_tasks` — AI agent memory and task history |
| `010_marketplace.sql` | `marketplace_products`, `installer_profiles`, `installer_jobs`, `cart_items` |
| `011_wallet_rewards_emergency_safety_webhooks.sql` | `wallet_balances`, `wallet_transactions`, `reward_balances`, `reward_points`, `reward_badges`, `emergency_sessions`, `safety_scores`, `webhook_subscriptions`, `webhook_deliveries` — plus all related enums |
| `012_payout_gdpr_support_charger_connectors.sql` | `payout_batches`, `gdpr_deletion_requests`, `consent_records`, `support_conversations`, `support_messages`, `charger_connectors`, `notification_preferences` upsert — plus `ALTER TABLE` additions for `users`, `driver_profiles`, `host_profiles`, `charger_devices` |

---

## Table Map

### Identity Layer (`002`)
```
users
 ├── driver_profiles  (1:1)
 │    └── driver_vehicles  (1:N)
 └── host_profiles    (1:1)
```

### Marketplace Layer (`003`)
```
host_profiles
 └── charger_listings  (1:N)
      ├── listing_availability_schedules  (1:7 max, one per weekday)
      ├── listing_blackout_dates          (1:N)
      └── listing_photos                  (1:N)
```

### Transaction Layer (`004`)
```
bookings  (listing × driver × vehicle)
 └── charging_sessions  (1:1)
      └── session_meter_values  (1:N, time-series)
 └── transactions  (1:1)
      └── payout_line_items  (N:1 → payouts)

payouts  (host_profiles 1:N)
```

### Trust & Operations Layer (`005`)
```
reviews                    (booking 1:2 max — one per side)
notifications              (user 1:N)
notification_preferences   (user 1:N)
incident_reports           (booking/session 1:N)
 └── insurance_claims      (incident 1:N)
disputes                   (booking 1:N)
audit_log                  (append-only, no FK to keep it lean)
```

### Auth & Devices (`006`, `007`)
```
otp_codes          (user 1:N — email/phone verification)
auth_sessions      (user 1:N — refresh token sessions)
charger_devices    (host_profile 1:N — OCPP device registry)
 └── ocpp_event_log (charge_point 1:N — telemetry append-only log)
 └── charger_connectors (charge_point 1:N — per-connector status)
```

### Wallet & Rewards (`011`)
```
wallet_balances       (user 1:1 — denormalised current balance)
wallet_transactions   (user 1:N — append-only ledger)
reward_balances       (user 1:1)
reward_points         (user 1:N — earn/redeem ledger)
reward_badges         (user 1:N — unlocked badges)
safety_scores         (listing 1:N — calculated safety scores)
webhook_subscriptions (user 1:N — outbound webhook endpoints)
webhook_deliveries    (subscription 1:N — delivery log with retry)
```

### Payouts & Compliance (`012`)
```
payout_batches          (host_user 1:N — weekly Stripe Connect batches)
gdpr_deletion_requests  (user 1:1 — Art. 17 erasure queue)
consent_records         (user 1:N per purpose — Art. 7 consent log)
support_conversations   (user 1:N — AI support chat threads)
 └── support_messages   (conversation 1:N)
```

---

## Key Design Decisions

### PostGIS Geography Column
`charger_listings.location` uses `GEOGRAPHY(POINT, 4326)` — not `GEOMETRY`.  
- `ST_DWithin` on GEOGRAPHY accepts **meters** directly (no projection math).  
- A `GIST` index makes radius searches an index scan, not a seq scan.  
- The `sync_listing_location()` trigger keeps the geometry in sync with `latitude`/`longitude` on every insert/update.

### Money as Cents
All prices, fees, earnings, and refunds are `INT` (cents).  
`$7.92 → 792`. Never use `FLOAT` for money — floating-point drift causes audit failures.

### Booking Overlap Prevention
```sql
CREATE UNIQUE INDEX idx_bookings_no_overlap
    ON bookings (listing_id, scheduled_start, scheduled_end)
    WHERE status IN ('pending', 'confirmed');
```
Database-level guard against race conditions in concurrent booking requests.

### OCPP Telemetry
`session_meter_values` uses `BIGSERIAL` (not UUID) for maximum insert throughput on high-frequency meter readings (every 30–300 seconds per active charger).  
Energy stored in **Wh** (Watt-hours) — the native OCPP unit — then converted to kWh in the application layer.

### Blind Reviews
Both driver and host reviews default to `status = 'pending'` and are only flipped to `published` after both parties submit (or after a 14-day reveal window). Prevents retaliatory rating inflation.

### Audit Log
`audit_log` uses `BIGSERIAL` (not UUID) for strict sequential ordering.  
It is **append-only** — revoke `UPDATE` and `DELETE` at the role level in production:
```sql
REVOKE UPDATE, DELETE ON audit_log FROM app_role;
```

---

## Geo-Query Reference (`db/queries/geo_queries.sql`)

| Query | Use case |
|-------|----------|
| Q1  | Basic radius search |
| Q2  | Radius + plug type filter |
| Q3  | Full combined filter (all driver app filters) |
| Q4  | Bounding box viewport search (map pan) |
| Q5  | KNN nearest-N (`<->` operator, no radius limit) |
| Q6  | Available right now (excludes active bookings) |
| Q7  | Cluster heatmap (`ST_SnapToGrid`) |
| Q8  | Host earnings by listing with spatial context |
| Q9  | Incident density heatmap (safety admin) |
| Q10 | Route corridor search (`ST_LineLocatePoint`) |
| Q11 | Competitor pricing lookup (host listing builder) |
| Q12 | Materialised view `mv_active_listing_pins` |
| Q13 | Coordinate verification utility |

---

## Seed Files

Run in order for a full investor-demo dataset:

| File | Contents | Depends on |
|------|----------|-----------|
| `001_seed.sql` | Base dataset: 3 users, 2 vehicles, 3 listings, 1 booking, 1 session, 1 review, sample notifications | — |
| `002_demo_extended.sql` | SMB host, installer, 10 listings, wallet history, rewards, emergency session, dispute, safety scores, webhook | 001 |
| `003_demo_personas.sql` | 5 full investor-demo personas: Sarah (host), Dev (SMB), Marcus (frequent driver), Andy (new driver), Claire (installer) | 001, 002 |
| `004_demo_listings.sql` | 5 real UK listings with PostGIS coordinates (London, Manchester, Edinburgh, Bristol, Birmingham) | 003 |
| `005_demo_bookings.sql` | 3 bookings across all statuses (confirmed/completed/pending) + Stripe transaction | 003, 004 |
| `006_demo_sessions.sql` | Completed session with 6 timed meter value snapshots + live kWh progression | 005 |
| `007_demo_reviews.sql` | Dual-sided published reviews + listing average_rating / review_count update | 005, 006 |

```bash
# Load the full investor demo dataset (run from workspace root)
for seed in 001 002 003 004 005 006 007; do
  psql -U postgres -d zipgrid_dev -f "db/seeds/${seed}_*.sql"
done
```



```env
DATABASE_URL=postgresql://postgres:password@localhost:5432/zipgrid_dev
DIRECT_URL=postgresql://postgres:password@localhost:5432/zipgrid_dev
```

---

## Refresh Materialised View

Schedule this every 5 minutes via `pg_cron` or your app's job queue:

```sql
REFRESH MATERIALIZED VIEW CONCURRENTLY mv_active_listing_pins;
```
