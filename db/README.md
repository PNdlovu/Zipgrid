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
| `001_extensions.sql` | `postgis`, `pgcrypto`, `citext` |
| `002_core_users.sql` | `users`, `driver_profiles`, `driver_vehicles`, `host_profiles` |
| `003_charger_listings.sql` | `charger_listings`, `listing_availability_schedules`, `listing_blackout_dates`, `listing_photos` |
| `004_bookings_sessions_payments.sql` | `bookings`, `charging_sessions`, `session_meter_values`, `transactions`, `payouts`, `payout_line_items` |
| `005_reviews_notifications_insurance.sql` | `reviews`, `notifications`, `notification_preferences`, `incident_reports`, `insurance_claims`, `disputes`, `audit_log` |

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

## Environment Variables

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
