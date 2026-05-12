import { API_BASE_URL } from "@/config";

export type OtpRequestResult = { ok: true };

export type OtpVerifyResult = {
  accessToken: string;
  accessTokenExpiresAt: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
  user: { id: string; role: "ADMIN" };
};

export type RefreshResult = {
  accessToken: string;
  accessTokenExpiresAt: string;
  accessTokenTtlSeconds: number;
  refreshToken: string;
  refreshTokenExpiresAt: string;
};

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

export function verifyOtp(input: {
  phone: string;
  code: string;
  deviceLabel?: string;
}): Promise<OtpVerifyResult> {
  return postJson("/api/auth/mobile/otp/verify", input);
}

export function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  return postJson("/api/auth/mobile/refresh", { refreshToken });
}

export function logoutSession(refreshToken: string): Promise<{ ok: true }> {
  return postJson("/api/auth/mobile/logout", { refreshToken });
}
