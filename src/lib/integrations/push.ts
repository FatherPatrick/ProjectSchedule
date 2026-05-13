/**
 * Expo Push Service helper. Looks up live mobile-session push tokens for the
 * given admin users (or all admins if `userIds` is omitted) and POSTs to
 * https://exp.host/--/api/v2/push/send. Records each attempt in
 * `NotificationLog` with `channel = "PUSH"` (one row per appointment×token).
 *
 * Notes:
 * - Expo accepts up to 100 messages per request; we chunk accordingly.
 * - Failures are swallowed: notifications are best-effort, never block.
 * - If `appointmentId` is omitted (e.g. for a generic admin notification) we
 *   skip the NotificationLog write because it requires an appointment FK.
 *
 * Dead-token reaping:
 * - Tickets returned by `/push/send` may include
 *   `details.error === "DeviceNotRegistered"` (uninstalled app, revoked
 *   permission, expired Expo token). We immediately null `pushToken` on
 *   every `MobileSession` row holding that token so we stop fan-outing.
 * - For the receipt-side flow (Expo only learns the device is gone when
 *   APNs/FCM rejects the push, which can be 15+ minutes later) callers
 *   may invoke {@link reapPushReceipts} with the ticket→token pairs
 *   collected from a previous send.
 */
import { prisma } from "../db/prisma";
import { reportError } from "../observability/reportError";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_RECEIPTS_URL = "https://exp.host/--/api/v2/push/getReceipts";
const CHUNK_SIZE = 100;
const RECEIPTS_CHUNK_SIZE = 1_000;

/** Expo error code that means "this push token is dead, stop using it". */
const DEAD_TOKEN_ERROR = "DeviceNotRegistered";

export interface PushPayload {
  title: string;
  body: string;
  /** Optional structured data sent to the app (deep-link routing). */
  data?: Record<string, unknown>;
}

export interface PushOptions {
  /** When provided, an `NotificationLog` row is written per recipient. */
  appointmentId?: string;
  /** When omitted, all ADMIN users with live sessions are targeted. */
  userIds?: string[];
}

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: "default";
  priority: "high";
}

interface ExpoTicketDetails {
  error?: string;
}

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: ExpoTicketDetails;
}

interface ExpoReceipt {
  status: "ok" | "error";
  message?: string;
  details?: ExpoTicketDetails;
}

/** Fire-and-forget: schedules but does not await the actual push send. */
export function pushToAdmins(payload: PushPayload, opts: PushOptions = {}): void {
  // Errors are logged inside; nothing for callers to do.
  void sendPushInternal(payload, opts).catch((err) =>
    reportError(err, { where: "push.dispatch", userIds: opts.userIds, appointmentId: opts.appointmentId })
  );
}

async function sendPushInternal(
  payload: PushPayload,
  opts: PushOptions
): Promise<void> {
  const sessions = await prisma.mobileSession.findMany({
    where: {
      revokedAt: null,
      expiresAt: { gt: new Date() },
      pushToken: { not: null },
      user: { role: "ADMIN" },
      ...(opts.userIds ? { userId: { in: opts.userIds } } : {}),
    },
    select: { id: true, pushToken: true },
  });

  // Deduplicate by token (a user could register the same device twice).
  const seen = new Set<string>();
  const tokens = sessions
    .map((s) => s.pushToken!)
    .filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
  if (tokens.length === 0) return;

  const messages: ExpoMessage[] = tokens.map((to) => ({
    to,
    title: payload.title,
    body: payload.body,
    data: payload.data,
    sound: "default",
    priority: "high",
  }));

  const deadTokens: string[] = [];

  for (let i = 0; i < messages.length; i += CHUNK_SIZE) {
    const chunk = messages.slice(i, i + CHUNK_SIZE);
    let tickets: ExpoTicket[] | null = null;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify(chunk),
      });
      if (res.ok) {
        const json = (await res.json()) as { data?: ExpoTicket[] };
        tickets = json.data ?? null;
      } else {
        console.warn("[push] expo responded", res.status);
      }
    } catch (err) {
      console.warn("[push] fetch failed", err);
    }

    // Reap any tokens Expo could already tell were dead at send time.
    if (tickets) {
      for (let idx = 0; idx < chunk.length; idx++) {
        const ticket = tickets[idx];
        if (
          ticket?.status === "error" &&
          ticket.details?.error === DEAD_TOKEN_ERROR
        ) {
          deadTokens.push(chunk[idx].to);
        }
      }
    }

    if (!opts.appointmentId) continue;

    await Promise.all(
      chunk.map((msg, idx) => {
        const ticket = tickets?.[idx];
        return prisma.notificationLog
          .create({
            data: {
              appointmentId: opts.appointmentId!,
              channel: "PUSH",
              kind: "CONFIRMATION", // generic admin-pushes reuse this enum value
              status: ticket?.status === "ok" ? "SENT" : "FAILED",
              providerId: ticket?.id ?? null,
              error:
                ticket?.status === "error"
                  ? ticket.details?.error ?? ticket.message ?? null
                  : null,
            },
          })
          .catch(() => undefined);
      })
    );
  }

  if (deadTokens.length > 0) {
    await reapDeadTokens(deadTokens);
  }
}

/**
 * Null `MobileSession.pushToken` for every session holding any of the
 * given tokens. Idempotent: safe to call with already-cleared tokens.
 *
 * Exported for tests; `sendPushInternal` and {@link reapPushReceipts}
 * call it internally.
 */
export async function reapDeadTokens(tokens: string[]): Promise<number> {
  const unique = Array.from(new Set(tokens.filter(Boolean)));
  if (unique.length === 0) return 0;
  try {
    const result = await prisma.mobileSession.updateMany({
      where: { pushToken: { in: unique } },
      data: { pushToken: null },
    });
    return result.count;
  } catch (err) {
    reportError(err, { where: "push.reapDeadTokens", count: unique.length });
    return 0;
  }
}

/**
 * Resolve previously-issued push tickets to receipts and reap any tokens
 * APNs/FCM ultimately rejected. Pass the ticket-id → push-token pairs
 * collected from the ticket array of an earlier `/push/send` call.
 *
 * Per Expo's docs, receipts may take a few minutes to materialize and
 * are kept for at most 24 hours, so callers should poll on a short
 * delay (e.g. from the hourly reminders cron).
 */
export async function reapPushReceipts(
  pairs: Array<{ ticketId: string; pushToken: string }>
): Promise<{ checked: number; reaped: number }> {
  const cleaned = pairs.filter((p) => p.ticketId && p.pushToken);
  if (cleaned.length === 0) return { checked: 0, reaped: 0 };

  const dead: string[] = [];
  for (let i = 0; i < cleaned.length; i += RECEIPTS_CHUNK_SIZE) {
    const chunk = cleaned.slice(i, i + RECEIPTS_CHUNK_SIZE);
    let receipts: Record<string, ExpoReceipt> | null = null;
    try {
      const res = await fetch(EXPO_RECEIPTS_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json",
          "accept-encoding": "gzip, deflate",
        },
        body: JSON.stringify({ ids: chunk.map((c) => c.ticketId) }),
      });
      if (res.ok) {
        const json = (await res.json()) as {
          data?: Record<string, ExpoReceipt>;
        };
        receipts = json.data ?? null;
      } else {
        console.warn("[push] receipts responded", res.status);
      }
    } catch (err) {
      console.warn("[push] receipts fetch failed", err);
    }
    if (!receipts) continue;

    for (const { ticketId, pushToken } of chunk) {
      const r = receipts[ticketId];
      if (r?.status === "error" && r.details?.error === DEAD_TOKEN_ERROR) {
        dead.push(pushToken);
      }
    }
  }

  const reaped = await reapDeadTokens(dead);
  return { checked: cleaned.length, reaped };
}
