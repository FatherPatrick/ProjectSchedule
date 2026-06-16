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

## Tech debt

- **Real-DB integration tests.** *(Skipped for now.)* Layer the
  existing route-handler tests with a Testcontainers-managed Postgres
  so we exercise actual Prisma migrations + SQL constraints (e.g.
  unique `(serviceId, startsAt)` in the appointment table, the
  `Settings` singleton row). Slower suite, gated by Docker
  availability — revisit if regressions slip past the mocked tests.

## Long-term / product

- Fix mobile styling, mainly for admin pages
- Multi-tenant: support multiple salons, each with their own admins/clients — see [docs/MULTI_TENANT_SPEC.md](docs/MULTI_TENANT_SPEC.md)
- Salon appearance: per-salon brand colors, logo & font customization — see [docs/STYLING_SPEC.md](docs/STYLING_SPEC.md)
- Stripe payments: admin-toggleable client payments + billing/revenue dashboard (Stripe Connect) — see [docs/STRIPE_SPEC.md](docs/STRIPE_SPEC.md)
