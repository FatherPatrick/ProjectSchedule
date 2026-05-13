/**
 * `reportError` is the single, central seam for "something went wrong
 * that an operator should see". It currently emits a structured
 * `level: error` log line via `logger.error`, which on Vercel is
 * indexed by the Logs / Observability tab.
 *
 * When we eventually add a Sentry / Logtail / OpenTelemetry binding,
 * this function is the only place that needs to change — every callsite
 * already passes the right context (route, user, ids).
 *
 * Usage:
 *   try { ... } catch (err) {
 *     reportError(err, { where: "appointments.create", appointmentId });
 *     return NextResponse.json({ error: "..." }, { status: 500 });
 *   }
 */
import { logger, serializeError, type LogFields } from "./logger";

export type ReportErrorContext = LogFields & {
  /** Short, dotted identifier of the call site, e.g. `"otp.request.send"`. */
  where?: string;
};

export function reportError(err: unknown, context: ReportErrorContext = {}): void {
  const { where, ...rest } = context;
  logger.error(where ? `[error] ${where}` : "[error]", {
    ...rest,
    err: serializeError(err),
  });
}
