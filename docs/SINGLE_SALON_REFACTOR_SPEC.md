# Single-Salon Runtime — Implementation Spec

Operate this installation as one salon while preserving the existing Prisma schema, applied migrations, and features built on salon ownership. This is a runtime and product-surface simplification, not a history rewrite or destructive data migration.

## Decisions (locked)

| Decision | Choice | Implication |
| --- | --- | --- |
| Scope | Single-salon runtime refactor; retain `Salon` and all `salonId` fields | Keeps Stripe, packages, waitlist, loyalty, and existing data contracts intact. |
| Canonical salon | Select one existing `Salon` by configured slug (`APP_SALON_SLUG`) | Startup/request resolution is deterministic; never choose the first active row. |
| Other salons | Preserve their rows and child data, but do not serve or mutate them through this app | No automatic merge, deletion, or cascade migration. |
| Host policy | Accept only the configured production slug and matching `<slug>.localhost` in development | Bare `localhost` and other salon slugs fail clearly. |
| Development OTP | Permit `000000` only when running against an isolated local database | A local app pointed at remote data must send and verify a real Twilio code. |
| History/database | Keep all commits and migrations; make forward code changes only | No `git reset`, force-push, schema downgrade, or migration-file removal. |

## Open decisions — resolve before deployment

- [ ] Confirm the canonical slug already stored on the intended `Salon` row and set `APP_SALON_SLUG` in every environment. It must match the production hostname prefix.
- [ ] Confirm the local database target. The current local configuration points at remote Neon; either switch local development to an isolated local database for `000000`, or use real Twilio OTP against the remote target.

## Guiding principle

The database remains salon-owned for compatibility, but this deployment has exactly one configured salon. Resolve that salon by `APP_SALON_SLUG`, verify the request host matches it, and verify authenticated web/mobile sessions carry its `salonId`. Never select an arbitrary first salon and never accept a salon identifier from client input.

## 1. Data model and migration policy

Keep `Salon`, `SalonStatus`, `User.salonId`, `AdminPhone`'s `(salonId, phone)` key, and all tenant relations in [prisma/schema.prisma](prisma/schema.prisma). Keep the migration chain, including the salon creation, data backfill, and composite admin-phone key migrations.

Do not drop `salonId`, collapse composite keys, delete `Salon` records, or edit already-applied migration files. New tables and features (Stripe, appointments, packages, waitlist, loyalty) depend on the current shape. Existing noncanonical salon rows and their data remain preserved but inaccessible through this app instance.

No database migration is expected for the runtime refactor. If a later project explicitly removes salon ownership from the schema, that is a separate migration project requiring a backup, duplicate/reference mapping, and a production rollback plan.

## 2. Canonical salon resolution

### Config

Add server-only `APP_SALON_SLUG` to [src/lib/env.ts](src/lib/env.ts). Require it in production validation; in development, fail with a clear configuration error when absent. Do not expose it as a client `NEXT_PUBLIC_*` setting. Keep `NEXT_PUBLIC_APP_BASE_DOMAIN` for URL construction.

Add a resolver in [src/lib/domain/salon.ts](src/lib/domain/salon.ts) that loads the configured slug through the existing `getSalonBySlug` cache and requires an `ACTIVE` row. Do not use the current bare-localhost query that selects the earliest active salon. Keep `getAdminSalonId` / `getDefaultSalonId` as compatibility wrappers around the canonical resolver so pages and server actions can migrate incrementally.

### Host validation

[src/proxy.ts](src/proxy.ts) already extracts the host prefix and overwrites `x-salon-slug`; retain that trusted derivation. A shared resolver should compare the extracted slug with `APP_SALON_SLUG`:

- Production: only the configured salon slug is accepted.
- Development: only `<APP_SALON_SLUG>.localhost` is accepted; bare `localhost` is rejected unless a separate explicit dev-host decision is approved.
- Any other/missing slug returns a not-found response before public data is returned or mutated.

Use the canonical salon record after the comparison. Do not use a query parameter or client-supplied header as a tenant override. Preserve proxy CORS/preflight behavior for mobile routes.

Update local-development instructions to use `http://<APP_SALON_SLUG>.localhost:3000`. If port 3000 is occupied, use the actual port reported by `next dev` while keeping the same slug host.

## 3. Web and mobile authentication

`src/auth.ts` currently resolves the salon from `x-salon-slug`, checks the salon-scoped `AdminPhone` entry, then verifies OTP and writes `salonId` into the user/JWT/session. Keep OTP and allow-list semantics; resolve the configured canonical salon and require the request host to match before checking the allow-list.

The central web guards in [src/lib/auth/admin.ts](src/lib/auth/admin.ts) must reject an `ADMIN` session whose `session.user.salonId` differs from the canonical salon. Apply the same invariant to `assertAdmin`, `requireAdmin`, and `requireAdminEither` so server actions and route handlers cannot skip it. `requireAdminSalon` and mobile bearer authorization must also reject tokens with a noncanonical `salonId`, even when the token is otherwise valid.

The web OTP request route and mobile OTP request/verify routes are host-scoped today. Route each through the canonical host resolver, preserving generic responses that avoid revealing whether a phone is allow-listed. Update `sendOtp` and `checkOtp` in [src/lib/integrations/verify.ts](src/lib/integrations/verify.ts): the fake send and `000000` acceptance are allowed only for `NODE_ENV=development` with a verified local database host (loopback only); remote database targets must send and verify a real Twilio OTP. Do not let an environment toggle alone enable the bypass against a remote database. Document that a local dev server connected to production data is unsafe.

The admin-phone record remains salon-scoped. `ADMIN_PHONES` is not a runtime allow-list in current code and must not be reintroduced as a production authorization bypass.

## 4. Public requests and API scoping

Keep existing `salonId` filters on public/admin Prisma operations. Replace host-driven arbitrary tenant selection with the canonical resolver at these boundaries:

- Public page/layout data: [src/app/page.tsx](src/app/page.tsx), [src/app/book/page.tsx](src/app/book/page.tsx), and shared layout/metadata.
- Public routes: [src/app/api/availability/route.ts](src/app/api/availability/route.ts), [src/app/api/appointments/route.ts](src/app/api/appointments/route.ts), [src/app/api/appointments/propose/route.ts](src/app/api/appointments/propose/route.ts), and [src/app/api/waitlist/route.ts](src/app/api/waitlist/route.ts).
- Appointment management links: cancel/iCal routes continue deriving the owner salon from the appointment lookup, then validate canonical ownership.
- Admin pages/actions and `/api/admin/*`: retain their current scoped queries and centralize the canonical-session check in the auth guards rather than removing `salonId` filters.
- Cron routes remain global sweeps; notification code continues resolving each record's owning salon as needed.

This reduces tenant choice without weakening query ownership constraints. A route must not fall back to an unscoped query merely because only one salon is expected.

## 5. Signup and tenant-management surfaces

Disable self-serve salon creation at [src/app/signup](src/app/signup), [src/app/api/signup/request/route.ts](src/app/api/signup/request/route.ts), and [src/app/api/signup/verify/route.ts). Return a stable `404`/not-found response from API routes and remove or redirect the public signup UI; do not allow requests to create additional salons. Keep the existing `Salon` model and noncanonical rows for data preservation.

Review [src/app/suspended/page.tsx](src/app/suspended/page.tsx) and platform-only links for stale SaaS navigation. Remove only surfaces that are unreachable after signup is disabled; do not delete tenant data or billing integration fields.

## 6. Salon-dependent features and integrations

Retain current per-salon data reads for business name, timezone, branding, settings, hours, and appearance. For the canonical salon, existing behavior should remain unchanged. Preserve Stripe Connect fields and feature gates, packages, add-ons, waitlist, recurring appointments, loyalty, and push-notification scoping; they rely on current Prisma relations and are not part of this removal.

Audit [src/lib/config.ts](src/lib/config.ts), [src/lib/timezone.ts](src/lib/timezone.ts), [src/lib/integrations/notifications.ts](src/lib/integrations/notifications.ts), and [src/lib/integrations/adminSms.ts](src/lib/integrations/adminSms.ts) for any code that still chooses a salon by host or global env instead of using the canonical row. Keep existing env values only where still needed for backward-compatible defaults; remove stale docs that claim they are tenant selectors.

## 7. Mobile development

Mobile login currently requires a salon slug on OTP request/verify, while the development mobile script uses a LAN IP. Keep production host validation strict. For only those mobile OTP endpoints, when `NODE_ENV=development` and the request has no slug, resolve the configured canonical salon on the server; production continues rejecting a missing slug. This is deterministic single-salon resolution, not a client-selected tenant. Do not trust a client-provided `salonId` or general query override. Add tests proving the fallback and OTP bypass are unavailable in production, and that OTP bypass is unavailable for remote database hosts.

## 8. Documentation and configuration

Update [README.md](README.md), [scripts/dev.ps1](scripts/dev.ps1), and [scripts/dev-mobile.ps1](scripts/dev-mobile.ps1) with `APP_SALON_SLUG`, canonical host examples, and the isolated-development-database requirement. Remove stale instructions that say `ADMIN_PHONES` bootstraps the web allow-list or that bare `localhost` is sufficient for tenant resolution.

Mark [docs/MULTI_TENANT_SPEC.md](docs/MULTI_TENANT_SPEC.md) as the historical implementation plan, superseded for runtime behavior by this spec. Do not delete it because it documents why current schema and migrations exist.

## 9. Testing

Add or update focused tests for:

- Canonical slug lookup succeeds; missing slug, unknown slug, noncanonical slug, and suspended canonical salon fail closed.
- `localhost` and `<canonical-slug>.localhost` follow the locked development host policy; production accepts only the configured slug.
- The mobile OTP development fallback uses only the configured canonical salon and is disabled in production.
- `000000` succeeds only in development with a loopback database host; it fails for remote database hosts, where Twilio send/check is used.
- OTP request/verify only operate for the canonical salon, and an admin session/mobile token from another salon is rejected by central guards.
- Public booking, availability, waitlist, and admin endpoints continue filtering by the canonical `salonId` and do not accept caller-selected salon IDs.
- Signup API routes cannot create salons; existing salon and child data remain untouched.
- Existing Stripe, service, hours, booking, waitlist, package, loyalty, notification, and mobile API tests continue passing.

Run Prisma validation/generation, focused auth/resolver/signup tests, full typecheck, lint, and the full test suite. No destructive migration should be run as part of these checks.

## 10. Suggested rollout

1. **Configuration and resolver:** add `APP_SALON_SLUG`, canonical lookup, host validation, and resolver tests. Deploy with the configured production slug before changing public routing.
2. **Auth boundary:** enforce canonical salon ownership in web guards, OTP routes, and mobile bearer guards; constrain the dev OTP shortcut to local databases. Verify the canonical admin phone row exists before cutover.
3. **Request routing:** update public pages/API and preserve all current `salonId` query filters. Test the production hostname and `<slug>.localhost`.
4. **Disable signup:** reject new salon creation, remove/redirect signup UI, and verify no new rows can be created through the public endpoints.
5. **Docs/mobile hardening:** update local/mobile setup, ensure local database isolation, and run the complete verification suite.

## Appendix — highest-risk items

- **No history/schema rollback:** reverting the original tenant commits while retaining later commits breaks dependent Stripe/product code and does not undo applied migrations.
- **Canonical host mismatch:** OTP is authorized against the host-resolved salon. Use the exact configured slug locally (`<slug>.localhost`) and in production.
- **Session/token mismatch:** host filtering alone is insufficient; enforce the canonical `salonId` in central web and mobile authorization guards.
- **Local development database:** the existing `000000` OTP shortcut must not work against a remote database. Isolate the database for the shortcut, or require real Twilio verification for remote targets.
- **Preserve data:** do not delete extra `Salon` rows or cascade their records in this runtime-only project.
- **Mobile LAN flow:** hostless LAN-IP OTP bootstrap must receive a deliberate dev-only treatment; never accept arbitrary tenant IDs from mobile input.
