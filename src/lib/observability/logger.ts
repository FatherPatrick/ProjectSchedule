/**
 * Structured JSON logger.
 *
 * On Vercel, anything written to stdout/stderr as JSON is automatically
 * indexed by the Logs / Observability tab and becomes filterable by any
 * field we attach. That gives us "error monitoring" without taking on
 * a Sentry dependency: queries like `level:error route:/api/appointments`
 * just work.
 *
 * Output shape (one line per record):
 *   {"level":"error","time":"2026-05-13T...","msg":"...","route":"...","err":{...}}
 *
 * In development we deliberately keep the same JSON shape — readable
 * enough in a terminal, and identical to what production emits, so a
 * dev fixing a bug is looking at the same record format an operator
 * would see in Vercel.
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

export type LogFields = Record<string, unknown>;

/** Levels we actually emit, in increasing severity. */
const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function minLevel(): LogLevel {
  const raw = process.env.LOG_LEVEL?.toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Serialize an Error (or anything thrown) into a plain object safe for
 * `JSON.stringify`. We keep the standard shape so a future Sentry /
 * Logtail binding can map fields cleanly.
 */
export function serializeError(err: unknown): LogFields {
  if (err instanceof Error) {
    const out: LogFields = {
      name: err.name,
      message: err.message,
    };
    if (err.stack) out.stack = err.stack;
    // Preserve common cause chains (Node 16.9+).
    const cause = (err as { cause?: unknown }).cause;
    if (cause !== undefined) out.cause = serializeError(cause);
    return out;
  }
  if (typeof err === "object" && err !== null) {
    try {
      return { value: JSON.parse(JSON.stringify(err)) };
    } catch {
      return { value: String(err) };
    }
  }
  return { value: String(err) };
}

function emit(level: LogLevel, msg: string, fields?: LogFields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[minLevel()]) return;
  const record: LogFields = {
    level,
    time: new Date().toISOString(),
    msg,
    ...fields,
  };
  // `JSON.stringify` will throw on circular refs; fall back to a
  // best-effort string so logging itself can never crash a request.
  let line: string;
  try {
    line = JSON.stringify(record);
  } catch {
    line = JSON.stringify({
      level,
      time: record.time,
      msg,
      _serializeError: "log payload was not serializable",
    });
  }
  // stderr for warn/error, stdout for the rest — matches conventional
  // pino behavior and lets log shippers split severity by stream.
  if (level === "warn" || level === "error") {
    process.stderr.write(line + "\n");
  } else {
    process.stdout.write(line + "\n");
  }
}

export const logger = {
  debug(msg: string, fields?: LogFields) {
    emit("debug", msg, fields);
  },
  info(msg: string, fields?: LogFields) {
    emit("info", msg, fields);
  },
  warn(msg: string, fields?: LogFields) {
    emit("warn", msg, fields);
  },
  error(msg: string, fields?: LogFields) {
    emit("error", msg, fields);
  },
};

/** Test-only hook — reads the level so tests can assert it. */
export function _currentMinLevelForTests(): LogLevel {
  return minLevel();
}
