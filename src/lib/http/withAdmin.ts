import { NextResponse } from "next/server";
import type { z } from "zod";
import {
  requireAdmin,
  requireAdminEither,
  requireAdminFromBearer,
} from "@/lib/auth/admin";
import { parseJsonBody } from "@/lib/http/parseJsonBody";

/**
 * Which admin guard a route uses:
 *  - "either" (default): cookie session OR mobile Bearer — most /api/admin/*.
 *  - "cookie": cookie session only (admins management endpoints).
 *  - "bearer": mobile Bearer only (push register/unregister).
 */
type Guard = "either" | "cookie" | "bearer";

async function passesGuard(req: Request, guard: Guard): Promise<boolean> {
  if (guard === "cookie") return Boolean(await requireAdmin());
  if (guard === "bearer") return Boolean(await requireAdminFromBearer(req));
  return requireAdminEither(req);
}

const unauthorized = () =>
  NextResponse.json({ error: "Unauthorized" }, { status: 401 });

/**
 * Guard-only wrapper for admin route handlers (GET, no-body mutations, and
 * handlers that parse their own body). The `...args` rest tuple transparently
 * forwards Next's per-route context (e.g. `{ params: Promise<{ id }> }`), so
 * each handler keeps its exact signature and dynamic-route param types.
 */
export function withAdmin<Args extends unknown[]>(
  handler: (req: Request, ...args: Args) => Promise<Response>,
  guard: Guard = "either"
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    if (!(await passesGuard(req, guard))) return unauthorized();
    return handler(req, ...args);
  };
}

/**
 * Guard + JSON body parse + zod validation. The handler receives the validated
 * `data` first, then the raw `req`, then any forwarded route context. Returns
 * the prebuilt 400 from `parseJsonBody` on malformed JSON, or a 400 carrying
 * the first zod issue message on validation failure.
 */
export function withAdminJson<S extends z.ZodTypeAny, Args extends unknown[]>(
  schema: S,
  handler: (data: z.infer<S>, req: Request, ...args: Args) => Promise<Response>,
  guard: Guard = "either"
) {
  return async (req: Request, ...args: Args): Promise<Response> => {
    if (!(await passesGuard(req, guard))) return unauthorized();
    const body = await parseJsonBody(req);
    if (!body.ok) return body.response;
    const parsed = schema.safeParse(body.data);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid input." },
        { status: 400 }
      );
    }
    return handler(parsed.data, req, ...args);
  };
}
