/**
 * Covers the `parseJsonBody` / `tryParseJsonBody` helpers that replace
 * the duplicated `let raw; try { raw = await req.json() } catch {…}`
 * blocks across ~14 route handlers.
 */
import { describe, expect, it } from "vitest";
import {
  parseJsonBody,
  tryParseJsonBody,
} from "@/lib/http/parseJsonBody";

function jsonReq(body: string): Request {
  return new Request("http://localhost/x", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body,
  });
}

describe("parseJsonBody (strict)", () => {
  it("returns ok:true with the parsed object on a valid body", async () => {
    const out = await parseJsonBody(jsonReq(JSON.stringify({ a: 1, b: "two" })));
    expect(out).toEqual({ ok: true, data: { a: 1, b: "two" } });
  });

  it("accepts JSON primitives and arrays as the top-level body", async () => {
    expect(await parseJsonBody(jsonReq("[1,2,3]"))).toEqual({
      ok: true,
      data: [1, 2, 3],
    });
    expect(await parseJsonBody(jsonReq("42"))).toEqual({ ok: true, data: 42 });
    expect(await parseJsonBody(jsonReq("null"))).toEqual({ ok: true, data: null });
  });

  it("returns a 400 NextResponse on malformed JSON", async () => {
    const out = await parseJsonBody(jsonReq("{not json"));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.response.status).toBe(400);
    expect(await out.response.json()).toEqual({ error: "Invalid JSON." });
  });

  it("returns a 400 NextResponse on an empty body", async () => {
    // `req.json()` rejects on an empty string body.
    const out = await parseJsonBody(jsonReq(""));
    expect(out.ok).toBe(false);
    if (out.ok) throw new Error("unreachable");
    expect(out.response.status).toBe(400);
  });
});

describe("tryParseJsonBody (lenient)", () => {
  it("returns the parsed value on a valid body", async () => {
    const out = await tryParseJsonBody(jsonReq(JSON.stringify({ note: "hi" })));
    expect(out).toEqual({ note: "hi" });
  });

  it("returns null on a malformed body instead of throwing", async () => {
    expect(await tryParseJsonBody(jsonReq("{bad"))).toBeNull();
    expect(await tryParseJsonBody(jsonReq(""))).toBeNull();
  });
});
