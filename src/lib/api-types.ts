/**
 * Shared API DTOs — single source of truth for request/response shapes
 * exchanged between the Next.js server and the Expo mobile app.
 *
 * Why it lives here (server `src/lib/`) rather than a top-level `shared/`
 * folder:
 *   - This is a single-repo, two-app project, not a monorepo. Avoiding a
 *     new package keeps tooling minimal.
 *   - Mobile imports types only (`import type { ... }`) via the `@shared/*`
 *     tsconfig alias defined in `mobile/tsconfig.json`. Type-only imports
 *     are erased by Babel before Metro sees them, so the bundler never
 *     needs to traverse outside the `mobile/` folder.
 *
 * Discipline:
 *   - Server route handlers should annotate their JSON payloads with
 *     `satisfies <DTO>` so any drift fails the server build immediately.
 *   - Keep this file framework-free. No imports from `next`, `react`,
 *     `@prisma/client` value side, etc. Only types and zod-derived types
 *     are allowed so it stays safe to consume from React Native.
 */

// ---------------------------------------------------------------------------
// Common envelopes
// ---------------------------------------------------------------------------

/** Standard success envelope for `GET` collection / item endpoints. */
export type DataResponse<T> = { data: T };

/** Standard error envelope used by every JSON endpoint. */
export type ErrorResponse = { error: string };

// ---------------------------------------------------------------------------
// Appointments (GET /api/admin/appointments, approve/cancel mutations)
// ---------------------------------------------------------------------------

export type AppointmentStatus =
  | "PENDING"
  | "PENDING_PAYMENT"
  | "CONFIRMED"
  | "CANCELLED"
  | "COMPLETED"
  | "NO_SHOW";

export type AppointmentClientDTO = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type AppointmentServiceDTO = {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
};

export type AppointmentDTO = {
  id: string;
  /** ISO timestamp (UTC). */
  startsAt: string;
  /** ISO timestamp (UTC). */
  endsAt: string;
  status: AppointmentStatus;
  notes: string | null;
  client: AppointmentClientDTO;
  service: AppointmentServiceDTO;
};

export type AppointmentsListResponse = DataResponse<AppointmentDTO[]>;

// ---------------------------------------------------------------------------
// Services (GET/POST /api/admin/services, PATCH/DELETE /:id)
// ---------------------------------------------------------------------------

export type ServiceDTO = {
  id: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  priceCents: number;
  active: boolean;
  sortOrder: number;
};

export type ServicesListResponse = DataResponse<ServiceDTO[]>;
export type ServiceCreateResponse = DataResponse<{ id: string }>;

export type ServiceCreateInput = {
  name: string;
  description?: string | null;
  durationMinutes: number;
  priceCents: number;
  active?: boolean;
};

export type ServiceUpdateInput = Partial<ServiceCreateInput>;

// ---------------------------------------------------------------------------
// Admin client search (GET /api/admin/clients) + admin booking
// ---------------------------------------------------------------------------

export type ClientLiteDTO = {
  id: string;
  name: string;
  email: string;
  phone: string;
};

export type ClientSearchResponse = DataResponse<ClientLiteDTO[]>;

/**
 * Body for `POST /api/admin/appointments` (admin books for a client). Provide
 * either `clientId` (existing) or `name`/`email`/`phone` (new client).
 */
export type AdminAppointmentCreateInput = {
  serviceId: string;
  /** ISO timestamp (UTC). */
  startISO: string;
  clientId?: string;
  name?: string;
  email?: string;
  phone?: string;
  smsOptIn?: boolean;
  /** Send the client the confirmation + reminder. Defaults to true. */
  notify?: boolean;
  notes?: string;
};

/** Success envelope returned by the admin + public booking endpoints. */
export type BookingCreatedResponse = {
  id: string;
  managementToken: string;
  serviceName: string;
  whenLabel: string;
};

/**
 * Returned by the public booking endpoints instead of {@link BookingCreatedResponse}
 * when the salon requires online payment (docs/STRIPE_SPEC.md §4.1). The
 * appointment exists as a `PENDING_PAYMENT` hold; the client must confirm the
 * PaymentIntent with `clientSecret` before it becomes a real booking — the
 * webhook (not this response) is what actually confirms it.
 */
export type BookingRequiresPaymentResponse = {
  requiresPayment: true;
  appointmentId: string;
  managementToken: string;
  clientSecret: string;
  publishableKey: string;
  connectedAccountId: string;
  amountCents: number;
  currency: string;
  serviceName: string;
  whenLabel: string;
};

export type PublicBookingResponse = BookingCreatedResponse | BookingRequiresPaymentResponse;

/** Polled after payment confirmation to learn whether the webhook has landed yet. */
export type AppointmentStatusResponse = {
  status: "PENDING_PAYMENT" | "PENDING" | "CONFIRMED" | "CANCELLED" | "COMPLETED" | "NO_SHOW";
  serviceName: string;
  whenLabel: string;
};

// ---------------------------------------------------------------------------
// Waitlist (POST /api/waitlist, POST /api/waitlist/[token]/claim)
// ---------------------------------------------------------------------------

export type WaitlistJoinInput = {
  serviceId: string;
  name: string;
  phone: string;
  email?: string;
  smsOptIn?: boolean;
  captchaToken?: string | null;
};

export type WaitlistJoinResponse = { ok: true };

export type WaitlistClaimResponse = {
  appointmentId: string;
  managementToken: string;
  serviceName: string;
  whenLabel: string;
};

// ---------------------------------------------------------------------------
// Blackouts
// ---------------------------------------------------------------------------

export type BlackoutDTO = {
  id: string;
  /** ISO timestamp (UTC). */
  startsAt: string;
  /** ISO timestamp (UTC). */
  endsAt: string;
  reason: string | null;
};

export type BlackoutsListResponse = DataResponse<BlackoutDTO[]>;

/**
 * Mirrors `blackoutCreateSchema` on the server. `fromDay`/`toDay` are
 * `YYYY-MM-DD`; `startTime`/`endTime` are `HH:MM` (only used when `allDay`
 * is false).
 */
export type BlackoutCreateInput = {
  fromDay: string;
  toDay: string;
  allDay: boolean;
  startTime: string | null;
  endTime: string | null;
  reason: string | null;
};

// ---------------------------------------------------------------------------
// Business hours
// ---------------------------------------------------------------------------

export type DayHours = {
  dayOfWeek: number;
  openMin: number;
  closeMin: number;
  active: boolean;
};

export type HoursResponse = DataResponse<{ days: DayHours[] }>;

export type HoursOverride = {
  /** `YYYY-MM-DD` (the date the override starts taking effect). */
  effectiveFrom: string;
  note: string | null;
  days: DayHours[];
};

export type HoursScheduleResponse = DataResponse<HoursOverride[]>;

// ---------------------------------------------------------------------------
// App settings
// ---------------------------------------------------------------------------

export type AppSettingsDTO = {
  slotGranularityMin: number;
  allowStartAtClose: boolean;
  /** How far ahead clients may book, in days. `null` means no limit. */
  maxAdvanceDays: number | null;
};

export type AppSettingsResponse = DataResponse<AppSettingsDTO>;

// ---------------------------------------------------------------------------
// Mobile auth (OTP request / verify / refresh / logout)
// ---------------------------------------------------------------------------

export type OtpRequestInput = { phone: string };
export type OtpRequestResult = { ok: true };

export type OtpVerifyInput = {
  phone: string;
  code: string;
  deviceLabel?: string;
};

export type MobileTokenUser = { id: string; role: "ADMIN"; salonId: string };

export type OtpVerifyResult = {
  accessToken: string;
  /** ISO timestamp. */
  accessTokenExpiresAt: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  /** ISO timestamp. */
  refreshTokenExpiresAt: string;
  user: MobileTokenUser;
};

export type RefreshInput = { refreshToken: string };

export type RefreshResult = {
  accessToken: string;
  accessTokenExpiresAt: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

export type LogoutInput = { refreshToken: string };
export type LogoutResult = { ok: true };
