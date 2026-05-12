/**
 * AuthContext: holds the current session in memory and persists it via
 * SecureStore. Exposes `signIn` (call after OTP verify) and `signOut`.
 *
 * The access token is auto-refreshed lazily by `apiFetch` (see ../api/client),
 * which calls `setTokens` after a successful refresh.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { logoutSession } from "@/api/auth";
import {
  clearTokens,
  loadTokens,
  saveTokens,
  type StoredTokens,
} from "./tokenStore";

export type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  tokens: StoredTokens | null;
  signIn: (tokens: StoredTokens) => Promise<void>;
  signOut: () => Promise<void>;
  /** Used internally by the API client after a refresh. */
  setTokens: (tokens: StoredTokens) => Promise<void>;
};

const Ctx = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [tokens, setTokensState] = useState<StoredTokens | null>(null);
  const [status, setStatus] = useState<AuthState["status"]>("loading");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const t = await loadTokens();
      if (cancelled) return;
      if (t && new Date(t.refreshTokenExpiresAt) > new Date()) {
        setTokensState(t);
        setStatus("signedIn");
      } else {
        if (t) await clearTokens();
        setStatus("signedOut");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setTokens = useCallback(async (t: StoredTokens) => {
    await saveTokens(t);
    setTokensState(t);
  }, []);

  const signIn = useCallback(
    async (t: StoredTokens) => {
      await setTokens(t);
      setStatus("signedIn");
    },
    [setTokens]
  );

  const signOut = useCallback(async () => {
    const refresh = tokens?.refreshToken;
    setStatus("signedOut");
    setTokensState(null);
    await clearTokens();
    if (refresh) {
      // Fire-and-forget; don't block the UI on a network call during sign-out.
      // (Server-side logout revokes the session, which also makes its
      // pushToken inert, so we don't need a separate unregister call here.)
      void logoutSession(refresh).catch(() => undefined);
    }
  }, [tokens?.refreshToken]);

  const value = useMemo<AuthState>(
    () => ({ status, tokens, signIn, signOut, setTokens }),
    [status, tokens, signIn, signOut, setTokens]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside <AuthProvider>");
  return v;
}
