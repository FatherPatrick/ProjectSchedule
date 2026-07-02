# TODO

## Email domain setup

- [ ] **Register a domain** — buy the domain from a registrar (Cloudflare Registrar, Namecheap, Porkbun). ~$10–15/yr.
- [ ] **Get email on the domain** — set up a mailbox or forwarding (Google Workspace, Zoho, or free Cloudflare Email Routing) and configure MX records.
- [ ] **Hook up sending emails in the app** — wire a transactional email provider (Resend, Postmark, SendGrid, Amazon SES) to send from the domain, and add SPF/DKIM/DMARC DNS records for deliverability.

## Deployment / release

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
- **Stripe payments (feature-flagged):** all 7 spec phases are implemented
  but the flag is still off by default everywhere — fully inert in
  production today. See [docs/STRIPE_SPEC.md](docs/STRIPE_SPEC.md)
  ("Feature flag & rollout status") for the full pre-launch checklist
  (env vars, webhook registration, cron confirmation, and — critically —
  a real Stripe test-mode QA pass, which hasn't happened yet) before ever
  setting `STRIPE_PAYMENTS_ENABLED=true`. Its "Open decisions — resolved"
  section has the defaults that were locked in along the way.
- **Waitlist cron:** `/api/cron/expire-waitlist` is declared in
  `vercel.json` alongside the existing crons — confirm it's actually
  scheduled once deployed (same Vercel Cron paid-plan caveat as
  `expire-holds`: anything more frequent than daily needs a paid plan, which
  is why waitlist escalation to the next person in line is a daily sweep,
  not instant). Harmless if it never runs — `WAITING`/`NOTIFIED` entries just
  don't get cleaned up or escalated — but worth confirming before relying on
  the waitlist for real.

## Tech debt

- **Real-DB integration tests.** *(Skipped for now.)* Layer the
  existing route-handler tests with a Testcontainers-managed Postgres
  so we exercise actual Prisma migrations + SQL constraints (e.g.
  unique `(serviceId, startsAt)` in the appointment table, the
  `Settings` singleton row). Slower suite, gated by Docker
  availability — revisit if regressions slip past the mocked tests.

## Long-term / product

- Fix mobile styling, mainly for admin pages

### Spec rollout order

1. **Stripe payments** — admin-toggleable client payments + billing/revenue dashboard (Stripe Connect). Inherits theming for the onboarding + billing UI. *All 7 phases implemented (schema, Connect onboarding, admin config, booking + payment, refunds + sweeper, billing dashboard); still fully inert behind `STRIPE_PAYMENTS_ENABLED`, and real Stripe test-mode QA hasn't happened yet.* See [docs/STRIPE_SPEC.md](docs/STRIPE_SPEC.md)
2. **Feature roadmap** — *Tier 1 and Tier 2 are both fully done* (2026-07-02): iCal, visit history, rebook, review-request, waitlist (Tier 1); multi-service booking, packages (admin-sold, no online checkout yet), loyalty stamps, recurring appointments (admin-only) (Tier 2). Client Portal (Tier 2's 5th item) stays out of scope per the "client accounts" decision. Tier 3 (photo gallery, social booking, marketing campaigns, AI no-show prediction) is next whenever prioritized. See [docs/FEATURE_OPPORTUNITIES_SPEC.md](docs/FEATURE_OPPORTUNITIES_SPEC.md)
