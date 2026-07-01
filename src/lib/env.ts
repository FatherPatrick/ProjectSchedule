/**
 * Centralized env-var validation.
 *
 * Goals:
 *   - Crash the process at boot when production is misconfigured, instead of
 *     surfacing cryptic per-request errors deep in Twilio / Resend / Prisma.
 *   - Stay lenient in dev: missing integration credentials should *warn*,
 *     not crash, so a fresh checkout can `npm run dev` against an empty .env.
 *   - Stay silent in tests so vitest can run without populating every var.
 *
 * Wired from `instrumentation.ts` (Next.js boot hook). Existing callers
 * still read `process.env.*` directly — this module's job is purely to
 * fail loudly at startup if something required is missing or malformed.
 */
import { z } from "zod";

/** A non-empty string after trimming. Treats `""` as missing. */
const nonEmpty = z
  .string()
  .trim()
  .min(1)
  .transform((s) => s);

/**
 * Schema describing every env var the server side of the app touches.
 *
 * - `*Required` fields are enforced unconditionally.
 * - Other fields are optional at the schema level; production enforcement
 *   happens in `requireProdVars` below so dev can keep running with
 *   missing integration creds.
 */
const baseSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  // Always required — the app cannot meaningfully boot without these.
  DATABASE_URL: nonEmpty,
  AUTH_SECRET: nonEmpty.optional(),
  NEXTAUTH_SECRET: nonEmpty.optional(),

  // Platform base domain — per-salon URLs are built as https://<slug>.<domain>.
  NEXT_PUBLIC_APP_BASE_DOMAIN: z.string().optional(),

  // Mobile token signing.
  MOBILE_TOKEN_SECRET: nonEmpty.optional(),

  // Email (Resend).
  RESEND_API_KEY: nonEmpty.optional(),
  EMAIL_FROM: nonEmpty.optional(),

  // SMS (Twilio).
  TWILIO_ACCOUNT_SID: nonEmpty.optional(),
  TWILIO_AUTH_TOKEN: nonEmpty.optional(),
  TWILIO_FROM_NUMBER: nonEmpty.optional(),
  TWILIO_MESSAGING_SERVICE_SID: nonEmpty.optional(),
  TWILIO_VERIFY_SERVICE_SID: nonEmpty.optional(),

  // Cron auth (Vercel Cron sends Bearer token).
  CRON_SECRET: nonEmpty.optional(),

  // Vercel Blob (salon appearance logo uploads).
  BLOB_READ_WRITE_TOKEN: nonEmpty.optional(),

  // CORS dev allow-list.
  MOBILE_DEV_ORIGINS: z.string().optional(),

  // Structured logging level (consumed by observability/logger.ts). When
  // unset, the logger defaults by NODE_ENV (debug in dev, info otherwise).
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).optional(),

  // Cloudflare Turnstile (booking-form captcha). Optional in every
  // environment — when unset, `verifyTurnstileToken` is a no-op.
  // Setting one without the other is a misconfiguration: requests will
  // start failing because the client never attaches a token.
  TURNSTILE_SECRET_KEY: nonEmpty.optional(),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: nonEmpty.optional(),
});

export type Env = z.infer<typeof baseSchema>;

/**
 * Cross-field rules that only apply in production. We collect *all*
 * problems before throwing so an operator sees the full list, not just
 * the first one.
 */
function collectProdProblems(env: Env): string[] {
  const problems: string[] = [];

  // Auth.js needs *some* secret. Either AUTH_SECRET or NEXTAUTH_SECRET works.
  if (!env.AUTH_SECRET && !env.NEXTAUTH_SECRET) {
    problems.push("AUTH_SECRET (or NEXTAUTH_SECRET) is required in production.");
  }

  // Mobile tokens fall back to AUTH_SECRET in dev, but in prod we want a
  // dedicated secret so rotating Auth.js keys does not invalidate every
  // mobile session.
  if (!env.MOBILE_TOKEN_SECRET) {
    problems.push("MOBILE_TOKEN_SECRET is required in production.");
  }

  if (!env.NEXT_PUBLIC_APP_BASE_DOMAIN) {
    problems.push("NEXT_PUBLIC_APP_BASE_DOMAIN is required in production (used to build per-salon cancel/management links).");
  }

  if (!env.CRON_SECRET) {
    problems.push("CRON_SECRET is required in production (Vercel Cron auth).");
  }

  if (!env.BLOB_READ_WRITE_TOKEN) {
    problems.push("BLOB_READ_WRITE_TOKEN is required in production (salon logo uploads).");
  }

  // Email.
  if (!env.RESEND_API_KEY) problems.push("RESEND_API_KEY is required in production.");
  if (!env.EMAIL_FROM) problems.push("EMAIL_FROM is required in production.");

  // Twilio: account creds + Verify always; either Messaging Service SID or
  // a single From number for transactional SMS.
  if (!env.TWILIO_ACCOUNT_SID) problems.push("TWILIO_ACCOUNT_SID is required in production.");
  if (!env.TWILIO_AUTH_TOKEN) problems.push("TWILIO_AUTH_TOKEN is required in production.");
  if (!env.TWILIO_VERIFY_SERVICE_SID) {
    problems.push("TWILIO_VERIFY_SERVICE_SID is required in production (admin OTP sign-in).");
  }
  if (!env.TWILIO_MESSAGING_SERVICE_SID && !env.TWILIO_FROM_NUMBER) {
    problems.push(
      "Either TWILIO_MESSAGING_SERVICE_SID (preferred for A2P 10DLC) or TWILIO_FROM_NUMBER must be set in production."
    );
  }

  // Captcha keys are paired — setting only one half breaks the booking
  // form. We don't *require* captcha in prod (it stays opt-in), but if
  // the operator opted in they must set both.
  if (
    Boolean(env.TURNSTILE_SECRET_KEY) !==
    Boolean(env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
  ) {
    problems.push(
      "TURNSTILE_SECRET_KEY and NEXT_PUBLIC_TURNSTILE_SITE_KEY must be set together (or both unset to disable captcha)."
    );
  }

  return problems;
}

export type ValidateResult =
  | { ok: true; env: Env; warnings: string[] }
  | { ok: false; errors: string[] };

/**
 * Pure validation entry point — accepts a raw env object so it is trivial
 * to unit test. Returns either the parsed env plus dev-only warnings, or
 * the list of errors that should crash the boot.
 */
export function validateEnvObject(raw: NodeJS.ProcessEnv): ValidateResult {
  const parsed = baseSchema.safeParse(raw);
  if (!parsed.success) {
    const errors = parsed.error.issues.map((i) => {
      const path = i.path.join(".") || "(root)";
      return `${path}: ${i.message}`;
    });
    return { ok: false, errors };
  }
  const env = parsed.data;

  if (env.NODE_ENV === "production") {
    const problems = collectProdProblems(env);
    if (problems.length > 0) return { ok: false, errors: problems };
    return { ok: true, env, warnings: [] };
  }

  // Dev / test: surface the *would-be* prod problems as warnings so they
  // are visible during local development without blocking the server.
  const warnings = env.NODE_ENV === "development" ? collectProdProblems(env) : [];
  return { ok: true, env, warnings };
}

let cached: Env | null = null;

/**
 * Validate `process.env` and cache the parsed result. Throws in production
 * with a single multi-line message listing every problem. Logs warnings
 * (but does not throw) in development. A no-op repeat call returns the
 * cached env.
 */
export function validateEnv(): Env {
  if (cached) return cached;
  const result = validateEnvObject(process.env);
  if (!result.ok) {
    const message = ["Invalid environment configuration:", ...result.errors.map((e) => `  - ${e}`)].join("\n");
    throw new Error(message);
  }
  if (result.warnings.length > 0) {
    console.warn(
      ["[env] missing recommended variables (these will be required in production):", ...result.warnings.map((w) => `  - ${w}`)].join("\n")
    );
  }
  cached = result.env;
  return cached;
}

/** Test-only hook: drop the cached env so the next call re-parses. */
export function _resetEnvCacheForTests(): void {
  cached = null;
}
