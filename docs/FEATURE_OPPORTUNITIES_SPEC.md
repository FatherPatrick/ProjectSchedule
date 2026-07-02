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
| Payments / deposits | ✅ (flagged off) | ✅ | ✅ | ✅ | ✅ | Shipped in STRIPE_SPEC.md, inert behind `STRIPE_PAYMENTS_ENABLED` |
| **Waitlist management** | ✅ | ✅ | ✅ | ❌ | ✅ | Shipped 2026-07-02 — simple FCFS (see #5 below) |
| **Google Calendar / iCal export** | ✅ | ❌ | ✅ | ✅ | ✅ | Shipped — `.ics` download + Google Calendar link in confirmation/reminder emails |
| **Client visit history (admin)** | ✅ | ✅ | ✅ | ✅ | ✅ | Shipped — `/admin/clients` list + `/admin/clients/[id]` detail |
| **Rebooking from confirmation** | ✅ | ❌ | ✅ (1-tap) | ✅ | ✅ | Shipped — `?serviceId=` deep link in confirmation/reminder emails |
| **Review request (post-appt)** | ✅ | ❌ | ✅ | ❌ | ✅ | Shipped — fires on admin "mark complete", URL configurable in `/admin/hours` |
| **Multi-service booking** | ✅ | ✅ | Partial | ✅ | ✅ | Shipped — `AppointmentAddOn`, see #6 |
| **Loyalty / stamp card** | ✅ | ❌ | ✅ | ❌ | ✅ | Shipped (stamp-card-only) — see #8 |
| **Packages / bundles** | ✅ | ✅ | ✅ | ✅ | ✅ | Shipped (admin-sold, no online checkout yet) — see #7 |
| **Recurring appointments** | ✅ (admin-only) | ❌ | ❌ | ✅ | Partial | Shipped — see #9 |
| **Client portal (login)** | ❌ | ❌ | ❌ | ✅ | Partial | **Tier 2 gap** |
| **Gift cards** | ❌ | ❌ | ❌ | ✅ | ✅ | **Tier 3** |
| **Photo gallery (services)** | ❌ | ✅ | ✅ | ❌ | ❌ | **Tier 3** |
| **Social booking (IG/FB)** | ❌ | Partial | ✅ | ✅ | ✅ | **Tier 3** |
| **Marketing campaigns** | ❌ | ❌ | ✅ | ❌ | ✅ | **Tier 3** |
| **Multi-staff management** | ❌ | ✅ | ✅ | ✅ | ✅ | **Tier 3** (SaaS phase) |
| **No-show prediction (AI)** | ❌ | ❌ | ❌ | ❌ | ❌ | **Emerging — first-mover** |

---

## ⚠️ Open Decisions — Confirm Before Implementing

- [x] **Waitlist architecture** — **resolved 2026-07-01: simple first-come-first-served notify.** On cancellation, notify the single oldest `WAITING` entry for the cancelled slot's service; if unclaimed within `waitlistClaimWindowMinutes`, move to the next entry. No rule-based priority queue for v1. (§ Waitlist)
- [x] **Client accounts** — **resolved 2026-07-01: keep the current anonymous-booking + token-based model.** No Auth.js client login for now; Tier 2 features (loyalty balance, package credits) surface through the existing per-appointment management-token page rather than a persistent account. Client Portal (Tier 2 #10) stays out of scope until this is revisited. (§ Client Portal)
- [x] **Loyalty program scope** — **resolved 2026-07-02: stamp card only.** 1
  stamp per COMPLETED appointment; after `loyaltyStampsRequired` stamps, the
  client earns a configurable reward. No points/cents-balance model. (§ Loyalty)
- [x] **Package payment timing** — **resolved 2026-07-02: pay in full at
  purchase.** One Stripe PaymentIntent for the full bundle price at purchase
  time; each booking against it just draws down `sessionsUsed`, no further
  charge. (§ Packages)
- [ ] **Nail-salon specificity vs. general service** — should nail-specific workflows (nail length affecting duration, nail art photo selection, add-ons like gel/acrylic) be built, or keep the service abstraction generic for multi-tenant SaaS? (§ Nail-Specific Differentiation)

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

**Status (2026-07-02): all 5 shipped.** 4 of 5 (iCal, visit history, rebook,
review request) were already live from the pre-multi-tenant "Calendar
changes" commit; **Waitlist** (#5) shipped 2026-07-02 as simple FCFS. Tier 1
is complete — Tier 2 is next, pending the loyalty-scope and package-timing
decisions still open below.

#### 1. Google Calendar / iCal Add-to-Calendar Link — ✅ Shipped
Implemented: `src/app/api/appointments/[token]/ical/route.ts` (`.ics` download) plus a
"Add to Google Calendar" deep link, both included in confirmation/reminder emails
via `src/lib/integrations/notifications.ts`.

#### 2. Client Visit History in Admin — ✅ Shipped
Implemented: `/admin/clients` (list) and `/admin/clients/[id]` (per-client
appointment history with status badges).

#### 3. "Rebook" Link in Confirmation / Reminder Emails — ✅ Shipped
Implemented: `?serviceId=` query param pre-selects a service in
`src/app/book/BookingForm.tsx`; the link is generated in
`src/lib/integrations/notifications.ts` (`rebookUrl`) and included in both
confirmation and reminder messages.

#### 4. Post-Completion Review Request — ✅ Shipped
Implemented: `Setting.reviewRequestEnabled` / `reviewRequestUrl` (configurable
in `/admin/hours`), fired from `/api/admin/appointments/[id]/complete` via
`sendReviewRequest`.

#### 5. Waitlist Management — ✅ Shipped (2026-07-02)
Implemented per the "simple FCFS" decision locked below: `Waitlist` model +
`WaitlistStatus` (`src/lib/domain/waitlist.ts`), `Setting.waitlistEnabled` /
`waitlistClaimWindowMinutes` (toggle in `/admin/hours`), a "Notify me when a
spot opens up" CTA on the booking form when a day has no openings
(`src/app/book/TimeSlotPicker.tsx`), a public claim page
(`src/app/waitlist/[token]/page.tsx`), and `/admin/waitlist` for visibility +
manual removal. `cancelAppointment` offers the freed slot to the oldest
`WAITING` entry for that service on every CONFIRMED cancellation
(`src/lib/domain/appointments.ts`).

**Deviation from the original sketch below, worth knowing:** the freed slot
is **not held exclusively** for the notified client — it's normally bookable
the moment the cancellation lands, so the waitlisted client and any other
site visitor race for it. The claim endpoint re-checks availability with the
same conflict query the booking routes use before committing, and requeues
(not expires) the client if they lose the race. Building an actual exclusive
hold would mean extending the `PENDING_PAYMENT`-style hold mechanism to a
second, unpaid case — more machinery than "simple FCFS" called for.

**Also a platform-imposed deviation from "notify next after 30 min":**
escalating to the next waiting entry when nobody claims in time is a **daily
cron sweep** (`/api/cron/expire-waitlist`), not a tight 30-minute loop — Vercel
Cron needs a paid plan for anything more frequent than daily (same constraint
already noted for the Stripe hold-expiry sweeper). The claim window itself
(`waitlistClaimWindowMinutes`) is still enforced exactly at claim time; only
the "offer it to the next person" step is coarse, up to ~24h.
**What**: When a client tries to book a full slot or cancels an appointment, they can join a waitlist. When a cancellation opens a slot, notify the next waitlisted client by SMS/email to claim it.  
**Why it wins**: Research shows 15–20% reduction in revenue-losing schedule gaps. Both Fresha and Booksy offer this; it's table-stakes for serious salon software.  
**Schema changes** (updated for the multi-tenant model landed since this doc was
written — every tenant-owned table carries its own indexed `salonId` rather than
relying on a join through `service`/`client`, matching the rest of the schema):
```prisma
model Waitlist {
  id          String   @id @default(cuid())
  salonId     String
  salon       Salon    @relation(fields: [salonId], references: [id], onDelete: Cascade)
  serviceId   String
  service     Service  @relation(fields: [serviceId], references: [id])
  clientId    String
  client      Client   @relation(fields: [clientId], references: [id])
  requestedAt DateTime @default(now())
  notifiedAt  DateTime?
  claimedAt   DateTime?
  expiresAt   DateTime  // auto-expire stale entries after ~7 days
  status      WaitlistStatus @default(WAITING)

  @@index([salonId, serviceId, status])
}

enum WaitlistStatus { WAITING NOTIFIED CLAIMED EXPIRED }
```
**Flow**: On cancellation webhook (`/api/appointments/[id]/cancel`), query `Waitlist` for entries matching the cancelled appointment's `serviceId` and a `requestedAt` window. Send SMS to first WAITING entry via Twilio with a unique claim link (similar to the management token pattern). Entry moves to `NOTIFIED`; if unclaimed in 30 min, notify the next entry.  
**Effort**: 3–5 days.

---

### Tier 2 — Medium effort, strong retention / revenue lift

**Status (2026-07-02): ✅ Tier 2 complete.** All four items — #6
Multi-Service Booking, #7 Packages, #8 Loyalty, #9 Recurring — are shipped,
in spec order. See each write-up below for what shipped and the scope
decisions made along the way (all documented rather than silently applied).
Client Portal (#10, Tier 2's other item) stays out of scope per the
"Client accounts" decision above — that's the only Tier 2 item not built,
deliberately. Next up is Tier 3 (photo gallery, social booking links,
marketing campaigns, AI no-show prediction) whenever that's prioritized.

#### 6. Multi-Service Booking — ✅ Shipped (2026-07-02)
**What**: Client can add multiple services in a single booking session (e.g., gel manicure + pedicure). System calculates total duration and blocks the combined time.  
**Why it wins**: Mindbody has this on their "coming soon" roadmap; it's a gap even top competitors haven't fully solved. For nail salons specifically, clients frequently want nail + pedicure combos.  

**Implementation** (a deliberate, lower-blast-radius variant of the two schema options originally sketched here): kept `Appointment.serviceId` as the primary service and added a relational `AppointmentAddOn` join table for the rest — not the JSON-field option, but also not a full N-way `AppointmentService` normalization. Every existing read of `appointment.service` (billing, notifications, admin views, mobile types) kept working unchanged; add-ons are additive.
- `AppointmentAddOn` model (`appointmentId`, `serviceId`, `sortOrder`) — no `salonId`, tenancy implied via `appointmentId` (same pattern as `NotificationLog`).
- `src/lib/domain/appointmentServices.ts`: `resolveAddOnServices` (validates active/same-salon/no-duplicates/max 4), `totalDurationMinutes`/`totalPriceCents`, `createAppointmentWithAddOns` (appointment + add-on rows in one transaction — shared by all three booking-creation routes).
- `getAvailableSlots` takes `additionalDurationMinutes` so the combined duration blocks the right window.
- Public `BookingForm` gets a "2. Add extra services (optional)" checkbox step; `AdminBookingForm` gets the same for admin-created bookings.
- Notifications (confirmation/reminder/cancellation/review-request) show "Gel Manicure + Pedicure" instead of just the primary service.
- Admin calendar, client history, and the billing payments list all show the full service combo.

**Known simplification, not a bug**: the billing dashboard's per-service revenue breakdown (`getRevenueByService`) still attributes a multi-service booking's *entire* payment to the primary service only — add-on revenue isn't broken out per-service there (though the payments list row does show the full combo). Splitting a bundled charge across services would need either a price-allocation rule or per-service Payment rows, out of scope for this pass.

**Also out of scope for now**: the waitlist (#5 above) is single-service only — joining the waitlist for a multi-service combo isn't supported. Mobile app types (`AppointmentDTO`) still expose only the primary service, consistent with mobile styling being tracked separately in `TODO.md`.

#### 7. Packages / Prepaid Bundles
**What**: Client purchases a bundle (e.g., "5 gel manicures for $200, save $25"). Each booking deducts from their balance. Admin can see a client's remaining package credits.  
**Why it wins**: Acuity's package system is their #1 retention differentiator for service businesses. Upfront revenue, guaranteed future visits.

**Scope decision (2026-07-02), not asked as a separate open decision but worth
recording:** v1 does **not** build a public self-checkout for buying a
package online. Reason: Stripe payments are still off everywhere
(`STRIPE_PAYMENTS_ENABLED=false`, no real test-mode QA done yet per
`docs/STRIPE_SPEC.md`), so building a *second* live-charge surface
(package purchase) before the first one (booking deposits/full-pay) has
even been exercised for real would compound untested payment surface for
no immediate benefit. Instead, **the admin records the sale** (in-person or
phone transaction, same as today) via a form on the client's detail page —
this mirrors the precedent already set for admin-created bookings (§4.4 of
STRIPE_SPEC.md: "v1 default — skip online card collection"). The "pay in
full at purchase" open decision still governs the *bookkeeping*
(`ClientPackage.paidCents` = the full price, no partial/credit-balance
tracking) — it just doesn't imply the money has to move through a new
Stripe Elements flow in v1. Once Stripe booking payments are live and QA'd,
a public purchase page re-using the same Payment Element pattern as
`PaymentStep.tsx` is a natural follow-up.

**Schema changes** (`salonId` added per the multi-tenant convention — see the
Waitlist note above):
```prisma
model Package {
  id            String   @id @default(cuid())
  salonId       String
  salon         Salon    @relation(fields: [salonId], references: [id], onDelete: Cascade)
  name          String
  serviceId     String
  service       Service  @relation(...)
  totalSessions Int
  priceCents    Int
  active        Boolean  @default(true)

  @@index([salonId])
}

model ClientPackage {
  id            String   @id @default(cuid())
  salonId       String
  salon         Salon    @relation(fields: [salonId], references: [id], onDelete: Cascade)
  clientId      String
  packageId     String
  purchasedAt   DateTime @default(now())
  sessionsUsed  Int      @default(0)
  sessionsTotal Int
  paidCents     Int

  @@index([salonId, clientId])
}
```
**Dependencies**: Requires Stripe for purchase. Links to `STRIPE_SPEC.md`.  
**Effort**: 5–8 days (after Stripe is live).

**Status: ✅ Shipped (2026-07-02)**, per the v1 scope decision above (admin
records the sale, no online checkout yet).
- `Package` (admin template, `/admin/packages`) and `ClientPackage` (a
  client's purchased instance, sold from `/admin/clients/[id]`) models, plus
  `Appointment.clientPackageId` to record which booking drew down a session.
- `src/lib/domain/packages.ts`: `findRedeemablePackage` (oldest-first, only
  when the booking is exactly the package's service with **no add-ons** —
  no partial-package/partial-card split) and `refundPackageSession`.
- Wired into both `/api/appointments` (public) and `/api/admin/appointments`
  — a redeemable package always wins over a Stripe charge when one exists.
  **Not wired into `/api/appointments/propose`** (the pending-approval
  flow) — redeeming a session before an admin approves (or declines) the
  request would need the same refund-on-decline handling Stripe deposits
  already have, and this pass didn't extend that far.
- `cancelAppointment` refunds the session (not just Stripe payments) under
  the exact same refund-eligibility rule already used for Stripe (§5.3):
  timely client self-cancel always refunds, admin cancel keeps it by default.
- Admin calendar tags a package-redeemed appointment `(package)`; the client
  detail page shows owned packages with a `used/total` badge and tags which
  past appointments drew from one.

#### 8. Loyalty / Stamp Card
**What**: Client earns 1 stamp per completed appointment. After N stamps (configurable by admin), they earn a reward (free service, discount).  
**Why it wins**: Booksy's stamp card is their most-cited retention feature in reviews. SimplyBook.me has it. Drives repeat visits.  
**Schema changes** (`salonId` added per the multi-tenant convention — see the
Waitlist note above):
```prisma
model LoyaltyStamp {
  id            String   @id @default(cuid())
  salonId       String
  salon         Salon    @relation(fields: [salonId], references: [id], onDelete: Cascade)
  clientId      String
  appointmentId String   @unique
  earnedAt      DateTime @default(now())

  @@index([salonId, clientId])
}

model LoyaltyReward {
  id          String   @id @default(cuid())
  salonId     String
  salon       Salon    @relation(fields: [salonId], references: [id], onDelete: Cascade)
  clientId    String
  redeemedAt  DateTime?
  expiresAt   DateTime
  description String   // "Free gel manicure"

  @@index([salonId, clientId])
}
```
Add to `Setting`: `loyaltyStampsRequired` (int, default 10), `loyaltyRewardDescription` (string).  
**Effort**: 3–4 days.

**Status: ✅ Shipped (2026-07-02).** `src/lib/domain/loyalty.ts`'s
`awardLoyaltyStamp` is called from the admin "mark complete" route
(`/api/admin/appointments/[id]/complete`) — the only place an appointment
becomes `COMPLETED`. Idempotent via `LoyaltyStamp.appointmentId`'s unique
constraint (a `P2002` on re-complete is a silent no-op, so no reversal path
was needed — `cancelAppointment` can't touch an already-`COMPLETED`
appointment). No stamp-to-reward link is tracked: eligibility is "total
stamps vs. total rewards ever earned" compared against
`Setting.loyaltyStampsRequired`, matching the spec's flatter schema.
Rewards expire 90 days after being earned (a reasonable default, not
admin-configurable in v1). Admin controls (toggle, stamps-per-reward,
reward description) live in `/admin/hours`; stamp progress, unredeemed
rewards, and a "mark redeemed" action live on `/admin/clients/[id]`.

#### 9. Recurring Appointment Scheduling
**What**: Admin or client can set a booking to repeat (weekly, biweekly, monthly). System auto-creates future appointments within the max-advance window as each prior one completes.  
**Why it wins**: Acuity's recurring appointments are a top-cited feature for salons with regular clients. Removes friction for the "I come every 3 weeks" client.  
**Schema changes**: Add `recurrenceRule String?` (iCal RRULE format) and `parentAppointmentId String?` to `Appointment`.  
**Effort**: 4–6 days.

**Scope decision (2026-07-02), not a formal open decision but worth
recording:** v1 ships two deliberate simplifications from the sketch above:
1. **Admin-only** — booked from `/admin/book`, not the public self-service
   form. Recurring interacts with payments (does each occurrence charge
   separately? does a declined/failed charge break the series?) and with
   add-ons/packages in ways that need real design thought; admin bookings
   already never charge (existing precedent) and never carry add-ons or
   package redemption, which sidesteps all of that. A public-facing version
   is a natural follow-up once that design question gets its own pass.
2. **A simplified 3-value interval (`WEEKLY`/`BIWEEKLY`/`MONTHLY`), not real
   iCal RRULE syntax.** Full RFC 5545 RRULE (BYDAY, BYSETPOS, exceptions,
   etc.) is a lot of parsing/generation machinery for three named cadences
   nobody asked to combine. `recurrenceRule` is a Prisma enum instead of a
   free string.
3. **Upfront batch creation, not a rolling "create the next one as each
   prior completes" cron.** The admin picks a number of occurrences (2–12)
   at booking time and every appointment in the series is created
   immediately (each independently conflict-checked — a taken slot is
   skipped, not a series-blocking error, and the cadence continues from the
   *original* schedule rather than shifting). This avoids needing a new
   cron job and a "how far into the future should we auto-generate" policy
   decision. The tradeoff: a series longer than 12 visits, or one that
   needs to extend past what was originally requested, means booking a new
   batch by hand.

**Schema**: `Appointment.recurrenceRule RecurrenceRule?` (set only on the
first/parent appointment of a series) and `Appointment.parentAppointmentId
String?` (set on every subsequent occurrence, pointing at that same first
appointment — a star topology, not a linked list, so finding "the rest of
the series" is a single query either direction). `onDelete: SetNull` on the
self-relation so bulk-clearing cancelled appointments can't cascade-delete
a whole series.

**Status: ✅ Shipped (2026-07-02).** `src/lib/domain/recurring.ts`:
`nextOccurrenceStart` (the three-cadence date math) and
`createRecurringSeries` (first-occurrence conflict is a hard 409, later
conflicts are skipped without shifting the cadence). Wired into
`/api/admin/appointments` as an alternate path from the single-booking
flow — mutually exclusive with add-ons at both the Zod schema level
(`.refine`) and in `AdminBookingForm`'s UI (picking one clears the other).
Admin calendar and client-history views tag recurring occurrences.
**This closes out Tier 2** — all four items (#6 multi-service, #7 packages,
#8 loyalty, #9 recurring) are now shipped.

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
Phase A — Quick wins (before or alongside Stripe) — ✅ done (2026-07-01)
  1. Google Calendar / iCal link in confirmation email
  2. Rebook link in confirmation / reminder emails
  3. Client visit history page in admin
  4. Review request on COMPLETED status

Phase B — Stripe is now live behind its flag; unblocked
  5. Waitlist management (adds Waitlist schema) — ✅ done (2026-07-02)
  6. Loyalty / stamp card (adds LoyaltyStamp schema) — ✅ done (2026-07-02, see #8)
  7. Service photo gallery (adds storage)

Phase C — Client retention suite (after multi-tenant foundation)
  8. Multi-service booking (schema migration) — ✅ done (2026-07-02, see #6)
  9. Packages / bundles (requires Stripe, Package schema) — ✅ done (2026-07-02, see #7)
 10. Recurring appointments (adds recurrenceRule to Appointment) — ✅ done (2026-07-02, admin-only, see #9)

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
