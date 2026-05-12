import { apiFetch } from "./client";
import type { AuthState } from "@/auth/AuthContext";

export async function registerPushToken(
  auth: AuthState,
  body: { pushToken: string; platform: "ios" | "android" }
): Promise<void> {
  await apiFetch(auth, `/api/admin/push/register`, {
    method: "POST",
    body,
  });
}

export async function unregisterPushToken(auth: AuthState): Promise<void> {
  await apiFetch(auth, `/api/admin/push/unregister`, { method: "POST" });
}
