# Feature Opportunities — Market Research & Roadmap Spec

_What the market wants, what competitors are getting wrong, and where this app can own a niche._

---

## TL;DR

This app is a clean, well-architected single-salon booking system. The planned Stripe + multi-tenant SaaS work is the right call. This document maps the feature gap between what's built and what the market's top tools offer, identifies the pain points competitors have failed to solve, and prioritizes what to build next.

**The strategic opening**: Fresha and Booksy have become bloated marketplace platforms that erode salon revenue through commissions and opaque fees. Vagaro is too complex for solo nail techs. The gap is a **nail-salon-specific SaaS** with transparent flat-rate pricing, all client retention tools in one place (waitlist, loyalty, packages), and no marketplace commission eating into bookings.

---

## Competitive Landscape

### Fresha
- **Pricing**: $19.95/mo (solo) + **20% commission** on every new client from the marketplace (min $6/booking) + per-SMS overage charges
- **Differentiators**: Beautiful UI, discovery marketplace, package bundles, multi-provider coordination, inventory tracking
- **Pain points**: The commission model is the #1 complaint — practitioners who grow on Fresha's marketplace find it unsustainable. Billing opacity. SMS costs accumulate unpredictably. Switched from "free" positioning in early 2025, burning trust.
- **Capterra**: 4.8/5 (1,446 reviews)

### Booksy
- **Pricing**: $29.99/mo (1 staff) + $20/mo per additional staff + $49.99/mo for "Boost" no-show protection
- **Differentiators**: 35M+ consumer marketplace, Instagram/Facebook direct booking, one-tap rebooking, flat-rate (no commissions), waitlist management, loyalty stamp programs, review collection
- **Pain points**: App crashes; clunky client-facing UX; SMS reminders are Booksy-branded (not the business's brand); limited reporting; lost client data on forced Genbook migration burned a large cohort
- **Capterra**: 4.4/5 (479 reviews)

### Vagaro
- **Pricing**: $23.99–$30/mo + add-ons that accumulate quickly
- **Differentiators**: Most complete back-office (payroll, POS, accounting, inventory), HIPAA SOAP notes, native website builder, 50+ integrations, staff commission tracking
- **Pain points**: Setup complexity; too much for solo nail techs; payment processing glitches; single-calendar model struggles with growing teams; the add-on model means the actual price for a full-featured setup is much higher than advertised

### Acuity Scheduling (Squarespace)
- **Pricing**: $20/mo (1 staff) → $33/mo (6 staff/locations) → $61/mo (36 staff, HIPAA)
- **Differentiators**: Gold standard for client-facing experience — packages, memberships, gift cards, tipping, deposits, intake forms, client portal with appointment history, Facebook/Instagram booking, coupons, recurring appointments
- **Pain points**: No free plan; Squarespace ownership raises lock-in concern; no AI features; 30+ integrations (weak vs Calendly's 150+)

### SimplyBook.me
- **Pricing**: Free (50 bookings) → $11.90/mo → $24.90/mo (15 providers!) → $49.90/mo
- **Differentiators**: 77+ modular features, AI Voice Booking, Google review auto-requests, WhatsApp notifications, HIPAA at mid-tier, volume-based pricing (15 providers at $24.90/mo beats per-user pricing), 12+ payment gateways
- **Pain points**: Overwhelming feature surface; modular pricing means the "real" cost of a complete setup is higher than the tier price suggests

### Setmore
- **Pricing**: Free (4 users, 200 appts/mo) → $5/user/mo unlimited
- **Differentiators**: Live Receptionist (human call answering at $99/mo), 24/7 human support on free plan, QR codes, LawPay integration, truly generous free tier
- **Pain points**: No payroll/timesheets; not suited for enterprises; free tier caps at 200 bookings

---

## Feature Gap Analysis

This table shows what's built, what's missing, and which competitors have it.

| Feature | This App | Fresha | Booksy | Acuity | SimplyBook | Notes |
|---|---|---|---|---|---|---|
| Self-service booking | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| SMS + email confirmations | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| 24h reminders | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Cancellation self-service | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Admin dashboard | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Request / pending approval mode | ✅ | ❌ | ❌ | ❌ | Partial | Differentiator |
| Blackout dates | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Business hours overrides | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| Mobile admin app | ✅ | ✅ | ✅ | ✅ | Partial | — |
| Push notifications (admin) | ✅ | ❌ | ✅ | ❌ | ❌ | Differentiator |
| Payments / deposits | 🔜 Planned | ✅ | ✅ | ✅ | ✅ | In Stripe spec |
| **Waitlist management** | ❌ | ✅ | ✅ | ❌ | ✅ | **Tier 1 gap** |
| **Google Calendar / iCal export** | ❌ | ❌ | ✅ | ✅ | ✅ | **Tier 1 gap** |
| **Client visit history (admin)** | Partial* | ✅ | ✅ | ✅ | ✅ | **Tier 1 gap** |
| **Rebooking from confirmation** | ❌ | ❌ | ✅ (1-tap) | ✅ | ✅ | **Tier 1 gap** |
| **Review request (post-appt)** | ❌ | ❌ | ✅ | ❌ | ✅ | **Tier 1 gap** |
| **Multi-service booking** | ❌ | ✅ | Partial | ✅ | ✅ | **Tier 2 gap** |
| **Loyalty / stamp card** | ❌ | ❌ | ✅ | ❌ | ✅ | **Tier 2 gap** |
| **Packages / bundles** | ❌ | ✅ | ✅ | ✅ | ✅ | **Tier 2 gap** |
| **Recurring appointments** | ❌ | ❌ | ❌ | ✅ | Partial | **Tier 2 gap** |
| **Client portal (login)** | ❌ | ❌ | ❌ | ✅ | Partial | **Tier 2 gap** |
| **Gift cards** | ❌ | ❌ | ❌ | ✅ | ✅ | **Tier 3** |
| **Photo gallery (services)** | ❌ | ✅ | ✅ | ❌ | ❌ | **Tier 3** |
| **Social booking (IG/FB)** | ❌ | Partial | ✅ | ✅ | ✅ | **Tier 3** |
| **Marketing campaigns** | ❌ | ❌ | ✅ | ❌ | ✅ | **Tier 3** |
| **Multi-staff management** | ❌ | ✅ | ✅ | ✅ | ✅ | **Tier 3** (SaaS phase) |
| **No-show prediction (AI)** | ❌ | ❌ | ❌ | ❌ | ❌ | **Emerging — first-mover** |

_*Client history: the `Appointment` and `Client` tables contain full history, but there is no admin UI to browse a specific client's past bookings._

---

## ⚠️ Open Decisions — Confirm Before Implementing

- [ ] **Nail-salon specificity vs. general service** — should nail-specific workflows (nail length affecting duration, nail art photo selection, add-ons like gel/acrylic) be built, or keep the service abstraction generic for multi-tenant SaaS? (§ Nail-Specific Differentiation)
- [ ] **Client accounts** — should clients be able to create logins to view history and rebook, or keep the current anonymous-booking + token-based model? Affects scope of Tier 2 features significantly. (§ Client Portal)
- [ ] **Waitlist architecture** — simple first-come-first-served SMS blast on cancellation, or smart queue with rule-based priority (next on list, client preferences, slot size match)? (§ Waitlist)
- [ ] **Loyalty program scope** — points-based (earn/redeem cents), stamp card (visit 10 get 1 free), or both? (§ Loyalty)
- [ ] **Package payment timing** — pay in full at package purchase vs. pay-per-use with a pre-purchased credit balance? (§ Packages)

---

## Strategic Market Position

### The void to fill

Every major competitor has drifted toward one of two failure modes:

1. **Marketplace trap** (Fresha, Booksy): Discovery is valuable but the commission model makes the platform adversarial to the business once it grows. Clients belong to the marketplace, not the salon.
2. **Feature bloat** (Vagaro, Mindbody): Powerful but complex. A solo nail tech running a 2-chair studio doesn't need payroll, HIPAA SOAP notes, or a POS dual-screen system.

**The opening**: A SaaS platform purpose-built for nail salons (and small beauty studios), with:
- **Transparent flat-rate pricing** — no commission, no per-booking fees, no SMS overage surprises
- **Your clients stay yours** — no marketplace discovery that trains clients to shop around
- **All the retention tools in one place** — waitlist, loyalty, packages, review requests — currently spread across 2–3 separate apps for most solo nail techs
- **Nail-salon-aware workflows** — duration by service type, photo gallery for nail art inspiration, add-on gel/acrylic/nail art at booking

This is exactly the trajectory the multi-tenant spec establishes. The question is which features make each tenant's sub-site stickier for their clients.

---

## Prioritized Features

### Tier 1 — High impact, low-to-moderate effort

These fill the most painful gaps without requiring new data models. Most can be built on top of what's already in the schema.

#### 1. Google Calendar / iCal Add-to-Calendar Link
**What**: Include an `.ics` file attachment (or "Add to Google Calendar" deep link) in every booking confirmation email.  
**Why it wins**: Reduces no-shows by 15–25% (client has a calendar event with the appointment details). Every competitor either offers this or calendar sync. Zero new schema changes required.  
**How to build**: In `src/app/api/appointments/route.ts` (booking handler) and the email templates in `src/lib/email/`, generate an `.ics` string with `BEGIN:VCALENDAR` / `VEVENT` blocks using the appointment's `startsAt`, `endsAt`, `service.name`, and business address. Attach as `text/calendar` or include as a data URI link.  
**Effort**: 1–2 days.

#### 2. Client Visit History in Admin
**What**: Admin can click a client's name on the calendar and see their full booking history, notes, and cancellations.  
**Why it wins**: The data already exists in the `Appointment` table joined to `Client`. Right now there is no way to view a client's history without querying the DB directly. Enables personalization ("last time you got gel, want to add that again?").  
**How to build**: Add a `/admin/clients/[id]` route that queries `appointment.findMany({ where: { clientId } })` with service and status data. Link client names in the calendar view to this page.  
**Effort**: 2–3 days.

#### 3. "Rebook" Link in Confirmation / Reminder Emails
**What**: A deep-link in confirmation and reminder emails that pre-selects the same service and technician, dropping the client straight into the date picker.  
**Why it wins**: Booksy's "one-tap rebooking" is one of their most-cited retention features. Converts satisfied clients into repeat bookings with zero friction. Pre-populating `serviceId` in the booking URL is a query param change.  
**How to build**: Add `?serviceId=<id>` query param handling in the public booking form (service selection step) to pre-select a service. Pass this in the email template alongside the cancellation token.  
**Effort**: 1 day.

#### 4. Post-Completion Review Request
**What**: When an appointment status is set to `COMPLETED`, fire an email/SMS asking the client to leave a Google review (or Yelp).  
**Why it wins**: SimplyBook.me automated Google review requests are a differentiating feature. New client acquisition via organic reviews costs nothing.  
**How to build**: In the admin's "mark complete" action (`/api/admin/appointments/[id]`), trigger a new notification kind `REVIEW_REQUEST` via the existing `NotificationLog` + Resend/Twilio pipeline. Add the Google Maps review link as a configurable `Setting` in the admin dashboard.  
**Effort**: 1–2 days.

#### 5. Waitlist Management
**What**: When a client tries to book a full slot or cancels an appointment, they can join a waitlist. When a cancellation opens a slot, notify the next waitlisted client by SMS/email to claim it.  
**Why it wins**: Research shows 15–20% reduction in revenue-losing schedule gaps. Both Fresha and Booksy offer this; it's table-stakes for serious salon software.  
**Schema changes**:
```prisma
model Waitlist {
  id          String   @id @default(cuid())
  serviceId   String
  service     Service  @relation(fields: [serviceId], references: [id])
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  requestedAt DateTime @default(now())
  notifiedAt  DateTime?
  claimedAt   DateTime?
  expiresAt   DateTime  // auto-expire stale entries after ~7 days
  status      WaitlistStatus @default(WAITING)
}

enum WaitlistStatus { WAITING NOTIFIED CLAIMED EXPIRED }
```
**Flow**: On cancellation webhook (`/api/appointments/[id]/cancel`), query `Waitlist` for entries matching the cancelled appointment's `serviceId` and a `requestedAt` window. Send SMS to first WAITING entry via Twilio with a unique claim link (similar to the management token pattern). Entry moves to `NOTIFIED`; if unclaimed in 30 min, notify the next entry.  
**Effort**: 3–5 days.

---

### Tier 2 — Medium effort, strong retention / revenue lift

#### 6. Multi-Service Booking
**What**: Client can add multiple services in a single booking session (e.g., gel manicure + pedicure). System calculates total duration and blocks the combined time.  
**Why it wins**: Mindbody has this on their "coming soon" roadmap; it's a gap even top competitors haven't fully solved. For nail salons specifically, clients frequently want nail + pedicure combos.  
**Schema changes**: `Appointment` currently links to a single `serviceId`. Either:  
- Add a `AppointmentService` join table (allows multiple services per appointment), or  
- Keep `serviceId` for the primary service and add an `addons` JSON field listing add-on service IDs.  
The join table approach is cleaner for reporting.  
**Effort**: 5–7 days (schema migration + booking form UX overhaul).

#### 7. Packages / Prepaid Bundles
**What**: Client purchases a bundle (e.g., "5 gel manicures for $200, save $25"). Each booking deducts from their balance. Admin can see a client's remaining package credits.  
**Why it wins**: Acuity's package system is their #1 retention differentiator for service businesses. Upfront revenue, guaranteed future visits.  
**Schema changes**:
```prisma
model Package {
  id            String   @id @default(cuid())
  name          String
  serviceId     String
  service       Service  @relation(...)
  totalSessions Int
  priceCents    Int
  active        Boolean  @default(true)
}

model ClientPackage {
  id            String   @id @default(cuid())
  clientId      String
  packageId     String
  purchasedAt   DateTime @default(now())
  sessionsUsed  Int      @default(0)
  sessionsTotal Int
  paidCents     Int
}
```
**Dependencies**: Requires Stripe for purchase. Links to `STRIPE_SPEC.md`.  
**Effort**: 5–8 days (after Stripe is live).

#### 8. Loyalty / Stamp Card
**What**: Client earns 1 stamp per completed appointment. After N stamps (configurable by admin), they earn a reward (free service, discount).  
**Why it wins**: Booksy's stamp card is their most-cited retention feature in reviews. SimplyBook.me has it. Drives repeat visits.  
**Schema changes**:
```prisma
model LoyaltyStamp {
  id            String   @id @default(cuid())
  clientId      String
  appointmentId String   @unique
  earnedAt      DateTime @default(now())
}

model LoyaltyReward {
  id          String   @id @default(cuid())
  clientId    String
  redeemedAt  DateTime?
  expiresAt   DateTime
  description String   // "Free gel manicure"
}
```
Add to `Setting`: `loyaltyStampsRequired` (int, default 10), `loyaltyRewardDescription` (string).  
**Effort**: 3–4 days.

#### 9. Recurring Appointment Scheduling
**What**: Admin or client can set a booking to repeat (weekly, biweekly, monthly). System auto-creates future appointments within the max-advance window as each prior one completes.  
**Why it wins**: Acuity's recurring appointments are a top-cited feature for salons with regular clients. Removes friction for the "I come every 3 weeks" client.  
**Schema changes**: Add `recurrenceRule String?` (iCal RRULE format) and `parentAppointmentId String?` to `Appointment`.  
**Effort**: 4–6 days.

#### 10. Client-Facing Portal
**What**: Clients get a login (email magic link) to view their appointment history, current package balance, loyalty stamp count, and upcoming appointments — with self-service reschedule.  
**Why it wins**: Acuity's client portal is their clearest differentiator vs. Calendly. Dramatically reduces inbound "what time was my appointment?" messages to the salon.  
**Schema changes**: The `User` model already has `CLIENT` role. This feature activates it. Client portal lives at `/my` (or similar).  
**Dependencies**: Requires Auth.js email magic link provider (currently only SMS OTP for admins). Low additional complexity since Auth.js supports email providers.  
**Effort**: 5–8 days.

---

### Tier 3 — Differentiating / Longer horizon

#### 11. Service Photo Gallery
**What**: Admin uploads photos for each service (nail art examples). Displayed on the public booking page alongside the service description.  
**Why it wins**: Booksy's portfolio feature is their #1 differentiator for nail/lash/brow businesses. Clients book based on photos. Fresha's "visual portfolio" is cited as a draw.  
**Schema changes**: `ServicePhoto` join table (`serviceId`, `storageUrl`, `sortOrder`). Photos stored in Vercel Blob or Cloudflare R2.  
**Effort**: 3–4 days (plus storage setup).

#### 12. Social Booking Integration (Instagram / Facebook)
**What**: A booking link configured for Instagram "Link in Bio" and Facebook "Book Now" button — deep-links directly into the booking form with salon pre-selected (critical for multi-tenant).  
**Why it wins**: Booksy, Acuity, Setmore, and SimplyBook.me all offer this. Instagram is the primary discovery channel for nail salons.  
**How to build**: In multi-tenant mode, each salon's booking URL (`<subdomain>.domain.com/book`) is already the right shape. Add an admin "Copy Instagram booking link" button. The Facebook "Book Now" button is a Meta Business page setting that points to a URL — no API integration required.  
**Effort**: 1 day for link generation UI; 0 days for Facebook (it's just a URL). Instagram deep links require no API.

#### 13. Automated Google Review Request (via `COMPLETED` status)
Covered in Tier 1 — bumped up because of its outsized impact on organic growth.

#### 14. Marketing Campaigns / Client Messaging
**What**: Admin composes an email or SMS blast to a filtered list of clients (e.g., "all clients who haven't booked in 60+ days").  
**Why it wins**: Vagaro's built-in marketing automation is cited as a differentiator. For nail salons, a "we miss you" message with a booking link is proven to reactivate lapsed clients.  
**How to build**: New admin route `/admin/campaigns`. Query `Client` table with filters. Send via existing Resend (email) and Twilio (SMS) integrations, using `NotificationLog` to track sends.  
**Effort**: 4–6 days.

#### 15. AI Waitlist + No-Show Prediction
**What**: Predict which bookings are high no-show risk (based on lead time, cancellation history, time of day) and proactively reach out or move them to a soft double-book. Automatically surface the waitlist for those slots.  
**Why it wins**: No current competitor (Fresha, Booksy, Acuity) has this. Cal.com launched AI Agents in March 2026 (Cal.com v6.3) but only for B2B scheduling. Medical scheduling platforms report 30–50% no-show reduction with AI prediction. First-mover opportunity in beauty.  
**How to build**: Phase 1 — rule-based scoring (lead time > 7 days + same-day client + no prior COMPLETED = high risk). Phase 2 — train a lightweight model on `Appointment` history once there's sufficient data per tenant.  
**Effort**: Phase 1: 3–4 days. Phase 2: significant.

---

## Implementation Order (Recommended)

```
Phase A — Quick wins (before or alongside Stripe)
  1. Google Calendar / iCal link in confirmation email
  2. Rebook link in confirmation / reminder emails
  3. Client visit history page in admin
  4. Review request on COMPLETED status

Phase B — After Stripe goes live
  5. Waitlist management (adds Waitlist schema)
  6. Loyalty / stamp card (adds LoyaltyStamp schema)
  7. Service photo gallery (adds storage)

Phase C — Client retention suite (after multi-tenant foundation)
  8. Multi-service booking (schema migration)
  9. Packages / bundles (requires Stripe, Package schema)
 10. Recurring appointments (adds recurrenceRule to Appointment)

Phase D — Growth / differentiation
 11. Client-facing portal (activates Client role in Auth.js)
 12. Social booking links (Instagram/Facebook — 1 day)
 13. Marketing campaigns / client messaging

Phase E — Future / AI
 14. AI no-show prediction (rule-based → ML)
 15. AI Booking Agent (conversational booking via SMS/chat)
```

---

## Config / Env Impact

New settings needed per tenant (additions to `Setting` model):

| Key | Type | Default | Feature |
|---|---|---|---|
| `loyaltyEnabled` | Boolean | false | Loyalty |
| `loyaltyStampsRequired` | Int | 10 | Loyalty |
| `loyaltyRewardDescription` | String | "Free service" | Loyalty |
| `waitlistEnabled` | Boolean | false | Waitlist |
| `waitlistClaimWindowMinutes` | Int | 30 | Waitlist |
| `reviewRequestEnabled` | Boolean | false | Review request |
| `reviewRequestUrl` | String | null | Review request (Google Maps link) |
| `rebookLinkEnabled` | Boolean | true | Rebook link |

---

## Testing Strategy

Each feature above should be verified against:
- **Waitlist**: cancel an appointment → waitlist entry gets SMS within 60s → claim link works → slot shows as CONFIRMED
- **Loyalty**: 10 completed appointments → reward notification fires → reward record created
- **Calendar export**: `.ics` attachment opens in Google Calendar / Apple Calendar / Outlook
- **Review request**: status set to COMPLETED → email fires with correct Google Maps review URL
- **Packages**: purchase 5-session package → each booking deducts 1 → zero balance blocks further use
- **Rebook link**: `?serviceId=` in URL pre-selects correct service in booking form

---

## Appendix — Highest-Risk Items

1. **Waitlist race condition**: Two clients could claim the same freed slot simultaneously. Use a DB transaction with `SELECT FOR UPDATE` on the `Waitlist` entry + re-check slot availability inside the transaction before confirming. Same pattern as the existing appointment conflict detection in the booking route.

2. **Package / loyalty data integrity**: If an appointment is cancelled after a loyalty stamp or package deduction is applied, the reversal must be atomic. Track stamps by `appointmentId @unique` so a stamp can't be double-issued, and reverse on cancellation.

3. **iCal timezone handling**: The `.ics` spec requires UTC datetimes or explicit `TZID` parameters. The app already has business-timezone abstractions — ensure the iCal generator uses the `DTSTART;TZID=<tz>:<local>` format, not naive UTC, or clients in different timezones will see wrong times.

4. **Multi-service booking duration calculation**: When two services are booked together, the system must block `sum(service.durationMinutes)` as one contiguous appointment and check that the entire window is within business hours — not just the start time.

5. **Commission-free positioning**: If/when the Stripe spec implements a SaaS platform fee, ensure it's a flat per-tenant fee and is never presented as a per-booking commission. This is the primary trust differentiator vs. Fresha.

---

_Sources consulted: Capterra, G2, Pabau.com comparison articles, GoodCall.com, Shearify.com, Zapier blog, software vendor pricing pages (Fresha, Booksy, Vagaro, Acuity, SimplyBook.me, Setmore), Mindbody product roadmap page, OnceHub buyer guide 2026, Cal.com changelog._
