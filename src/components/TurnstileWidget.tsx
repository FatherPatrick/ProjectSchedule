"use client";

/**
 * Cloudflare Turnstile widget wrapper.
 *
 * - Loads the Turnstile script lazily on mount (one-shot, idempotent).
 * - Renders the widget into a div ref via `window.turnstile.render`.
 * - Calls `onVerify(token)` whenever the user solves a challenge, and
 *   `onExpire()` if the token expires before the form is submitted (so
 *   the parent can clear its captcha-token state).
 * - Renders nothing if the site key is missing (dev / unconfigured),
 *   and the parent should treat that as "no captcha required".
 *
 * Site key is read from `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Pair it with
 * `TURNSTILE_SECRET_KEY` server-side; setting only one breaks bookings.
 */
import { useEffect, useRef } from "react";

const SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileGlobal {
  render: (
    el: HTMLElement,
    opts: {
      sitekey: string;
      callback?: (token: string) => void;
      "expired-callback"?: () => void;
      "error-callback"?: () => void;
      theme?: "light" | "dark" | "auto";
    }
  ) => string;
  reset: (widgetId?: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileGlobal;
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      `script[src^="${SCRIPT_SRC}"]`
    );
    if (existing) {
      // Already injected by another instance — wait for it.
      const check = () => {
        if (window.turnstile) resolve();
        else setTimeout(check, 50);
      };
      check();
      return;
    }
    const tag = document.createElement("script");
    tag.src = SCRIPT_SRC;
    tag.async = true;
    tag.defer = true;
    tag.onload = () => resolve();
    tag.onerror = () => reject(new Error("Failed to load Turnstile."));
    document.head.appendChild(tag);
  });
  return scriptPromise;
}

interface TurnstileProps {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  className?: string;
}

export function TurnstileWidget({ onVerify, onExpire, className }: TurnstileProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

  useEffect(() => {
    if (!siteKey || !containerRef.current) return;
    let cancelled = false;
    const container = containerRef.current;

    void loadTurnstileScript()
      .then(() => {
        if (cancelled || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(container, {
          sitekey: siteKey,
          callback: (token) => onVerify(token),
          "expired-callback": () => onExpire?.(),
        });
      })
      .catch(() => {
        // Loading failed — leave the container empty. The server will
        // reject the submission with a friendly message via the
        // `verifyTurnstileToken` failure path.
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // ignore: Turnstile occasionally throws on remove during HMR.
        }
        widgetIdRef.current = null;
      }
    };
    // We intentionally do NOT depend on the callbacks: re-rendering the
    // widget on every parent render would reset the user's challenge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteKey]);

  if (!siteKey) return null;
  return <div ref={containerRef} className={className} />;
}

/** Convenience: returns true if the captcha widget will render. */
export function isCaptchaEnabled(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
}
