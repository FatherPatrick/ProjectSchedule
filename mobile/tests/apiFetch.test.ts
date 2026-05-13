/**
 * Covers the access-token refresh dance in `apiFetch`:
 *   - Happy path (200): no refresh, no second fetch.
 *   - 401 once + refresh succeeds + retry returns 200: caller sees the
 *     retry's body, AuthState.setTokens is called with the rotated bundle.
 *   - 401 + refresh fails: AuthState.signOut is called and the caller
 *     gets an ApiError(401).
 *   - Non-2xx with a JSON `error` field surfaces that error string.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("@/api/auth", () => ({
  refreshTokens: refreshMock,
}));

import { apiFetch, ApiError } from "@/api/client";
import type { AuthState } from "@/auth/AuthContext";
import type { StoredTokens } from "@/auth/tokenStore";

const INITIAL: StoredTokens = {
  accessToken: "access-1",
  accessTokenExpiresAt: "2026-05-13T18:00:00.000Z",
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: "2026-06-13T18:00:00.000Z",
};

const ROTATED: StoredTokens = {
  accessToken: "access-2",
  accessTokenExpiresAt: "2026-05-13T19:00:00.000Z",
  refreshToken: "refresh-2",
  refreshTokenExpiresAt: "2026-06-14T18:00:00.000Z",
};

function makeAuth(overrides: Partial<AuthState> = {}): AuthState {
  return {
    status: "signedIn",
    tokens: INITIAL,
    setTokens: vi.fn(async () => undefined),
    signIn: vi.fn(async () => undefined),
    signOut: vi.fn(async () => undefined),
    ...overrides,
  } as AuthState;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

beforeEach(() => {
  refreshMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("apiFetch — happy path", () => {
  it("attaches Authorization, doesn't refresh on 200, returns the JSON body", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const auth = makeAuth();
    const out = await apiFetch<{ ok: boolean }>(auth, "/api/admin/foo");

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://api.test/api/admin/foo");
    const headers = init.headers as Headers;
    expect(headers.get("authorization")).toBe("Bearer access-1");
    expect(refreshMock).not.toHaveBeenCalled();
    expect(auth.setTokens).not.toHaveBeenCalled();
  });

  it("serializes a JSON body and sets the content-type header", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({ id: "x" }));
    vi.stubGlobal("fetch", fetchMock);

    await apiFetch(makeAuth(), "/api/admin/foo", {
      method: "POST",
      body: { hello: "world" },
    });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.body).toBe(JSON.stringify({ hello: "world" }));
    expect((init.headers as Headers).get("content-type")).toBe("application/json");
  });
});

describe("apiFetch — 401 refresh dance", () => {
  it("refreshes once and retries on a single 401", async () => {
    const fetchMock = vi
      .fn()
      // First call: 401
      .mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401))
      // Second call (retry with rotated token): 200
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    refreshMock.mockResolvedValueOnce(ROTATED);

    const auth = makeAuth();
    const out = await apiFetch<{ ok: boolean }>(auth, "/api/admin/foo");

    expect(out).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(refreshMock).toHaveBeenCalledWith(INITIAL.refreshToken);
    expect(auth.setTokens).toHaveBeenCalledWith(ROTATED);
    // Second call uses the rotated access token.
    const [, secondInit] = fetchMock.mock.calls[1];
    expect((secondInit.headers as Headers).get("authorization")).toBe(
      `Bearer ${ROTATED.accessToken}`
    );
    expect(auth.signOut).not.toHaveBeenCalled();
  });

  it("signs the user out and throws ApiError(401) when refresh fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    refreshMock.mockRejectedValueOnce(new Error("refresh expired"));

    const auth = makeAuth();
    const err = await apiFetch(auth, "/api/admin/foo").catch((e) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 401 });
    expect(auth.signOut).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not attempt a second retry if the retry itself returns 401", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Unauthorized" }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: "Still bad" }, 401));
    vi.stubGlobal("fetch", fetchMock);

    refreshMock.mockResolvedValueOnce(ROTATED);

    await expect(
      apiFetch(makeAuth(), "/api/admin/foo")
    ).rejects.toMatchObject({ status: 401, message: "Still bad" });
    expect(fetchMock).toHaveBeenCalledTimes(2); // not 3
    expect(refreshMock).toHaveBeenCalledTimes(1);
  });
});

describe("apiFetch — error surfacing", () => {
  it("throws ApiError with the server-provided error message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: "Bad request" }, 400));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch(makeAuth(), "/api/admin/foo")
    ).rejects.toMatchObject({ status: 400, message: "Bad request" });
  });

  it("falls back to a generic message on non-JSON error bodies", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => {
        throw new Error("not json");
      },
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      apiFetch(makeAuth(), "/api/admin/foo")
    ).rejects.toMatchObject({ status: 500, message: /Request failed/ });
  });

  it("returns undefined for a 204 No Content response", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 204,
      json: async () => null,
    } as unknown as Response);
    vi.stubGlobal("fetch", fetchMock);

    const out = await apiFetch(makeAuth(), "/api/admin/foo", {
      method: "DELETE",
    });
    expect(out).toBeUndefined();
  });

  it("throws ApiError(401) without calling fetch when there are no tokens", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const auth = makeAuth({ tokens: null, status: "signedOut" });
    await expect(apiFetch(auth, "/api/admin/foo")).rejects.toMatchObject({
      status: 401,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
