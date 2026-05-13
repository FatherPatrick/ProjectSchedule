/**
 * Hydration / sign-out coverage for AuthProvider:
 *   - Boots in `loading`, then transitions to `signedOut` when SecureStore
 *     is empty.
 *   - Boots into `signedIn` with the persisted tokens when SecureStore has
 *     a non-expired bundle.
 *   - Wipes the store and transitions to `signedOut` when the persisted
 *     refresh token has already expired.
 *   - `signOut()` clears in-memory state, clears SecureStore, and fires a
 *     best-effort logout call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const logoutMock = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true }));

vi.mock("@/api/auth", () => ({
  logoutSession: logoutMock,
  refreshTokens: vi.fn(),
  requestOtp: vi.fn(),
  verifyOtp: vi.fn(),
}));

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { saveTokens, type StoredTokens } from "@/auth/tokenStore";

declare const __secureStoreReset: () => void;

const FUTURE_ACCESS = "2099-01-01T00:00:00.000Z";
const FUTURE_REFRESH = "2099-12-31T00:00:00.000Z";
const PAST = "2000-01-01T00:00:00.000Z";

const VALID: StoredTokens = {
  accessToken: "access-1",
  accessTokenExpiresAt: FUTURE_ACCESS,
  refreshToken: "refresh-1",
  refreshTokenExpiresAt: FUTURE_REFRESH,
};

beforeEach(() => {
  __secureStoreReset();
  logoutMock.mockClear();
});

afterEach(() => {
  __secureStoreReset();
});

function wrapper({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe("AuthProvider hydration", () => {
  it("boots loading then transitions to signedOut when SecureStore is empty", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.status).toBe("loading");
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.tokens).toBeNull();
  });

  it("hydrates a non-expired bundle into signedIn", async () => {
    await saveTokens(VALID);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));
    expect(result.current.tokens).toEqual(VALID);
  });

  it("clears SecureStore and signs out when the persisted refresh token has expired", async () => {
    const expired: StoredTokens = { ...VALID, refreshTokenExpiresAt: PAST };
    await saveTokens(expired);

    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));
    expect(result.current.tokens).toBeNull();

    // SecureStore should have been wiped — re-mounting yields no tokens.
    const { result: result2 } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result2.current.status).toBe("signedOut"));
    expect(result2.current.tokens).toBeNull();
  });
});

describe("AuthProvider.signOut", () => {
  it("clears state, clears SecureStore, and fires logoutSession with the prior refresh token", async () => {
    await saveTokens(VALID);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await act(async () => {
      await result.current.signOut();
    });

    expect(result.current.status).toBe("signedOut");
    expect(result.current.tokens).toBeNull();
    expect(logoutMock).toHaveBeenCalledWith(VALID.refreshToken);

    // Remount: nothing should be in SecureStore anymore.
    const { result: result2 } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result2.current.status).toBe("signedOut"));
    expect(result2.current.tokens).toBeNull();
  });

  it("swallows logoutSession errors (sign-out must never block the UI)", async () => {
    logoutMock.mockRejectedValueOnce(new Error("network"));
    await saveTokens(VALID);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    await expect(
      act(async () => {
        await result.current.signOut();
      })
    ).resolves.toBeUndefined();
    expect(result.current.status).toBe("signedOut");
  });
});

describe("AuthProvider.signIn / setTokens", () => {
  it("signIn persists the bundle and flips status to signedIn", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedOut"));

    await act(async () => {
      await result.current.signIn(VALID);
    });

    expect(result.current.status).toBe("signedIn");
    expect(result.current.tokens).toEqual(VALID);

    // Persistence: a fresh provider should hydrate the same bundle.
    const { result: result2 } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result2.current.status).toBe("signedIn"));
    expect(result2.current.tokens).toEqual(VALID);
  });

  it("setTokens replaces the in-memory bundle without changing status", async () => {
    await saveTokens(VALID);
    const { result } = renderHook(() => useAuth(), { wrapper });
    await waitFor(() => expect(result.current.status).toBe("signedIn"));

    const rotated: StoredTokens = { ...VALID, accessToken: "access-2" };
    await act(async () => {
      await result.current.setTokens(rotated);
    });
    expect(result.current.tokens).toEqual(rotated);
    expect(result.current.status).toBe("signedIn");
  });
});
