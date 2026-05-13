import type {
  LogoutResult,
  OtpRequestResult,
  OtpVerifyInput,
  OtpVerifyResult,
  RefreshResult,
} from "@shared/api-types";
import { postJsonUnauthed } from "./client";

export type {
  OtpRequestResult,
  OtpVerifyResult,
  RefreshResult,
} from "@shared/api-types";

export function requestOtp(phone: string): Promise<OtpRequestResult> {
  return postJsonUnauthed("/api/auth/mobile/otp/request", { phone });
}

export function verifyOtp(input: OtpVerifyInput): Promise<OtpVerifyResult> {
  return postJsonUnauthed("/api/auth/mobile/otp/verify", input);
}

export function refreshTokens(refreshToken: string): Promise<RefreshResult> {
  return postJsonUnauthed("/api/auth/mobile/refresh", { refreshToken });
}

export function logoutSession(refreshToken: string): Promise<LogoutResult> {
  return postJsonUnauthed("/api/auth/mobile/logout", { refreshToken });
}
