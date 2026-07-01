# Stripe Payments — Implementation Spec

Add online payments so salons can charge clients at booking time, with an admin
toggle to enable/disable payments and an admin **billing** dashboard showing
booking revenue.

## Decisions (locked)

| Decision | Choice | Implication |
| --- | --- | --- |
| Tenancy / account model | **Stripe Connect** — each salon connects its own Stripe account | Salon is merchant of record; platform facilitates + takes a fee. Needs Connect onboarding, payout handling, per-salon account IDs. |
| What's charged | **Admin-configurable**: none / deposit / full prepay (+ deposit amount) | Per-salon `paymentMode` + deposit config; booking flow branches on it. |
| Billing page | **Salon's booking revenue dashboard** | Reporting over local `Payment` records: totals, per-service, payments list, refunds. Not platform/SaaS billing. |
| Capture & refunds | **Charge at booking; auto-refund on timely cancel** | Immediate capture. Cancel inside the allowed window → auto-refund; late cancel / no-show → keep the deposit. Admin can also refund manually. |

## ⚠️ Open decisions — confirm before implementing

These were deliberately left open in this spec. **Resolve each with the project
owner before writing code for the affected phase** — do not silently pick a
default.

- [ ] **Payment collection UI** (§4.1): embedded Stripe Payment Element
  (recommended for the mobile-first single-page flow) vs Checkout redirect
  (faster MVP). Hold/webhook logic is identical either way.
- [ ] **Propose/approval flow charge timing** (§4.3): capture the deposit at
  request time and auto-refund if the admin declines (recommended) vs capture
  only after approval.
- [ ] **Admin-created bookings** (§4.4): skip online card collection / mark
  pay-in-person (v1 default) vs send a Stripe payment link for the deposit.
- [ ] **Application fee on refunds** (§5.3): confirm exact policy — return the
  platform fee on timely full refunds, forfeit (keep) it on no-shows/late
  cancels.
- [ ] **Sub-minimum deposits** (§8): bump up to the Stripe minimum charge vs
  fall back to no-charge for that booking.
- [ ] **"Net" revenue definition** (§9): subtract Stripe processing fees in the
  dashboard's net figure, or only refunds + platform fee (processing fees aren't
  cleanly known per charge without extra API calls).
- [ ] **Mobile revenue view** (§9): include a read-only billing summary in the
  Expo admin app in v1, or defer to phase 2.

## Dependency

**This spec assumes the multi-tenant refactor in
[MULTI_TENANT_SPEC.md](MULTI_TENANT_SPEC.md) is implemented** — specifically the
`Salon` model and `salonId` scoping on every query. Stripe Connect is inherently
per-salon: each salon's `stripeAccountId`, payment config, payments, and revenue
are tenant-scoped. If Stripe is built *before* multi-tenant, every "salon" below
collapses to the single backfilled salon — but the schema should be authored
salon-scoped from the start to avoid a second migration.

## Feature flag & rollout status

This feature ships behind a **global env kill-switch**, `STRIPE_PAYMENTS_ENABLED`
(`src/lib/env.ts`), separate from the per-salon `Salon.paymentsEnabled` DB
toggle described in §3:

- `STRIPE_PAYMENTS_ENABLED` gates the feature **platform-wide** — once later
  phases build it out, this controls whether the Stripe admin nav/pages
  render, the API routes respond, and the webhook is live. It defaults to
  `"false"` everywhere, including production, so an unfinished rollout can
  never accidentally go live.
- `Salon.paymentsEnabled` (+ `paymentMode`) is the **per-salon** toggle an
  individual salon's admin controls once the platform-wide flag is on. It
  can only be `true` when `stripeChargesEnabled` is also true (§2.2).
- `src/lib/flags.ts` exports `isStripePaymentsEnabled()` — the one place
  that reads the env var. New code should gate on this helper, not on
  `process.env.STRIPE_PAYMENTS_ENABLED` directly.

**To turn the flag on** (once enough of the phases below are built to be
useful): set `STRIPE_PAYMENTS_ENABLED=true` plus `STRIPE_SECRET_KEY`,
`NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`, and
`PLATFORM_FEE_PERCENT` in the target environment's `.env` (see
`.env.example` for the full list with inline comments). In production,
`collectProdProblems` in `src/lib/env.ts` will refuse to boot if the flag is
`true` but any of those four are missing — so there's no way to half-enable
it in prod. Flipping the flag on today (before Phase 2+ exist) is harmless
but pointless: the schema is live, but nothing reads the flag yet.

**Progress against the rollout phases in §12:**

| Phase | Status |
| --- | --- |
| 1. Schema + flag | ✅ Done — migration `prisma/migrations/20260701214626_add_stripe_payment_schema`, flag scaffolding in `src/lib/env.ts` / `src/lib/flags.ts`, busy-set fix (§1.4) live in all 5 conflict-check call sites. |
| 2. Connect onboarding | Not started |
| 3. Admin config | Not started |
| 4. Booking + payment | Not started |
| 5. Refunds + sweeper | Not started |
| 6. Billing dashboard | Not started |
| 7. Hardening | Not started |

## Charge model: direct charges on the connected account

Use **direct charges** (`PaymentIntent` created with the `Stripe-Account` header
= the salon's connected account id) with an `application_fee_amount` for the
platform's cut. Rationale:

- The **salon is the merchant of record** — charges, refunds, disputes, and
  statement descriptors belong to them. Correct for independent businesses
  selling their own services.
- Liability (chargebacks/disputes) sits with the salon's account, not the
  platform.
- Platform revenue arrives via `application_fee_amount`, settled to the platform
  account automatically.

Alternative considered: **destination charges** (charge on platform, transfer to
salon). Keeps the platform as merchant of record — more platform liability and
worse fit here. Note it as the fallback if salons can't complete full Connect
onboarding/KYC.

**Connect account type: Express.** Stripe-hosted onboarding + KYC + a payout
dashboard the salon can log into, with minimal UI to build. (Standard = salon
has a full Stripe dashboard but more friction; Custom = we build everything,
most work. Express is the right middle.)

---

## 1. Data model changes (`prisma/schema.prisma`)

### 1.1 Connect fields on `Salon`

```prisma
model Salon {
  // ... existing multi-tenant fields ...

  // Stripe Connect
  stripeAccountId        String?   @unique   // acct_xxx; null until onboarding starts
  stripeChargesEnabled   Boolean   @default(false) // mirrors account.charges_enabled
  stripePayoutsEnabled   Boolean   @default(false)
  stripeDetailsSubmitted Boolean   @default(false) // onboarding form completed
  stripeAccountUpdatedAt DateTime?                  // last account.updated webhook

  // Payment configuration (admin-controlled; see §3)
  paymentsEnabled  Boolean      @default(false) // master toggle
  paymentMode      PaymentMode  @default(NONE)
  /// Deposit as a fixed amount in cents (used when depositType = FIXED).
  depositCents     Int?
  /// Deposit as a percent of the service price (used when depositType = PERCENT).
  depositPercent   Int?
  depositType      DepositType  @default(FIXED)
  currency         String       @default("usd")

  payments Payment[]
}

enum PaymentMode {
  NONE      // no online payment; pay in person (current behavior)
  DEPOSIT   // collect a deposit at booking
  FULL      // collect the full service price at booking
}

enum DepositType {
  FIXED     // depositCents
  PERCENT   // depositPercent of priceCents
}
```

### 1.2 New `Payment` model

One row per payment attempt against an appointment. Local source of truth for
the billing dashboard; reconciled with Stripe via webhooks.

```prisma
model Payment {
  id                    String        @id @default(cuid())
  salonId               String
  appointmentId         String
  stripePaymentIntentId String        @unique // pi_xxx
  /// The connected account the charge lives on (denormalized for reconciliation).
  stripeAccountId       String
  amountCents           Int           // amount charged the client
  applicationFeeCents   Int           // platform's cut
  currency              String
  status                PaymentStatus
  /// Total refunded so far, in cents (supports partial refunds).
  refundedCents         Int           @default(0)
  /// What this payment represents at the time of charge.
  kind                  PaymentKind   // DEPOSIT | FULL
  failureReason         String?
  createdAt             DateTime      @default(now())
  updatedAt             DateTime      @updatedAt

  salon       Salon       @relation(fields: [salonId], references: [id], onDelete: Cascade)
  appointment Appointment @relation(fields: [appointmentId], references: [id], onDelete: Cascade)

  @@index([salonId, status, createdAt]) // billing dashboard queries
  @@index([appointmentId])
}

enum PaymentStatus {
  REQUIRES_PAYMENT  // PI created, awaiting client action / hold
  PROCESSING
  SUCCEEDED
  FAILED
  CANCELED          // hold expired / abandoned
  REFUNDED          // fully refunded
  PARTIALLY_REFUNDED
}

enum PaymentKind {
  DEPOSIT
  FULL
}
```

### 1.3 Appointment changes

- Add `payment Payment?` back-relation (one active payment per appointment; the
  `Payment` table keeps history if a hold expires and the client retries).
- Add a **payment hold** state so a slot is reserved while the client pays
  without being treated as a finalized booking:
  - Add `PENDING_PAYMENT` to `AppointmentStatus`, plus
    `holdExpiresAt DateTime?` on `Appointment`.
  - Semantics: when payment is required, the appointment is created
    `PENDING_PAYMENT` with `holdExpiresAt = now + N minutes`. On
    `payment_intent.succeeded` it becomes `CONFIRMED` (immediate-book flow) or
    `PENDING` (admin-approval/propose flow). On payment failure or hold expiry it
    becomes `CANCELLED` (or is deleted by the sweeper, §6).

### 1.4 Availability / overlap must count active holds as busy

**Critical race fix.** Today `getAvailableSlots` and the booking conflict checks
treat only `status = CONFIRMED` as busy (`availability.ts`, `appointments`
POST). Once money is involved, two clients must not be able to pay for the same
slot. Update every busy-set query to also include **unexpired `PENDING_PAYMENT`**
appointments:

```
status IN ('CONFIRMED', 'PENDING_PAYMENT')
AND (status = 'CONFIRMED' OR holdExpiresAt > now())
```

This extends the existing Serializable overlap pattern in
`approveAppointment` and the public booking handlers.

---

## 2. Stripe Connect onboarding

### 2.1 Connect an account (admin)

- New admin action "Connect Stripe": server creates a Connect **Express** account
  for the salon (`stripe.accounts.create({ type: 'express', ... })` if no
  `stripeAccountId`), stores `stripeAccountId`, then creates an **Account Link**
  (`stripe.accountLinks.create`) and redirects the admin to Stripe-hosted
  onboarding. `refresh_url` / `return_url` point back to the admin settings page.
- On return, the admin sees onboarding status. The authoritative status comes
  from the `account.updated` webhook (§5), not the redirect — the redirect only
  means "they came back," not "they finished."

### 2.2 Account status sync

- `account.updated` webhook updates `stripeChargesEnabled`,
  `stripePayoutsEnabled`, `stripeDetailsSubmitted`, `stripeAccountUpdatedAt`.
- **Payments can only be enabled when `stripeChargesEnabled === true`.** If
  Stripe later disables charges (KYC lapse, dispute threshold), the
  `account.updated` webhook flips it false → the app auto-disables payments and
  surfaces a warning banner in admin.

### 2.3 Express dashboard / payouts

- Give the admin a "View payouts on Stripe" link via
  `stripe.accounts.createLoginLink(accountId)` (Express login link). Payout
  schedule, balances, and bank details live on Stripe's side — don't rebuild
  them.

---

## 3. Admin: enable/disable + payment config

New admin surface (extend `/admin/settings` or a dedicated `/admin/payments`):

- **Connect status** block: not connected → "Connect Stripe" CTA; connected but
  incomplete → "Finish onboarding"; ready → green status + payouts link.
- **Master toggle** `paymentsEnabled` — disabled (greyed) until
  `stripeChargesEnabled`. Turning it off reverts public booking to pay-in-person
  immediately (NONE behavior) without disconnecting Stripe.
- **Payment mode**: NONE / DEPOSIT / FULL.
- **Deposit config** (when DEPOSIT): fixed amount or percent + value. Validate
  against Stripe minimums (see §8) and against `priceCents` (deposit ≤ price).
- Persist via the admin settings route (salon-scoped, `requireAdminSalon`).
- Validation schema lives alongside the existing
  `src/lib/validation/admin*.ts`.

Compute the charge amount centrally:

```ts
// src/lib/domain/payments.ts
function amountForBooking(salon, service): { amountCents, kind } | null {
  if (!salon.paymentsEnabled || salon.paymentMode === 'NONE') return null;
  if (service.priceCents === 0) return null; // free service → no charge
  if (salon.paymentMode === 'FULL') return { amountCents: service.priceCents, kind: 'FULL' };
  // DEPOSIT
  const dep = salon.depositType === 'PERCENT'
    ? Math.round(service.priceCents * (salon.depositPercent! / 100))
    : salon.depositCents!;
  return { amountCents: Math.min(dep, service.priceCents), kind: 'DEPOSIT' };
}
```

Platform fee: `application_fee_amount` computed from a platform-level
`PLATFORM_FEE_PERCENT` (env, §7). Keep the fee policy in one helper so it's
auditable.

---

## 4. Booking flow with payment

### 4.1 Recommended UX: embedded Payment Element

The public booking flow is mobile-first and single-page, so prefer **Stripe
Payment Element** (embedded, stays on-site) over a Checkout redirect. Flow:

1. Client picks service + slot, enters contact info, submits.
2. Server (`POST /api/appointments` or `/propose`): re-validate slot, compute
   `amountForBooking`. If **no charge** → behave exactly as today (create
   CONFIRMED/PENDING, notify). If **charge required**:
   - Create the appointment as `PENDING_PAYMENT` with `holdExpiresAt` (e.g.
     +15 min) — this reserves the slot via the §1.4 busy-set rule.
   - Create a `PaymentIntent` on the salon's connected account
     (`{ amount, currency, application_fee_amount }`, with the `Stripe-Account`
     header) and an idempotency key derived from the appointment id.
   - Persist a `Payment` row (`REQUIRES_PAYMENT`).
   - Return the PI `client_secret` + the appointment id to the client.
3. Client confirms payment with the Payment Element using `client_secret`.
4. **Truth comes from the webhook**, not the client: `payment_intent.succeeded`
   → flip appointment to CONFIRMED (or PENDING for propose), `Payment` →
   SUCCEEDED, clear `holdExpiresAt`, then fire the existing confirmation
   notifications + admin alert. `payment_intent.payment_failed` → `Payment`
   FAILED; the hold is left to expire (client may retry within the window).

> Never confirm a booking based on a client-reported "payment succeeded." The
> client can lie or drop off; the webhook (or a server-side `paymentIntents.
> retrieve`) is authoritative. This is the single most important payment-security
> rule.

Alternative (faster MVP): **Stripe Checkout Session** (`mode: 'payment'`,
`payment_intent_data[application_fee_amount]`, on the connected account). The
hold + `checkout.session.completed`/`payment_intent.succeeded` webhook logic is
the same; only the client UI differs (redirect vs embedded).

### 4.2 Publishable key for Connect

The client-side Payment Element needs the platform **publishable** key plus the
connected account id (`stripe = Stripe(pk, { stripeAccount: acct_xxx })`) for
direct charges. The `acct_xxx` is resolved **server-side from the salon** and
returned with the client secret — never accept it from client input.

### 4.3 The propose / admin-approval flow

For the PENDING-approval flow, the deposit is **captured at request time** (same
as immediate booking) so the slot is genuinely held by money. If the admin
**declines**, auto-refund (§5.3). This avoids chasing payment after approval.
Document this clearly in the booking copy ("your deposit is refunded if we can't
accommodate the request").

### 4.4 Admin-created bookings (`/admin/book`)

Admin booking on a client's behalf **skips online card collection** by default
(the client isn't at a keyboard). Options surfaced to the admin: mark as
pay-in-person, or send a Stripe payment link for the deposit. v1: skip payment,
allow the admin to record it as in-person. Note for later: payment-link sends.

---

## 5. Webhooks (`/api/stripe/webhook`)

Single platform endpoint receiving both account (Connect) and payment events.

- **Signature verification** with `STRIPE_WEBHOOK_SECRET` using the raw request
  body — in Next.js App Router, read `await req.text()` (do NOT parse JSON
  first) and pass to `stripe.webhooks.constructEvent`. This route must be exempt
  from any body parsing.
- Connect events arrive with an `account` field (the connected account). Use it
  to locate the salon.
- **Idempotency**: Stripe retries. Dedupe on `event.id` (a small
  `ProcessedStripeEvent` table or an upsert guard), and make each handler
  idempotent against the `Payment`/`Appointment` current state (e.g. don't
  re-confirm an already-CONFIRMED appointment, don't double-notify).

### 5.1 Events to handle

| Event | Action |
| --- | --- |
| `account.updated` | Sync Connect status fields on `Salon` (§2.2); auto-disable payments if charges disabled. |
| `payment_intent.succeeded` | `Payment` → SUCCEEDED; appointment `PENDING_PAYMENT` → CONFIRMED/PENDING; clear hold; send confirmation + admin alert. |
| `payment_intent.payment_failed` | `Payment` → FAILED; record reason; leave hold to expire. |
| `charge.refunded` | Update `Payment.refundedCents` + status (REFUNDED / PARTIALLY_REFUNDED). Source of truth for refunds whether initiated by us or in Stripe. |
| `charge.dispute.created` | Log + flag the payment + alert admin (disputes hit the salon's account). At least record it. |

### 5.2 Notifications integration

Confirmation/admin notifications move to **after** payment success (driven by the
webhook), not at appointment-create time, for the paid path. The unpaid path
keeps firing at create time as today. `sendNotifications` should also surface the
amount paid in the confirmation copy ("$20 deposit received").

### 5.3 Refunds

- **Auto-refund on timely client cancel**: extend `cancelAppointment`. When a
  CONFIRMED, paid appointment is cancelled and the cancellation is *within the
  allowed window* (the existing `CANCELLATION_WINDOW_HOURS` rule already gates
  client self-cancel), issue `stripe.refunds.create({ payment_intent, ... },
  { stripeAccount })`. Late cancels are already blocked for clients by the
  window; **admin** cancels choose refund-or-keep.
- **No-show / late cancel** → keep the deposit (no refund), per policy.
- **Application fee on refund**: decide platform policy — typically
  `refund_application_fee: true` for full timely refunds (platform gives back its
  cut too), but keep the fee on no-show forfeits. Centralize this rule.
- **Manual refund** from the billing page: admin can issue full/partial refund on
  any SUCCEEDED payment. The `charge.refunded` webhook reconciles the local row.
- Refund issuance must be **idempotent** (guard on `Payment.status` /
  `refundedCents`) so a double-click or webhook replay doesn't double-refund.

---

## 6. Hold expiry sweeper

Unpaid `PENDING_PAYMENT` holds must be released so slots don't stay locked.

- Extend the existing Vercel Cron (or add a job) to cancel appointments where
  `status = 'PENDING_PAYMENT' AND holdExpiresAt < now()`, and cancel the
  corresponding `PaymentIntent` (`paymentIntents.cancel`, best-effort) +
  mark `Payment` CANCELED.
- This is cheap and global (cross-salon) like the reminders sweep. The §1.4
  busy-set rule already ignores expired holds for availability, so an
  un-swept hold doesn't block bookings — the sweeper is just cleanup +
  PI cancellation hygiene.

---

## 7. Config / env (`src/lib/env.ts`)

Add **platform-level** Stripe vars (Connect = one platform account, many
connected accounts — these stay singular):

- `STRIPE_SECRET_KEY` — required in prod (platform secret key).
- `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` — required in prod (client Payment
  Element). Note: `NEXT_PUBLIC_` → build-time inlined, fine (it's a single
  platform key, not per-salon).
- `STRIPE_WEBHOOK_SECRET` — required in prod (signature verification).
- `PLATFORM_FEE_PERCENT` (or `_BPS`) — platform application-fee rate. Required if
  the platform takes a fee.
- Add these to `baseSchema` + `collectProdProblems`, following the existing
  pattern (optional at schema level, enforced in prod). Per-salon Stripe data
  (`stripeAccountId`, payment mode, deposit) lives in the DB, not env.

Add the `stripe` SDK dependency. Initialize one shared platform client
(`new Stripe(STRIPE_SECRET_KEY)`); pass `{ stripeAccount }` per call for
connected-account operations.

---

## 8. Money, currency & Stripe constraints

- All amounts are integer **cents**, consistent with `Service.priceCents`.
- **Currency is per salon** (`Salon.currency`), tied to the connected account's
  country. Default `usd`. Don't mix currencies within a salon.
- **Stripe minimum charge** (~$0.50 USD equivalent): validate deposit/price meet
  it before creating a PI; if a computed deposit is below the minimum, either
  bump to the minimum or fall back to no-charge — decide and document.
- **Statement descriptor**: with direct charges it's the salon's account default;
  optionally set a per-charge `statement_descriptor_suffix` with the salon name.
- Rounding: percent deposits use `Math.round`; never produce fractional cents.

---

## 9. Admin billing dashboard (`/admin/billing`)

Salon-scoped revenue reporting from local `Payment` rows (fast, queryable),
reconciled with Stripe via webhooks — **do not** compute the page live from the
Stripe API (slow, rate-limited; use it only for the payouts/balance widget).

Contents:

- **Summary cards**: gross revenue, refunds, net, and platform fees for a
  selected range (today / 7d / 30d / month / custom). Net = succeeded −
  refunded − platform fee − (optionally) Stripe processing fees.
- **Per-service breakdown**: revenue grouped by service.
- **Payments table**: client, service, amount, status, date, refunded amount,
  with a manual-refund action (§5.3) and a deep link to the payment on Stripe.
- **Payouts widget**: Connect balance + next payout (via Stripe API or just the
  Express login link from §2.3).
- **Connect health**: charges/payouts enabled status; warning if disabled.

All queries filter by `salonId` (`requireAdminSalon`). Gross vs net must be
explicit so the salon isn't confused about Stripe fees and the platform cut.

Mobile admin app: a read-only revenue summary is a reasonable phase-2 add (the
access token already carries `salonId`); refunds can stay web-only initially.

---

## 10. Security checklist

- **Webhook signature verification** on raw body; reject unverified events.
- **Never trust client-reported payment status** — confirm via webhook/retrieve.
- **`stripeAccountId` is always resolved server-side from the salon**, never from
  request input (same rule as `salonId`: body/query is forbidden as a source).
- **All `Payment` queries scoped by `salonId`**; a billing page or refund action
  must never touch another salon's payment (re-check `{ id, salonId }`).
- **Idempotency keys** on PI creation and refunds; idempotent webhook handlers.
- **Don't log** full PANs/secrets; Stripe handles card data (PCI scope stays low
  with Payment Element / Checkout — never let card numbers touch our server).
- Refund/charge amounts validated server-side against the appointment's recorded
  `Payment.amountCents`.

---

## 11. Testing

- **Stripe test mode** end-to-end with test cards (success, decline, 3DS
  required).
- **Webhook handler**: signature failure rejected; valid events processed;
  duplicate `event.id` is a no-op (idempotency).
- **Double-booking under hold**: two clients can't both pay for one slot —
  `PENDING_PAYMENT` holds block availability/overlap (§1.4).
- **Hold expiry**: unpaid hold released by the sweeper; expired hold doesn't
  block availability.
- **Refund logic**: timely client cancel auto-refunds; late cancel/no-show keeps
  the deposit; manual partial refund reconciles via `charge.refunded`; refunds
  are idempotent.
- **Config gating**: payments can't be enabled until `stripeChargesEnabled`;
  disabling reverts to pay-in-person; free service skips payment; deposit below
  Stripe minimum handled.
- **Connect status**: `account.updated` flipping charges off auto-disables
  payments.
- **Cross-tenant isolation**: salon A admin can't see/refund salon B payments;
  PI created on the correct connected account.
- **Amount math**: percent vs fixed deposit, rounding, deposit ≤ price.
- Use Stripe **test clocks** for cancellation-window/refund-timing tests.

---

## 12. Suggested rollout phases

1. **Schema** — `Salon` Connect + payment-config fields, `Payment` model,
   `PENDING_PAYMENT` status + `holdExpiresAt`, busy-set rule (§1.4). Ship inert
   (no payments enabled). ✅ **Done** — see "Feature flag & rollout status" above.
2. **Connect onboarding** — create account, Account Links, `account.updated`
   webhook, status display in admin. No charges yet.
3. **Admin config** — payments toggle + mode + deposit config + `amountForBooking`
   helper, gated on charges-enabled.
4. **Booking + payment** — Payment Element flow, PI creation on connected
   account, `payment_intent.*` webhooks, hold + confirmation-on-success,
   notifications moved post-payment. The behavior-visible launch.
5. **Refunds + sweeper** — auto-refund on timely cancel, manual refund, hold
   expiry job, `charge.refunded`/`dispute` handling.
6. **Billing dashboard** — revenue reporting + payouts widget + refund UI.
7. **Hardening** — full test matrix, dispute handling, mobile revenue view.

Phase 1 is safe to ship behind the disabled toggle. The client-visible cutover is
phase 4.

---

## Appendix — highest-risk items (verify these first)

- **Confirm bookings from the webhook, not the client** — the cardinal payment
  rule. A client that drops off after paying must still get a confirmed booking;
  a client that fakes success must not.
- **Holds must block availability (§1.4)** — without counting unexpired
  `PENDING_PAYMENT` as busy, two clients can pay for the same slot.
- **Webhook raw-body signature** — App Router will happily parse the body and
  break verification; read `req.text()` and exempt the route.
- **Webhook idempotency** — Stripe retries; non-idempotent handlers double-book,
  double-notify, or double-refund.
- **`stripeAccountId` server-resolved only** — never from request input.
- **Auto-disable on `account.updated`** — a salon whose Connect account loses
  `charges_enabled` must stop attempting charges immediately.
- **Stripe minimum charge** — sub-minimum deposits fail at PI creation; validate
  up front.
- **Refund idempotency + application-fee policy** — don't double-refund; decide
  whether the platform fee is returned on refunds vs forfeits.
