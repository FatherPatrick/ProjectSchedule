import { API_BASE_URL } from "@/lib/config";
import type {
  LogoutResult,
  OtpRequestResult,
  OtpVerifyInput,
  OtpVerifyResult,
  RefreshResult,
} from "@shared/api-types";

export type {
  OtpRequestResult,
  OtpVerifyResult,
  RefreshResult,
} from "@shared/api-types";

async function postJson<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const data = (await res.json()) as { error?: string };
      if (data?.error) message = data.error;
    } catch {
      // ignore
    }
    throw new Error(message);
  }
  return (await res.json()) as T;
}

export function requestOtp(phone: string): Promise<OtpRequestResult> {
  return postJson("/api/auth/mobile/otp/request", { phone });
}

export function verifyOtp(input: OtpVerifyInput): Promise<OtpVerifyResult> {
  return postJson("/api/auth/mobile/otp/verify", input);
}

export function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  return postJson("/api/auth/mobile/refresh", { refreshToken });
}

export function logoutSession(refreshToken: string): Promise<LogoutResult> {
  return postJson("/api/auth/mobile/logout", { refreshToken });
}
