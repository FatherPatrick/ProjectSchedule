# Multi-Tenant Refactor — Implementation Spec

Convert the app from a single nail studio to a SaaS platform hosting **many
salons**, each with its own admins, services, hours, clients, and bookings.

## Decisions (locked)

| Decision | Choice | Implication |
| --- | --- | --- |
| Tenant addressing | **Subdomain per salon** (`polished.app.com`) | Wildcard DNS + cert; middleware resolves tenant from `Host`. |
| Admin ↔ salon | **One admin → one salon** | `User`/`AdminPhone` carry a single `salonId`; no membership join table or switcher. |
| Sender identity | **Shared platform sender** | One verified Resend domain + one Twilio number for all salons; salon name lives in the message body. |
| Onboarding | **Self-serve signup** | Public flow provisions salon + first admin + default config. |

## ⚠️ Open decisions — confirm before implementing

These were deliberately left open in this spec. **Resolve each with the project
owner before writing code for the affected phase** — do not silently pick a
default.

- [ ] **Slug → salonId resolution under the Edge/Prisma constraint** (§2.1):
  middleware runs on the Edge runtime where the standard Prisma client can't go.
  Pick one: force the proxy to the Node runtime, use an edge-compatible lookup
  (e.g. Accelerate/HTTP), or keep the proxy host-parsing only and resolve the
  salon (cached) in server components/route handlers. *Recommendation:* resolve
  downstream, proxy only parses host.
- [ ] **Slug mutability** (§1.5): immutable after creation (v1 recommended) vs a
  `SalonSlugAlias` history table + 301 redirects.
- [ ] **Salon offboarding** (§1.4): hard `onDelete: Cascade` vs soft-delete via
  `SalonStatus.SUSPENDED` for churned salons (recommend soft-delete for real
  salons, cascade only for abandoned signups / GDPR).
- [ ] **Local-dev subdomains** (§2.2): rely on `*.localhost` vs a dev-only
  `?salon=<slug>` override (and how that interacts with the LAN `dev:mobile`
  flow).
- [ ] **Reserved subdomains** (§2.1): finalize the blocklist (`www`, `app`,
  `api`, `admin`, `signup`, `assets`, …) before signup goes live.

## Guiding principle

Introduce a `Salon` row that **every** tenant-owned record points to, then make
the `salonId` non-optional and **derived from request context, never from
client input**. The two contexts that resolve a salon:

1. **Public/booking requests** → from the subdomain (`Host` header).
2. **Authenticated admin requests** → from the signed-in admin's `salonId`
   (carried in the JWT/session and mobile access token), independent of host.

A request must never trust a `salonId` in a JSON body or query param — that is
the cross-tenant data-leak hole. The two trusted sources above are the only
ones.

---

## 1. Data model changes (`prisma/schema.prisma`)

### 1.1 New model

```prisma
model Salon {
  id          String   @id @default(cuid())
  /// URL subdomain, e.g. "polished" in polished.app.com. Lowercase, unique.
  slug        String   @unique
  name        String
  timezone    String   @default("America/Los_Angeles")
  /// Public-facing knobs that were previously env/config constants.
  instagram   String?
  /// Branding
  themeColor  String   @default("#fdf2f8")
  /// Lifecycle: lets self-serve signups exist before they're paid/active.
  status      SalonStatus @default(ACTIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  services      Service[]
  clients       Client[]
  appointments  Appointment[]
  blackouts     Blackout[]
  businessHours BusinessHours[]
  hoursSchedule BusinessHoursSchedule[]
  setting       Setting?
  admins        User[]
  adminPhones   AdminPhone[]

  @@index([status])
}

enum SalonStatus {
  ACTIVE
  SUSPENDED
  PENDING
}
```

### 1.2 Add `salonId` to every tenant-owned model

Add `salonId String` + relation + index to: **Service, Client, Appointment,
Blackout, BusinessHours, BusinessHoursSchedule, Setting, AdminPhone, User**
(for admins).

Specific constraint changes (these are the easy-to-miss ones):

- **`BusinessHours`** — the `@@unique` on `dayOfWeek` becomes
  `@@unique([salonId, dayOfWeek])`. Same single-row-per-day rule, but per salon.
- **`BusinessHoursSchedule`** — `@@unique([effectiveFrom, dayOfWeek])` →
  `@@unique([salonId, effectiveFrom, dayOfWeek])`.
- **`Setting`** — currently a hardcoded singleton with `id: "default"`. Switch
  to one row per salon: `salonId String @unique` (drop the `"default"` id
  convention entirely). See §4.3.
- **`AdminPhone`** — PK is currently `phone`. A phone might (rarely) admin two
  salons in future, but per our "one admin → one salon" decision the PK becomes
  composite: `@@id([salonId, phone])`. The env-bootstrap allow-list goes away
  (see §3.2).
- **`Client`** — `@@index([email])` / `@@index([phone])` become
  `@@index([salonId, email])` / `@@index([salonId, phone])`. The same person
  booking at two salons is **two `Client` rows** — clients are not shared.
- **`Appointment`** — add `@@index([salonId, startsAt])` and update the cron
  index to `@@index([salonId, status, reminderSentAt, startsAt])`. The overlap
  check (the double-booking guard) MUST filter by `salonId` — this is the single
  highest-risk query in the app.
- **`User`** — admins get `salonId String?` (nullable: a future super-admin /
  platform operator has no salon). Clients created via NextAuth stay null.

### 1.3 Uniqueness that is no longer global

- `User.email` is `@unique` today and the SMS-OTP flow synthesizes
  `<digits>@phone.local`. That stays globally unique (it's per-person, not
  per-salon), so no change — but see §3.1 for the signup collision when the same
  phone tries to admin a second salon (rejected under our model).
- **`User` is effectively the admin table.** The only code path that creates a
  `User` is `auth.ts` `authorize()` (admin SMS-OTP). Public bookings create
  `Client` rows, never `User`s. The `Role.CLIENT` default and `Client.userId`
  relation are vestigial (no client login exists). So `User.salonId` is, in
  practice, "the admin's salon"; keep it nullable only to leave room for a
  future platform super-admin (§12).

### 1.4 Referential actions (salon offboarding)

A churned/deleted salon must not orphan rows. Decide per relation, but the
straightforward default: every `Salon`→child relation gets
`onDelete: Cascade` (Service, Client, Appointment, Blackout, BusinessHours,
BusinessHoursSchedule, Setting, AdminPhone, and admin `User`s). Note existing
intra-tenant actions stay: `Appointment.client` is already `Cascade`,
`Appointment.service` has no explicit action (Prisma default `Restrict`) — keep
that so you can't delete a service with live appointments. Prefer **soft-delete**
(`SalonStatus.SUSPENDED`) over hard delete for real salons; reserve cascade for
abandoned signups and GDPR erasure.

### 1.5 Slug is identity — treat changes carefully

The slug appears in every booking/management link and confirmation email. If a
salon renames its slug, old links (`<old-slug>.app.com/appointments/<token>`)
break. Options: (a) make slug immutable after creation (simplest, recommended);
(b) keep a `SalonSlugAlias` history table and 301-redirect old → current in the
proxy. Pick (a) for v1 and document it.

---

## 2. Tenant resolution & routing (subdomains)

### 2.1 Middleware lives in the existing `src/proxy.ts` — NOT a new `middleware.ts`

This project is on **Next.js 16**, which renamed the middleware entrypoint from
`middleware.ts`/`middleware()` to **`proxy.ts`/`proxy()`**. The file already
exists (`src/proxy.ts`) and today only adds CORS headers, with a matcher scoped
to `/api/admin/:path*` and `/api/auth/mobile/:path*`. Do **not** create a second
middleware file — Next allows only one, and a stray `middleware.ts` alongside
`proxy.ts` is an error.

Changes to `src/proxy.ts`:

- **Broaden the matcher** to run on all routes that need a tenant
  (`/`, `/book`, `/appointments/:path*`, `/auth/:path*`, public `/api/*`),
  while keeping the existing CORS behavior for the admin/mobile API paths. Use a
  matcher that excludes Next internals (`/_next`, static assets, favicon).
- Parse the `Host` header → extract subdomain → strip the apex
  (`app.com`, plus `localhost:3000` for dev).
- Reserved subdomains that are **not** tenants: `www`, `app`, `api`, `admin`,
  `signup`, `assets`. Route these to platform/marketing pages.
- Resolve `slug → salonId` (cached; see §2.3). On miss → render a 404 "salon not
  found" page. **Caveat:** middleware runs on the Edge runtime by default and
  Prisma's standard client cannot run there — either resolve the slug via a
  lightweight fetch/Edge-compatible lookup, force this proxy to the Node runtime,
  or keep the proxy doing only host parsing and resolve `slug → salonId` in the
  server components/route handlers (cached). Decide this explicitly; it's a
  common Next.js footgun.
- Attach the resolved tenant via a request header (`x-salon-slug`, and
  `x-salon-id` if resolved here) that server components / route handlers read.
  Middleware cannot pass objects, so pass the slug/id and re-fetch (cached)
  downstream.

### 2.2 Local development

Subdomains on `localhost` work in modern browsers via
`polished.localhost:3000`. Document this in the README. The `dev:mobile` LAN-IP
flow needs a story — simplest is a `?salon=<slug>` dev-only override gated
behind `NODE_ENV !== "production"` (never enabled in prod, since query-param
salon is the leak vector we're avoiding).

### 2.3 Tenant cache

`slug → {id, name, timezone, themeColor, status}` is read on essentially every
request. Cache it (in-memory LRU with short TTL, or `unstable_cache`). Invalidate
on salon update. Suspended/pending salons short-circuit to a status page.

### 2.4 Route tree changes

Public routes stay path-identical (`/`, `/book`, `/appointments/[token]`,
policy pages) — the **subdomain** is the tenant, not the path. Admin routes
(`/admin/*`) likewise stay path-identical and resolve the salon from the signed-in
admin, not the host (an admin on the wrong subdomain is redirected to their own).

New platform routes live on the apex/`app` host:

- `app.com/` — marketing/landing
- `app.com/signup` — self-serve salon creation (§5)
- `app.com/...` — (future) billing, super-admin

---

## 3. Auth & authorization changes

### 3.1 Session carries `salonId`

- `src/auth.ts` `authorize()`: after verifying the OTP and confirming the phone
  is an admin **of the host's salon**, load that `AdminPhone` row → its
  `salonId`. Put `salonId` on the returned user, into the JWT (`token.salonId`)
  and the session (`session.user.salonId`). Update `src/types/next-auth.d.ts`
  (the `Session["user"]` and JWT augmentations).
  - `authorize()` must know the host. In NextAuth v5 read it via `headers()`
    from `next/headers` inside `authorize`, or pass the resolved slug as a hidden
    credential field from `SignInForm`. Prefer `headers()` — a credential field
    is client-supplied and must be treated as untrusted (re-resolve it
    server-side regardless).
  - The same phone may have an `AdminPhone` row under more than one salon (the
    composite PK allows it). Host disambiguates which salon they're signing into.
- **Sign-in OTP is currently global and must become host-scoped.**
  `src/app/api/auth/otp/request/route.ts` calls `isAdminPhone(e164)` with no
  salon. It must resolve `salonId` from the request host and call
  `isAdminPhone(salonId, e164)`. Preserve the existing "don't reveal whether a
  phone is an admin" behavior — but now per salon (a phone that admins salon B
  must look identical to a non-admin when probed on salon A's subdomain).
- Mobile access token (`src/lib/auth/mobileTokens.ts`): add `salonId` to the
  signed payload so `requireAdminFromBearer` returns it without an extra query.

### 3.1a Cookie & host trust (do not get this wrong)

Admin-session isolation between salons depends on cookie scope:

- `src/auth.ts` uses NextAuth's **default cookies**, which are **host-only** (no
  `Domain` attribute). That means a session cookie set on `salon-a.app.com` is
  **not** sent to `salon-b.app.com` — admin sessions are naturally
  subdomain-isolated. **Keep it this way. Do NOT set a wildcard cookie
  `domain: ".app.com"`** — that would share one admin session across every
  salon and is a direct cross-tenant escalation.
- Because host-only cookies guarantee host == session-salon for web admins, add
  a **defense-in-depth assertion**: if `session.user.salonId` doesn't match the
  host's resolved salon, treat as unauthenticated (redirect to that admin's own
  subdomain). This also gives a clean UX when an admin follows a stale link to
  the wrong subdomain.
- NextAuth serves many hosts now, so set **`trustHost: true`** (or
  `AUTH_TRUST_HOST=true`) and stop relying on a single `NEXTAUTH_URL`/`AUTH_URL`.
  Verify callback-URL handling works per subdomain.
- CORS (`src/lib/cors.ts`, consumed by `proxy.ts`) currently allows the mobile
  app's origins. Re-check it against per-salon subdomains — the mobile app is
  admin-only and host-agnostic (it resolves salon from the bearer token), so it
  should hit a stable API host rather than per-salon subdomains (see §9).

### 3.2 Admin allow-list goes DB-only, per salon

`src/lib/auth/admin.ts` today blends an `ADMIN_PHONES` env bootstrap with the
`AdminPhone` table. Multi-tenant kills the env list (it's inherently global).

- Remove `ENV_ADMIN_PHONES` and the env-source branch.
- All allow-list functions gain a `salonId` parameter:
  `isAdminPhone(salonId, phone)`, `listAdminPhones(salonId)`,
  `addAdminPhone(salonId, phone, addedById)`,
  `getNotifiableAdminPhones(salonId)`, etc.
- First admin is created during signup (§5), not via env.
- `requireAdmin()` / `assertAdmin()` / `requireAdminEither()` now also return /
  assert the `salonId`. Every admin route reads `salonId` from here.

### 3.3 Cross-tenant guard helper

Add one helper used by all admin routes:

```ts
// Returns { salonId } for the signed-in admin, or null (→ 401).
// Route handlers then pass salonId into every query. A record fetched by id
// must additionally be re-checked: `where: { id, salonId }`.
async function requireAdminSalon(req): Promise<{ salonId: string; userId: string } | null>
```

Any single-record route (`/admin/services/[id]`, `/admin/appointments/[id]/*`,
`/admin/blackouts/[id]`, `/admin/hours/schedule/[effectiveFrom]`) must scope the
mutation by `{ id, salonId }` (use `updateMany`/`deleteMany` with a count check,
since Prisma's `update`-by-id can't take a compound filter) so admin A cannot
touch salon B's row by guessing an id.

---

## 4. Query scoping (the bulk of the work)

Every Prisma call listed below gains a `salonId`. Source of `salonId`: **host**
for public routes, **session** for admin routes.

### 4.1 Domain layer (thread `salonId` as a parameter)

- `getAvailableSlots({ salonId, serviceId, dateKey })` — scope the Service
  lookup, the confirmed-appointment query, the blackout query, and
  `getEffectiveHoursForDate`.
- `getEffectiveHoursForDate({ salonId, dateKey, dayOfWeek })` — scope both the
  schedule-override and base-hours lookups.
- `getSettings(salonId)` / `updateSettings(salonId, patch)` — see §4.3.
- `approveAppointment(salonId, id)` / `cancelAppointment(salonId, id, opts)` —
  scope the fetch, the **overlap check**, and the update.
- `findClientIdByEmail(salonId, email)`.

### 4.2 Route handlers

Add `salonId` to the query inventory below (all currently global):

- **Public**: `/api/availability` (GET), `/api/appointments` (POST),
  `/api/appointments/propose` (POST), `/api/appointments/[token]/cancel` (POST)
  — `salonId` from host. The management-token lookup must also verify the appt
  belongs to the host's salon (`where: { managementToken, salonId }`) so a token
  can't be used on the wrong subdomain.
- **Admin**: every `/api/admin/*` route — `salonId` from session
  (`requireAdminSalon`). Covers appointments (list/create/approve/cancel/
  clear-cancelled), services (CRUD/reorder), blackouts (CRUD), hours (GET/PUT),
  hours/schedule (GET/POST/DELETE), clients (search), settings (GET/PUT),
  admins (list/add/remove), push register/unregister.
- **Server components**: `src/app/page.tsx`, `src/app/book/page.tsx`, and all
  `/admin/*` pages fetch their data scoped to the resolved salon.

### 4.3 Settings singleton → per-salon row

`getSettings()` currently upserts a fixed `id: "default"` row. Rewrite to upsert
keyed on `salonId` (unique). Defaults (`slotGranularityMin`,
`maxAdvanceDays`, `allowStartAtClose`) are seeded at signup. Same for
`BusinessHours` — seed the 7 default-hours rows (from `DEFAULT_BUSINESS_HOURS`)
per salon at signup, not globally.

### 4.4 Config constants → salon fields

`src/lib/config.ts` constants become per-salon DB fields, resolved from the
tenant context instead of env:

- `BUSINESS_NAME` → `salon.name`
- `BUSINESS_TIMEZONE` → `salon.timezone`
- `APP_URL` → derived from `salon.slug` (`https://<slug>.app.com`); used in
  management/cancel links and notification copy.
- `instagram` handle (hardcoded `@virgonailz` in notifications) → `salon.instagram`.
- `CANCELLATION_WINDOW_HOURS` / `DEFAULT_BUSINESS_HOURS` can stay platform-wide
  defaults for now (move to `Salon` later if salons need to customize).

**Timezone is the subtle one**: `src/lib/timezone.ts` reads
`BUSINESS_TIMEZONE` at module load. Every function (`formatBiz`,
`bizWallClockToUTC`, `bizDayOfWeek`, `bizDateKey`) must take a `timezone`
argument resolved from the salon. This ripples into availability, booking
confirmation labels, and the admin calendar — touch every caller.

**The `NEXT_PUBLIC_` trap**: `BUSINESS_NAME` and `BUSINESS_TIMEZONE` come from
`NEXT_PUBLIC_*` env, which Next.js **inlines into the client bundle at build
time** — a single global value. Multi-tenant values are per-request and live in
the DB, which client components cannot read. So any **client component** that
imports `BUSINESS_NAME`/`BUSINESS_TIMEZONE` from `lib/config` must instead
receive the salon's name/timezone as **props from a server component** (or via a
React context provider seeded at the layout level). Audit every client-side
import of `lib/config` during the refactor — these will compile fine but render
the wrong (build-time default) salon until converted.

### 4.5 Rendering / caching must be per-tenant

- Public pages (`/`, `/book`, policy pages) must render **per host**. Reading the
  `Host` header (or any `headers()`) opts a route into dynamic rendering, which
  is what we want — but verify none of these pages are statically prerendered or
  ISR-cached across hosts, or salon A's page will be served to salon B. Set
  `export const dynamic = "force-dynamic"` (or rely on the header read) and avoid
  caching keyed without the salon.
- `generateMetadata` (title, description, theme color, favicon) must be dynamic
  per salon — currently driven by `BUSINESS_NAME` in `layout.tsx`.
- Any `unstable_cache` / `fetch` cache keys you introduce for tenant data must
  include `salonId` in the cache key/tags, or you get cross-tenant cache bleed.

### 4.6 Rate-limit buckets

`src/lib/rateLimit.ts` keys buckets by IP globally. Booking and OTP limits
should include `salonId` in the bucket (e.g. `appointments:create:ip:<salonId>`)
so one busy salon doesn't exhaust another's limit and so abuse is attributable
per tenant. The OTP-by-phone bucket can stay global (it protects a phone number,
which is salon-independent).

---

## 5. Self-serve signup (`app.com/signup`)

New public flow on the apex host. In one transaction:

1. Validate desired `slug` (unique, lowercase, reserved-word check, length).
2. Create `Salon` (status `ACTIVE` or `PENDING` if you gate on billing later).
3. Seed defaults: 7 `BusinessHours` rows, a `Setting` row, optionally sample
   `Service` rows.
4. Capture the founder's admin phone → create the first `AdminPhone`
   (`salonId`, `phone`, `createdById: null`).
5. Send OTP and complete sign-in → they land on `<slug>.app.com/admin`.

Validation/abuse concerns: rate-limit signup by IP (reuse `src/lib/rateLimit.ts`),
captcha (Turnstile is already wired), and verify the phone via the existing
Twilio Verify flow before the salon is fully provisioned. Billing/subscription
is out of scope for this spec (the `SalonStatus` enum leaves room for it).

---

## 6. Integrations / notifications (shared sender)

Sender identity stays shared, so no per-salon Resend/Twilio provisioning. The
work is **parameterizing the message content** by salon:

- `src/lib/integrations/notifications.ts`: `sendNotifications` loads the
  appointment **with its salon** and uses `salon.name`, `salon.instagram`, and
  the salon's `APP_URL` for links. Remove hardcoded `@virgonailz` and the
  embedded studio-specific policy copy → pull from salon fields (or keep generic
  platform copy initially).
- `src/lib/integrations/adminSms.ts`: `notifyAdminsOfBooking` takes `salonId`,
  calls `getNotifiableAdminPhones(salonId)`, and labels the alert with
  `salon.name`.
- `src/lib/integrations/push.ts`: the "notify all admins" query joins on
  `User.salonId` so a push goes only to that salon's admins, not every admin on
  the platform. **This is a real leak today** — without the filter, every
  salon's admins would get every salon's push notifications.
- `email.ts` / `sms.ts` / `verify.ts` / `captcha.ts`: no change (they already
  take an explicit recipient; the shared `EMAIL_FROM` / Twilio number is fine).
- `src/lib/env.ts`: this file's `baseSchema` and `collectProdProblems` are the
  single source of env truth. Specifically:
  - **Drop** `ADMIN_PHONES` (schema line ~60 and the prod requirement at
    ~116–118), `NEXT_PUBLIC_BUSINESS_NAME` (~56), `NEXT_PUBLIC_BUSINESS_TIMEZONE`
    (~57). These are now per-salon DB data.
  - **Repurpose** `NEXT_PUBLIC_APP_URL`: it's used to build management/cancel
    links and is required in prod (~112–114). Replace with a new platform var
    like `NEXT_PUBLIC_APP_BASE_DOMAIN` (e.g. `app.com`) so per-salon URLs can be
    constructed as `https://<slug>.<base-domain>`. Update `collectProdProblems`
    accordingly.
  - **Keep** the platform-wide secrets unchanged: `DATABASE_URL`,
    `AUTH_SECRET`/`NEXTAUTH_SECRET`, `MOBILE_TOKEN_SECRET`, `RESEND_API_KEY`,
    `EMAIL_FROM`, all Twilio creds, `TWILIO_VERIFY_SERVICE_SID`, `CRON_SECRET`,
    Turnstile keys. Shared sender means these stay singular.
  - Update `src/app/auth/sign-in` dev-hint copy and any tests referencing
    `ADMIN_PHONES` (the sign-in page text and `_resetEnvCacheForTests` callers).

---

## 7. Cron (`/api/cron/reminders`)

The reminder query is global today — that's actually **fine and preferred**: one
cron pass should sweep all salons' due appointments in a single query, then
`sendNotifications` resolves each appointment's salon for the copy. Only change:
ensure the query selects across all salons (no `salonId` filter needed here) and
that the per-appointment notification path is salon-aware (§6). Confirm the
compound index covers the now-larger cross-salon table.

---

## 8. Data migration / backfill

The existing production data is one real salon. Migration steps:

1. Add `Salon` table + nullable `salonId` columns (non-breaking).
2. Backfill: create one `Salon` row from the current env config
   (`NEXT_PUBLIC_BUSINESS_NAME`, timezone, a chosen slug). Set every existing
   row's `salonId` to that salon. Migrate the current `Setting "default"` row
   and the env `ADMIN_PHONES` into `AdminPhone` rows for that salon.
3. Make `salonId` non-nullable + add the new unique constraints/indexes.
4. Drop the `Setting.id = "default"` convention.

Write this as a Prisma migration + a one-off backfill script
(`prisma/migrations` + a `scripts/backfill-salon.ts`). Test against a copy of
prod before running.

---

## 9. Mobile app

- The Expo admin app must know which salon it's signed into — but since the
  access token now carries `salonId`, the app needs no salon picker (one admin →
  one salon). Confirm the login response surfaces salon name for display.
- `EXPO_PUBLIC_API_BASE_URL` currently points at one backend host. With
  subdomains, mobile sign-in must target the salon's subdomain (or the apex with
  the salon resolved from the admin's token post-auth). Decide: simplest is the
  app hits the apex API and the server resolves salon from the bearer token —
  meaning admin API routes resolve `salonId` from session/token, **not** host
  (already the plan in §3). Public/booking is the only host-resolved path, and
  the mobile app is admin-only, so the mobile flow is unaffected by subdomains.

---

## 10. Testing

- **Cross-tenant isolation tests** (highest priority): seed two salons; assert
  salon A's admin cannot read/mutate salon B's services, appointments, hours,
  clients, or admins via any route (id-guessing on `[id]` routes especially).
- **Overlap/double-booking**: two salons can hold appointments at the same
  wall-clock time without conflicting; within one salon the guard still fires.
- **Tenant resolution**: unknown subdomain → 404; reserved subdomain → platform
  page; suspended salon → status page.
- **Timezone**: two salons in different timezones produce correct slots/labels.
- **Signup**: slug collision, reserved slug, rate limit, captcha, first-admin
  creation.
- The existing route-handler test suite must be updated to pass `salonId`; this
  is also the moment to revisit the Testcontainers real-DB integration tests
  noted in TODO.md, since constraint changes (compound uniques) won't be
  exercised by mocks.

---

## 11. Suggested rollout phases

1. **Schema + backfill** — `Salon` model, nullable FKs, backfill the one
   existing salon, then enforce non-null. App still behaves single-tenant.
2. **Query scoping** — thread `salonId` through the domain layer and all routes,
   sourced from a hardcoded/default salon initially. No behavior change yet.
3. **Tenant resolution** — middleware + subdomain routing + tenant cache; switch
   the salon source from "the one salon" to host/session.
4. **Auth per-salon** — move allow-list to DB-only, put `salonId` in session +
   mobile token, add cross-tenant guards.
5. **Notifications + config** — parameterize copy/branding/timezone by salon;
   fix the push-notification leak.
6. **Self-serve signup** — the public provisioning flow.
7. **Hardening** — isolation test suite, suspended-salon handling, docs.

Phases 1–2 are safely shippable behind the existing single salon. The
behavior-visible cutover is phase 3.

---

## 12. Platform operations (acknowledged gap)

Self-serve signup creates salons, but you still need to *manage* them. Out of
scope to fully spec here, but flagged so it isn't forgotten:

- A **super-admin** surface (apex host) to list salons, suspend/reactivate
  (`SalonStatus`), and handle abuse/non-payment. `User.salonId = null` +
  a `Role.SUPERADMIN` (new enum value) is the natural model.
- **Suspended-salon UX**: the proxy must short-circuit `SUSPENDED`/`PENDING`
  salons to a status page for both public and admin surfaces.
- **Billing/subscription** is explicitly deferred; `SalonStatus.PENDING` is the
  hook for gating activation on payment later.
- **Per-salon data export / deletion** (GDPR): cascade rules in §1.4 enable it;
  a self-serve export/delete tool is future work.

---

## Appendix — highest-risk items (verify these first)

- **Middleware location**: the entrypoint is `src/proxy.ts` (Next 16), not
  `middleware.ts`. Extend it; don't add a second middleware file. Watch the
  Edge-runtime + Prisma limitation (§2.1).
- **Cookie domain**: keep NextAuth cookies host-only. A wildcard
  `domain: ".app.com"` shares one admin session across every salon — direct
  cross-tenant escalation (§3.1a). Set `trustHost: true`.
- **Push notifications** (`push.ts`) leak across salons until the `User.salonId`
  filter is added.
- **Appointment overlap check** must include `salonId` or salons block each
  other's bookings (and the cross-salon table makes accidental conflicts more
  likely).
- **`[id]` admin routes** must scope mutations by `{ id, salonId }` (via
  `updateMany`/`deleteMany` + count check) — id-guessing is the classic
  multi-tenant IDOR.
- **`salonId` from request body/query is forbidden** — only host (public) or
  session/token (admin) may determine the tenant.
- **OTP sign-in** (`isAdminPhone`) is global today — must become host-scoped, or
  any admin can sign in on any salon's subdomain (§3.1).
- **Timezone is resolved at module load today** — every `timezone.ts` caller
  changes; easy to miss and silently wrong.
- **`NEXT_PUBLIC_` business config** is build-time-inlined — client components
  rendering salon name/timezone will silently show the default until converted
  to props (§4.4).
- **Per-tenant rendering**: don't let a public page get statically cached across
  hosts (§4.5).
