/**
 * Authenticated fetch wrapper.
 *
 * - Attaches `Authorization: Bearer <accessToken>`.
 * - On 401, attempts a single refresh (using the stored refresh token) and
 *   retries the original request once.
 * - Persists rotated tokens via the AuthState callbacks.
 *
 * Two surfaces:
 *   - {@link apiFetch} (`apiFetch(auth, path, init?)`) — for non-hook
 *     callers that already have an `AuthState` in scope (e.g. the push
 *     bridge effect).
 *   - {@link useApi} (`const api = useApi();`) — preferred inside React
 *     Query hooks. Reads `useAuth()` once and exposes a tiny
 *     `{ get, post, put, patch, del }` object so hooks no longer
 *     re-pull `state.accessToken` on every call.
 */
import { useMemo } from "react";
import { API_BASE_URL } from "@/lib/config";
import { useAuth, type AuthState } from "@/auth/AuthContext";
import { refreshTokens } from "./auth";

export class ApiError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type FetchInit = Omit<RequestInit, "body"> & { body?: unknown };

async function doFetch(
  url: string,
  accessToken: string,
  init: FetchInit
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);
  if (init.body !== undefined && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  return fetch(url, {
    ...init,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export async function apiFetch<T = unknown>(
  auth: AuthState,
  path: string,
  init: FetchInit = {}
): Promise<T> {
  if (!auth.tokens) throw new ApiError(401, "Not signed in.");
  const url = `${API_BASE_URL}${path}`;

  let res = await doFetch(url, auth.tokens.accessToken, init);

  if (res.status === 401) {
    // Try one refresh + retry.
    try {
      const refreshed = await refreshTokens(auth.tokens.refreshToken);
      await auth.setTokens({
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        refreshToken: refreshed.refreshToken,
        refreshTokenExpiresAt: refreshed.refreshTokenExpiresAt,
      });
      res = await doFetch(url, refreshed.accessToken, init);
    } catch {
      await auth.signOut();
      throw new ApiError(401, "Session expired. Please sign in again.");
    }
  }

  if (!res.ok) {
    let message = `Request failed (${res.status}).`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new ApiError(res.status, message);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Hook variant of {@link apiFetch}. Closes over the current `AuthState`
 * and exposes verb helpers so call sites read like:
 *
 *   const api = useApi();
 *   const list = await api.get<MyResponse>("/api/admin/foo");
 *   await api.post("/api/admin/foo", { name });
 *
 * The returned object is memoized against the auth context value, so
 * passing it into TanStack Query `queryFn` / `mutationFn` is stable
 * between renders that don't change auth.
 */
export interface Api {
  get: <T = unknown>(path: string, init?: Omit<FetchInit, "body" | "method">) => Promise<T>;
  post: <T = unknown>(path: string, body?: unknown, init?: Omit<FetchInit, "body" | "method">) => Promise<T>;
  put: <T = unknown>(path: string, body?: unknown, init?: Omit<FetchInit, "body" | "method">) => Promise<T>;
  patch: <T = unknown>(path: string, body?: unknown, init?: Omit<FetchInit, "body" | "method">) => Promise<T>;
  del: <T = unknown>(path: string, init?: Omit<FetchInit, "body" | "method">) => Promise<T>;
}

export function useApi(): Api {
  const auth = useAuth();
  return useMemo<Api>(
    () => ({
      get: (path, init) => apiFetch(auth, path, { ...init, method: "GET" }),
      post: (path, body, init) =>
        apiFetch(auth, path, { ...init, method: "POST", body: body ?? {} }),
      put: (path, body, init) =>
        apiFetch(auth, path, { ...init, method: "PUT", body: body ?? {} }),
      patch: (path, body, init) =>
        apiFetch(auth, path, { ...init, method: "PATCH", body: body ?? {} }),
      del: (path, init) => apiFetch(auth, path, { ...init, method: "DELETE" }),
    }),
    [auth]
  );
}
