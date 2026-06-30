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

### Spec rollout order

Multi-tenant is a prerequisite for the other three specs — each one adds
`salonId`-shaped schema (themes on `Salon`, Stripe Connect accounts per
salon, tenant-scoped feature settings) that would need a second migration
pass if built first.

1. **Multi-tenant** — support multiple salons, each with their own admins/clients. See [docs/MULTI_TENANT_SPEC.md](docs/MULTI_TENANT_SPEC.md)
2. **Salon appearance** — per-salon brand colors, logo & font customization. Smaller and lower-risk than Stripe; exercises the new per-host rendering path before money flows through it. See [docs/STYLING_SPEC.md](docs/STYLING_SPEC.md)
3. **Stripe payments** — admin-toggleable client payments + billing/revenue dashboard (Stripe Connect). Inherits theming for the onboarding + billing UI. See [docs/STRIPE_SPEC.md](docs/STRIPE_SPEC.md)
4. **Feature roadmap** — ongoing backlog pulled in alongside/after the above. Tier 1 items (iCal links, visit history, rebook, review requests, waitlist) are mostly independent; Packages depends on Stripe. See [docs/FEATURE_OPPORTUNITIES_SPEC.md](docs/FEATURE_OPPORTUNITIES_SPEC.md)

Variations:
- If revenue is urgent, swap Styling and Stripe — the dependency graph allows it.
- If multi-tenant feels too big to start cold, cherry-pick one or two tenant-agnostic Tier 1 features first (review requests, iCal links). Avoid anything with new schema (Waitlist, Loyalty, Packages) until after multi-tenant.
