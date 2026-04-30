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
| `RESEND_API_KEY` | Email sending (and magic-link sign-in) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM_NUMBER` | SMS |
| `CRON_SECRET` | Bearer token Vercel Cron sends to `/api/cron/reminders` |
| `ADMIN_EMAILS` | Comma-separated emails auto-promoted to ADMIN on first sign-in |

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

## Compliance notes

- **SMS:** Twilio requires explicit opt-in language (the booking form has it),
  STOP/HELP keywords (handled by Twilio + appended footer), and US **A2P 10DLC**
  brand/campaign registration before sending production SMS.
- **Email:** All transactional. Provide a real `EMAIL_FROM` from a verified
  Resend domain.
- **Privacy/Terms/Cancellation:** Templates in `src/app/{privacy,terms,cancellation-policy}`
  — review with a lawyer before publishing.
