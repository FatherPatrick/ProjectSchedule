import { NextResponse } from "next/server";

/**
 * Discriminated result from `parseJsonBody`. Mirrors the rate-limit
 * helper's shape so route handlers can early-return the prebuilt
 * 400 response without re-stringifying the error message.
 */
export type ParseJsonBodyResult =
  | { ok: true; data: unknown }
  | { ok: false; response: NextResponse };

/**
 * Strict JSON-body parser. Returns either `{ ok: true, data }` or a ready-
 * to-return `NextResponse` carrying `{ error: "Invalid JSON." }` with
 * status 400. Replaces the
 *
 *   let raw: unknown;
 *   try { raw = await req.json(); } catch {
 *     return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
 *   }
 *
 * boilerplate that was duplicated across ~14 route handlers.
 */
export async function parseJsonBody(req: Request): Promise<ParseJsonBodyResult> {
  try {
    return { ok: true, data: await req.json() };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Invalid JSON." },
        { status: 400 }
      ),
    };
  }
}

/**
 * Lenient JSON-body parser. Returns the parsed value, or `null` if the
 * body is missing / malformed. Used by endpoints that treat a missing
 * body as "no-op accepted" (e.g. logout, admin appointment cancel).
 */
export async function tryParseJsonBody(req: Request): Promise<unknown | null> {
  try {
    return await req.json();
  } catch {
    return null;
  }
}
