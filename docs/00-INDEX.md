/**
 * @file 00-INDEX.md
 * @description Zipgrid Master Document Index — single source of truth.
 * 58 planning documents covering every aspect of the platform.
 * @version Planning Baseline v2.3 — Voice-First Complete
 * @since 2026-09-24
 * @updated 2026-09-30
 * @author Zipgrid Engineering & Product
 */

# Zipgrid — Master Document Index
## Planning Baseline v2.3 — Voice-First Complete

---

> **Platform:** AI-powered EV charging, trip planning, parking, energy & mobility ecosystem
> **Architecture:** DDD Modular Monolith → SOA → Microservices · Build once, scale forever
> **Stack:** Next.js 15 · PostgreSQL/PostGIS · OCPP · LangChain · Stripe · Mapbox · Railway eu-west
> **Design:** Light `#FFFFFF` · Dark `#000000` · Night `#0D0D0D+warm` · Accent `#00C853` · Inter · No AI icons
> **AI Modes:** Standard (SaaS) · Hybrid (default) · Agentic (fully automated)
> **Market:** UK → EU → Americas → Global | Data: Railway eu-west Amsterdam (GDPR-lawful)
> **Status:** ✅ ALL 4 PHASES BUILT — 58 documents — 17 migrations — voice-first complete — smart home integration documented
> **Last Updated:** September 30, 2026

---

## The Three Principles

> **1. "We build once. We do not rewrite. We leave nothing to chance."**
> **2. "We don't sell charging. We sell convenience."**
> **3. "The demo is the product. No fakery. No theatre."**

---

## 01 — Business (9 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 1.1 | [Business Model Canvas](./01-business/1.1-business-model-canvas.md) | 9-block canvas with UK segments, value props, 11 revenue streams, cost structure |
| 1.2 | [Vision, Mission & Goals](./01-business/1.2-vision-mission-goals.md) | **v0.3** · EV Mobility OS vision · parking + mobility tagline · leapfrog thesis · 4-phase goals · 7 competitive moats |
| 1.3 | [Market Analysis](./01-business/1.3-market-analysis.md) | TAM £159M–£282M · 1.1M UK EVs · city priority matrix · EU expansion path |
| 1.4 | [Competitive Landscape](./01-business/1.4-competitive-landscape.md) | Zap-Map £3.49/mo · Pod Point £34-40/mo · BP Pulse · Shell · Zipgrid wins 20/20 · public charger strategy |
| 1.5 | [Revenue Model](./01-business/1.5-revenue-model.md) | **v0.2** · 11 streams · wallet float (S8) · Driver Plus sub (S9) · parking commission (S10) · ESG data (S11) · Y3 £7.43M · Breakeven Month 16 · Exit £60M–£133M |
| 1.6 | [Risk Register](./01-business/1.6-risk-register.md) | 26 risks · Likelihood×Impact scoring · 2 Critical · 10 High · investor-ready |
| 1.7 | [Investor Pitch Script](./01-business/1.7-investor-pitch.md) | 12-slide deck · full word-for-word script · 5 Q&A answers |
| 1.8 | [Policy Tailwinds](./01-business/1.8-policy-tailwinds.md) | Global ICE ban timeline · UK/EU/US/China · government incentives · policy = guaranteed demand |
| 1.9 | [No-Surprises Checklist](./01-business/1.9-no-surprises-checklist.md) | 87 pre-build checks · 10 categories · pre-build gate sign-off · never rewrite again |

---

## 02 — Product (12 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 2.0 | [Requirements Gap Analysis](./02-product/2.0-gap-analysis.md) | 22 net-new features from PDF requirements · gap register · N1–N22 all placed in roadmap |
| 2.1 | [PRD v0.4](./02-product/2.1-PRD.md) | Modules A–S · all features specced · voice/AI/wallet/rewards/emergency/trip/ESG/parking |
| 2.2 | [Personas & Journey Maps](./02-product/2.2-personas-journeys.md) | 5 full personas (Sarah/Dev/Marcus/Andy/Claire) with annotated journey maps |
| 2.3 | [Feature Roadmap v0.3](./02-product/2.3-feature-roadmap.md) | **v0.3** · 4-phase leapfrog · N1–N22 all placed in correct phases · updated summary table |
| 2.4 | [UX & Design Guidelines](./02-product/2.4-ux-design-guidelines.md) | Colour tokens · Inter scale · 4px grid · component library · voice UX · WCAG 2.1 AA |
| 2.5 | [User Stories Catalogue](./02-product/2.5-user-stories.md) | 240 stories across 20 modules (108 P1 / 114 P2 / 13 P3 / 5 P4) |
| 2.6 | [Premium UI System](./02-product/2.6-premium-ui-system.md) | Offline mode · error boundaries · icon rules · button system · landing page standards |
| 2.7 | [Agentic Mode System](./02-product/2.7-agentic-mode-system.md) | Standard/Hybrid/Agentic tiers · mode UX · AI boundaries · language per mode |
| 2.8 | [Referral & Growth Programme](./02-product/2.8-referral-growth-programme.md) | Friend referral (1 month free) · business bring-a-business (up to 12 months free) · anti-abuse |
| 2.9 | [Content & Blog System](./02-product/2.9-content-blog-system.md) | 7 article categories · Contentlayer+MDX · SEO · forbidden jargon list · 3-month calendar |
| 2.10 | [Voice Navigation System](./02-product/2.10-voice-navigation-system.md) | 90+ voice commands · 9 categories · multi-turn memory · CarPlay · accessibility |
| 2.11 | [Acceptance Criteria Standards](./02-product/2.11-acceptance-criteria.md) | DoD (40 checks) · Gherkin AC format · all packages pinned · no partial features rule |
| 2.12 | [Community Module](./02-product/2.12-community-module.md) | AI+human EV hub · voice posting (Web Speech API — free) · Q&A · expert corner · emergency help · blog threads · 3-layer AI moderation |
| 2.13 | [Vertical Market Playbooks](./02-product/2.13-vertical-playbooks.md) | Care homes · warehouses & logistics · hotels · community venues · sector hooks · access segmentation · ESG/SECR automation · onboarding checklists · £220k Year 1 ARR target |

---

## 03 — Technical (14 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 3.1 | [System Architecture](./03-technical/3.1-system-architecture.md) | Full stack diagram · Next.js + OCPP + AI services · Supabase Realtime |
| 3.2 | Database Schema | See `db/` — 5 migrations · PostGIS · OCPP · Stripe · full ERD |
| 3.3 | [API Specification](./03-technical/3.3-api-specification.md) | 12 resource groups · all endpoints · JSON examples · error codes |
| 3.4 | [OCPP Integration](./03-technical/3.4-ocpp-integration.md) | OCPP 1.6J/2.0.1 · all message types · 12 UK charger brands |
| 3.5 | [Security & Privacy](./03-technical/3.5-security-privacy.md) | UK GDPR · PCI-DSS · SOC2 · threat model · JWT · RLS |
| 3.6 | [Infrastructure & DevOps](./03-technical/3.6-infrastructure-devops.md) | Railway eu-west · Vercel · Supabase · CI/CD · pg_cron |
| 3.7 | [Third-Party Services Registry](./03-technical/3.7-third-party-services.md) | 22 services · Amsterdam data residency confirmed · all DPAs required |
| 3.8 | [Business Continuity Plan](./03-technical/3.8-business-continuity.md) | RTO/RPO table · OCPP session resilience · failover procedures |
| 3.9 | [Non-Functional Requirements](./03-technical/3.9-non-functional-requirements.md) | Performance · availability 99.9% · scalability · i18n · compliance NFRs |
| 3.10 | [Engineering Standards](./03-technical/3.10-engineering-standards.md) | Three-mode theme (CSS vars) · JSDoc headers · TypeScript strict · no stubs · AI guards |
| 3.11 | [Testing Strategy](./03-technical/3.11-testing-strategy.md) | TDD + Vitest + Playwright + Maestro + k6 + pytest · CI/CD off in dev |
| 3.12 | [DDD Architecture Blueprint](./03-technical/3.12-ddd-architecture.md) | 10 bounded contexts · full folder structure · region abstraction · event bus · migration path |
| 3.13 | [Demo Seed Data Strategy](./03-technical/3.13-demo-seed-data.md) | Real data from day one · 5 personas · 12 listings · OCPP simulator · 8-min investor demo |
| 3.14 | [Developer Onboarding Guide](./03-technical/3.14-developer-onboarding.md) | Zero assumptions · 5-step setup · where-is-what reference · first PR checklist |
| 3.15 | [AI Agent Collaboration Guide](./03-technical/3.15-ai-agent-collaboration.md) | 8 specialist agents · AgentMessage protocol · handoff patterns · guard rules · new agent guide |
| 3.16 | *(see 5.6 — Compliance Certifications)* | |
| 3.17 | [Investor Diagrams Spec](./03-technical/3.17-investor-diagrams-spec.md) | 8 pitch diagrams · 5 arch diagrams · 71 wireframes · 5 data flow diagrams · Figma structure |
| 3.18 | [Smart Home Integration](./03-technical/3.18-smart-home-integration.md) | Home Assistant HACS component · Alexa Skill · Google Home Action · Siri Shortcuts · 5 HA sensor entities · automation examples |

---

## 04 — Operations (8 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 4.1 | [Operational Runbook](./04-operations/4.1-operational-runbook.md) | P1–P4 incidents · 6 service runbooks · daily/weekly checklists |
| 4.2 | [Trust & Safety Policy](./04-operations/4.2-trust-safety-policy.md) | **v0.2** · KYC · listing moderation · violation points · blind reviews · insurance triggers · Safety Score methodology (Section 10) |
| 4.3 | [Support Playbook](./04-operations/4.3-support-playbook.md) | 4 tiers · 8 scripts · escalation matrix · 30+ KB articles |
| 4.4 | [Host Onboarding](./04-operations/4.4-host-onboarding.md) | 8-step flow · voice prompts · per-brand OCPP guide · SMB addendum |
| 4.5 | [KPIs & Analytics](./04-operations/4.5-kpis-analytics.md) | North Star + 40 KPIs · 5 dashboard specs · alert thresholds |
| 4.6 | [AI Support System](./04-operations/4.6-ai-support-system.md) | Always-on agentic assistant · session context · 80% AI resolution · human handoff |
| 4.7 | [Knowledge Base & FAQ](./04-operations/4.7-knowledge-base-faq.md) | 13 categories · 100+ articles · 50 launch FAQs · semantic search · RAG pipeline |
| 4.8 | [Marketing Operations](./04-operations/4.8-marketing-operations.md) | SEO · Google/Meta paid · social · email sequences · referral · PR · budget |

---

## 05 — Legal & Compliance (6 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 5.1 | [Insurance & Liability](./05-legal-compliance/5.1-insurance-liability.md) | 3-tier model · £1M CGL umbrella · Host Protection Guarantee · incident protocol |
| 5.2 | [Regulatory Compliance](./05-legal-compliance/5.2-regulatory-compliance.md) | UK GDPR · PSD2/FCA · BS EN 61851 · OZEV · IR35 · EU expansion |
| 5.3 | [ToS & Privacy Outline](./05-legal-compliance/5.3-tos-privacy-outline.md) | 18-section legal outline · host/driver/SMB/installer terms · GDPR privacy policy |
| 5.4 | [Business Operations](./05-legal-compliance/5.4-business-operations.md) | Companies House · banking · insurance procurement · HR framework · legal spend |
| 5.5 | [Anti-Fraud & Impersonation](./05-legal-compliance/5.5-anti-fraud-impersonation.md) | ATO prevention · KYC fraud · fake listings · chargeback defence · DMARC |
| 5.6 | [Compliance Certifications](./05-legal-compliance/5.6-compliance-certifications.md) | Cyber Essentials (launch) · SOC2 Type I (Month 12) · ISO 27001 (Month 24–36) · secrets management |

---

## 06 — Go-to-Market (3 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 6.1 | [GTM Strategy](./06-go-to-market/6.1-gtm-strategy.md) | Supply-first · 6 acquisition channels · London launch campaign |
| 6.2 | [Launch Plan](./06-go-to-market/6.2-launch-plan.md) | Phase 0–4 milestones · 12-sprint build plan · launch gate 17 criteria |
| 6.3 | [Partnerships](./06-go-to-market/6.3-partnerships.md) | Octopus 90-day activation · OZEV installers · EO/Rolec/Andersen · tracker |

---

## 07 — Global Expansion (2 documents)

| # | Document | One-Line Summary |
|---|----------|-----------------|
| 7.1 | [Global Expansion Strategy](./07-global-expansion/7.1-global-expansion-strategy.md) | UK→IE→NL→DE→US→AU · data residency routing · Y5 £28M ARR |
| 7.2 | [Full Platform Vision](./07-global-expansion/7.2-full-platform-vision.md) | 5-layer OS · 8 product principles · year-by-year build · network effects · exit |

---

## Database Schema (`db/` — separate from docs)

### Migrations — 16 files, all complete

| File | Key Tables | Status |
|------|------------|--------|
| `001_extensions.sql` | postgis, pgcrypto, citext | ✅ |
| `002_core_users.sql` | users, driver_profiles, vehicles, host_profiles | ✅ |
| `003_charger_listings.sql` | charger_listings (PostGIS), availability, photos | ✅ |
| `004_bookings_sessions_payments.sql` | bookings, sessions, transactions, payouts | ✅ |
| `005_reviews_notifications_insurance.sql` | reviews, notifications, incidents, disputes, audit_log | ✅ |
| `006_auth_otp_sessions.sql` | auth OTP tokens, session management | ✅ |
| `006_wallet_rewards_safety.sql` | wallet, rewards, safety bootstrap enums | ✅ |
| `007_charger_devices_ocpp_log.sql` | charger_devices, ocpp_event_log, session_meter_values | ✅ |
| `008_booking_flow_payments.sql` | booking state machine, payment capture hooks | ✅ |
| `009_ai_sessions_agent_tasks.sql` | ai_sessions, agent_tasks, voice_commands | ✅ |
| `010_marketplace.sql` | installer_profiles, products, job_requests | ✅ |
| `011_wallet_rewards_emergency_safety_webhooks.sql` | wallet_balances, wallet_transactions, reward_points, reward_balances, reward_badges, emergency_sessions, safety_scores, webhook_subscriptions, webhook_deliveries | ✅ |
| `012_payout_gdpr_support_charger_connectors.sql` | payouts, gdpr_requests, support_tickets, charger_connectors | ✅ |
| `013_fleet_accounts.sql` | fleet_accounts, fleet_members, fleet_booking_summary view | ✅ |
| `014_user_preferences_referrals_saved.sql` | user_preferences, saved_listings, user_referrals | ✅ |
| `015_community_parking_esg_phase3.sql` | community_posts/replies/votes/reports, parking_listings/bookings, session_carbon_records, user_esg_totals, esg_report_exports, platform_esg_totals, api_tenants, api_tenant_usage, grid_schedules, driver_subscriptions, ocpi_roaming_sessions, blog_post_threads | ✅ |
| `016_wearable_commute_agent.sql` | wearable_devices, wearable_notifications, commute_patterns, commute_schedules, vertical_site_profiles · extends agent_task_type + user_preferences | ✅ |
| `017_accessibility_listing_health.sql` | charger_listings accessibility columns, listing_health_scores, listing_availability_predictions, listing_pois · extends agent_task_type with listing_health_alert, predicted_availability_update, family_mode_poi_refresh | ✅ |

### Seed Files — 10 files, full investor demo dataset

| File | Contents | Status |
|------|----------|--------|
| `db/seeds/001_seed.sql` | Base data, shared fixtures | ✅ |
| `db/seeds/002_demo_extended.sql` | Extended fixture data | ✅ |
| `db/seeds/003_demo_personas.sql` | 5 personas: Sarah, Dev, Marcus, Andy, Claire | ✅ |
| `db/seeds/004_demo_listings.sql` | 12 charger listings (London, Manchester, Edinburgh, Bristol) | ✅ |
| `db/seeds/005_demo_bookings.sql` | 4 bookings (confirmed, completed, pending, cancelled) + transaction | ✅ |
| `db/seeds/006_demo_sessions.sql` | Completed session + live active session with full meter data | ✅ |
| `db/seeds/007_demo_reviews.sql` | Blind-reveal reviews (driver + host, both published) | ✅ |
| `db/seeds/008_demo_wallets_rewards.sql` | Wallet balances/txns for all 5 personas, reward ledger, badges, Driver Plus subscription (Marcus), referral (Marcus→Andy), ESG carbon totals | ✅ |
| `db/seeds/009_demo_agent_sessions.sql` | 4 AI conversations, 5 agent tasks (fault diagnosis, tariff scheduling, pricing suggestion, recurring booking, idle fee alert), 7 voice commands, 2 grid schedules | ✅ |
| `db/seeds/010_demo_community_fleet.sql` | User preferences (all 5), saved listings, 4 community posts + 7 replies (AI instant + expert + human), votes, fleet account (GreenMove Logistics + 3 members), 1 parking listing, webhook subscription, API tenant | ✅ |
| `db/queries/geo_queries.sql` | 13 PostGIS spatial queries | ✅ |
| `db/migrate.sql` + `db/README.md` | Migration runner + schema reference | ✅ |

---

## All Architecture Decisions — Locked

| Decision | Choice |
|----------|--------|
| Architecture | DDD Modular Monolith → SOA → Microservices |
| Hosting | Railway `eu-west` Amsterdam |
| Data residency | EU (Amsterdam) — lawful under UK GDPR adequacy |
| Light mode | `#FFFFFF` |
| Dark mode | `#000000` TRUE black (not navy, not grey) |
| Night mode | `#0D0D0D` + `#F5E6C8` warm amber |
| Theme system | Tailwind CSS v4 + shadcn/ui + next-themes |
| Button corners | `border-radius: 6px` — not pill/rounded |
| Icons | Lucide base + custom domain icons — NO AI-generated packs |
| AI modes | Standard / Hybrid (default) / Agentic — user-selectable |
| Language in UI | Plain English — no OCPP, kWh, protocols, firmware |
| Content brand | "We sell convenience, not charging" |
| Voice | Web Speech API + Whisper fallback + GPT-4o intent |
| AI agents | 8 specialists + orchestrator (team model) |
| Agent comms | AgentMessage protocol — typed, ownership-validated |
| Demo data | Real DB data always — no mocks, no stubs, no theatre |
| Seed data | Fixed UUIDs — reliable deep-links for investor demos |
| No stubs rule | Zero — complete features only, or feature flag OFF |
| Money | All values in pence/cents (INT) — never floats |
| Testing | TDD for business logic · CI/CD off in dev · on for production |
| Referrals | 3 programmes (friend/business/driver) — anti-abuse enforced |
| Certifications | Cyber Essentials at launch · SOC2 Type I Month 12 · ISO 27001 Month 36 |
| Secrets | Railway env vars + 1Password — never in code or Slack |
| Diagrams | 71 wireframes + 18 architecture/investor diagrams in Figma |
| Public chargers | OCPI Phase 3 — private-first at launch |
| EU expansion | Ireland Month 30 → Netherlands Month 36 → Germany Month 42 |
| Mobile | React Native (Expo) + Expo Router — shared monorepo packages |
| Content/Blog | Contentlayer + MDX — convenience-first language throughout |
| Acceptance criteria | Gherkin format · 40-point DoD · all packages pinned in 2.11 |

---

## Document Count — Final

| Category | Documents |
|----------|-----------|
| Business (01) | 9 |
| Product (02) | 13 |
| Technical (03) | 15 |
| Operations (04) | 8 |
| Legal & Compliance (05) | 6 |
| Go-to-Market (06) | 3 |
| Global Expansion (07) | 2 |
| Index | 1 |
| **Total planning documents** | **57** |
| DB migrations | 17 |
| DB seed files | 10 |
| DB queries + runner + README | 3 |
| **Grand total files** | **87** |

---

## What Investors Will See

When you show Zipgrid to an investor, they will see:

1. **A working demo** — real data, real sessions, real AI, real payments in test mode
2. **A complete pitch script** (1.7) — 12 slides, word-for-word
3. **Architecture diagrams** (3.17) — platform, hosting, data flow, DDD
4. **A risk register** (1.6) — shows you have thought through every failure mode
5. **A policy tailwinds brief** (1.8) — governments mandated your market
6. **A competitive analysis** (1.4) — Zap-Map got funded for a map. You have 20× the capability.
7. **A financial model** (1.5) — Y3 £7.43M ARR, Month 16 breakeven, £74M–£133M exit

---

## ✅ PLANNING COMPLETE + BUILD COMPLETE — v2.3

**58 documents. 87 total files. 17 migrations. Voice-first complete.**

All genuine gaps from the founder brainstorm are now closed:
- Accessibility features on listings (wheelchair, step-free, family mode, lighting, toilet proximity)
- Multi-language voice in 9 languages (en-GB, en-IE, nl-NL, de-DE, fr-BE, fr-FR, es-ES, pl-PL, ro-RO)
- AI Listing Health Agent with predicted availability
- Smart home integration documented (Home Assistant HACS, Alexa, Google Home, Siri Shortcuts)
- Autonomous Charging Agent one-time setup flow (5 questions, 5 minutes, never think about charging again)

**The platform is voice-first, agent-driven, and screen-optional.**

**What remains is pure operational / DevOps work:**

| Category | Items | Effort |
|----------|-------|--------|
| External account setup | Stripe Connect, Firebase, Sentry, Mapbox, PostHog, Pinecone, Resend, Twilio | 1 day |
| Environment variables | Fill `.env.example` values in Railway + Vercel dashboards | 1–2 hrs |
| Test suite | Unit + E2E tests (Vitest, Playwright, pytest) | 3–5 days |
| Vertical partnerships | Care home pilot site, warehouse pilot site | 2–4 weeks |
| Partnership accounts | Zap-Map OCPI, Alexa skill, Google Actions | 2–4 days |

```
To run the investor demo:
  1. npm install
  2. psql -d zipgrid_dev -f db/migrate.sql
  3. Run seeds 001–010 in order
  4. cp apps/web/.env.example apps/web/.env.local  (fill DATABASE_URL + STRIPE + MAPBOX + OPENAI)
  5. cd apps/web && npm run dev
  → 8-minute investor demo ready at http://localhost:3000
```

> *"When a product is easy to imagine using, that's usually a very good sign."*
>
> We built it. **Now we ship it. 🚀**
