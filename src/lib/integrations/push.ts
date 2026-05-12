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
 */
import { prisma } from "../db/prisma";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100;

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

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
}

/** Fire-and-forget: schedules but does not await the actual push send. */
export function pushToAdmins(payload: PushPayload, opts: PushOptions = {}): void {
  // Errors are logged inside; nothing for callers to do.
  void sendPushInternal(payload, opts).catch((err) =>
    console.error("[push] dispatch failed", err)
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
              error: ticket?.status === "error" ? ticket.message : null,
            },
          })
          .catch(() => undefined);
      })
    );
  }
}
