/**
 * Covers `postJsonUnauthed` — the shared helper that backs the pre-auth
 * mobile endpoints (OTP request/verify, refresh, logout). Important
 * properties:
 *   - POSTs JSON-serialised body with the right content-type
 *   - Hits `${API_BASE_URL}${path}` (so tests confirm the base URL prefix)
 *   - Returns the parsed JSON on 2xx
 *   - Returns `undefined` on 204 No Content
 *   - On non-2xx, throws `ApiError` with `status` set and the server's
 *     `error` field used as the message when present
 *   - On non-2xx with no JSON body, throws `ApiError` with a generic
 *     "Request failed (NNN)" message
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ApiError, postJsonUnauthed } from "@/api/client";
import { API_BASE_URL } from "@/lib/config";

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("postJsonUnauthed", () => {
  it("POSTs JSON-serialised body to the API_BASE_URL-prefixed path", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { ok: true }));

    await postJsonUnauthed("/api/auth/mobile/otp/request", { phone: "+15555550100" });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/api/auth/mobile/otp/request`);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(init.body).toBe(JSON.stringify({ phone: "+15555550100" }));
  });

  it("returns the parsed JSON body on 2xx", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { foo: 1, bar: "two" }));

    const out = await postJsonUnauthed<{ foo: number; bar: string }>(
      "/x",
      {}
    );

    expect(out).toEqual({ foo: 1, bar: "two" });
  });

  it("returns undefined on 204 No Content (no body to parse)", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    const out = await postJsonUnauthed("/x", {});

    expect(out).toBeUndefined();
  });

  it("throws ApiError with the server-provided error string on non-2xx", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { error: "Invalid code." })
    );

    const err = await postJsonUnauthed("/x", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ message: "Invalid code.", status: 401 });
  });

  it("falls back to a generic message on non-2xx with no JSON body", async () => {
    fetchMock.mockResolvedValueOnce(new Response("nope", { status: 500 }));

    await expect(postJsonUnauthed("/x", {})).rejects.toMatchObject({
      message: "Request failed (500)",
      status: 500,
    });
  });
});
