# Nail Appointment Scheduling

Mobile-first appointment booking site for a single nail studio.
Built with **Next.js 16 + TypeScript + Tailwind**, **Prisma + Postgres**,
**Auth.js** for login, **Resend** for email, and **Twilio** for SMS.

See [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) for the full plan and decisions.

## Features

- Public booking flow: choose a service → pick a date/time on a mobile-friendly
  calendar → enter contact info → confirmed.
- Email + SMS confirmation on booking.
- 24-hour reminders via email + SMS (Vercel Cron, hourly check).
- Self-service cancellation up to 24 hours before the appointment via a
  unique link sent in the confirmation.
- Admin dashboard at `/admin` (magic-link sign-in) with:
  - Upcoming appointments calendar view + cancel.
  - Services CRUD.
  - Blackout date ranges.
  - Weekly business-hours editor.
- Starter Privacy, Terms, and Cancellation pages.

## Local development

### 1. Install

```pwsh
npm install
```

### 2. Environment variables

Copy `.env.example` to `.env` and fill in values:

```pwsh
Copy-Item .env.example .env
```

Required to run end-to-end:

| Var | Purpose |
| --- | --- |
| `DATABASE_URL` | Postgres connection string |
| `AUTH_SECRET` | Random secret for Auth.js (`npx auth secret`) |
| `RESEND_API_KEY` | Email sending (transactional confirmations/reminders) |
| `EMAIL_FROM` | `Studio Name <bookings@yourdomain.com>` (verified Resend domain) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` | Twilio API credentials |
| `TWILIO_MESSAGING_SERVICE_SID` *(preferred)* or `TWILIO_FROM_NUMBER` | A2P 10DLC Messaging Service SID; falls back to a single number |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio Verify service SID — powers admin SMS sign-in OTP |
| `ADMIN_PHONES` | *(Optional bootstrap.)* Comma-separated E.164 phones allowed to sign in as admin before any `AdminPhone` DB rows exist. Once at least one admin exists, manage the allow-list at **/admin/admins**. |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/reminders` |
| `NEXT_PUBLIC_APP_URL` | Public URL used in management/cancel links |

> **Twilio setup:** create a Messaging Service in the Twilio console, attach
> your A2P-registered number(s) to it, and use that SID for
> `TWILIO_MESSAGING_SERVICE_SID`. Create a separate **Verify** service for
> `TWILIO_VERIFY_SERVICE_SID` (Verify uses its own SMS sender pool).

### 3. Database

```pwsh
npx prisma migrate dev --name init
npm run db:seed
```

The seed adds default Thu–Sun 9am–6pm hours and four sample services.

### 4. Run

```pwsh
npm run dev
```

Open <http://localhost:3000>.

- Public site: `/`, `/book`
- Admin (after sign-in with an `ADMIN_EMAILS` address): `/admin`
- Cancel an appointment: link sent in confirmation, e.g. `/appointments/<token>`

## Deployment (Vercel)

1. Push the repo to GitHub.
2. Import to Vercel. Add a **Neon** Postgres integration (Vercel's successor to
   `@vercel/postgres`), which sets `DATABASE_URL` automatically.
3. Add the rest of the env vars from `.env.example`.
4. Deploy. Vercel will pick up `vercel.json` and register the hourly cron at
   `/api/cron/reminders`.
5. After first deploy, run a one-off migrate with the Vercel CLI or via a
   GitHub Action: `npx prisma migrate deploy`.

## Scripts

| Script | What |
| --- | --- |
| `npm run dev` | Start Next.js in dev mode |
| `npm run build` | Production build |
| `npm run start` | Start production server |
| `npm run db:generate` | `prisma generate` |
| `npm run db:migrate` | `prisma migrate dev` |
| `npm run db:seed` | Seed sample services + hours |
| `npm run dev:mobile` | Start Next.js (LAN) + Expo dev server with `EXPO_PUBLIC_API_BASE_URL` set to your machine's LAN IP, so the phone can talk to the local backend over Wi-Fi. |
| `npm run dev:mobile:tunnel` | Same as above but uses Expo's tunnel mode (works across networks; needs `@expo/ngrok`). |

## Compliance notes

- **SMS:** Twilio requires explicit opt-in language (the booking form has it),
  STOP/HELP keywords (handled by Twilio + appended footer), and US **A2P 10DLC**
  brand/campaign registration before sending production SMS.
- **Email:** All transactional. Provide a real `EMAIL_FROM` from a verified
  Resend domain.
- **Privacy/Terms/Cancellation:** Templates in `src/app/{privacy,terms,cancellation-policy}`
  — review with a lawyer before publishing.

## TODO

### Deployment / release

- **Mobile admin app env:** before deploying the mobile auth endpoints
  (`/api/auth/mobile/*`), set `MOBILE_TOKEN_SECRET` to a long random string
  in production env. Falls back to `AUTH_SECRET` / `NEXTAUTH_SECRET` for dev.
- **Mobile app identity:** replace the Expo placeholder app name, icon,
  splash screen, and URL scheme in `mobile/app.json` before any TestFlight /
  Play Internal build.
- **Mobile EAS / store builds:** configure `eas.json` build profiles
  (development / preview / production), set up Apple + Google signing
  credentials, and wire EAS Submit for TestFlight and Play Internal Testing.
- **In-app toasts (mobile):** replace blocking `Alert.alert` success
  feedback with a non-blocking toast (e.g. `burnt` or `react-native-toast-message`).

### Tech debt

- **Real-DB integration tests.** *(Skipped for now.)* Layer the
  existing route-handler tests with a Testcontainers-managed Postgres
  so we exercise actual Prisma migrations + SQL constraints (e.g.
  unique `(serviceId, startsAt)` in the appointment table, the
  `Settings` singleton row). Slower suite, gated by Docker
  availability — revisit if regressions slip past the mocked tests.

### Long-term / product

- Adding policies page that is like Terms
- Update confirmation and reminder text
  - Make reminder text 2 hrs before appt
- Fix mobile styling, mainly for admin pages
- Styling changes and styling customization for admins
- Investigate personal email domains
- Investigate email confirmation/reminders
- Investigate making this work for many different admins