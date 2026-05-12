/**
 * Wraps `expo-notifications` token acquisition.
 *
 * Two-phase API:
 *   1. `getPushPermissionStatus()` — read-only probe; safe to call anytime.
 *   2. `requestPermissionAndGetToken()` — triggers the OS prompt the first
 *      time, then returns the Expo push token on success.
 *
 * Both return `null` on devices that can't receive pushes (simulators, web).
 */
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";

export type PushRegistration = {
  pushToken: string;
  platform: "ios" | "android";
};

/** `granted` ⇒ already authorized; `denied` ⇒ user said no (need OS settings); `undetermined` ⇒ never asked. */
export type PushPermissionStatus =
  | "unsupported"
  | "granted"
  | "denied"
  | "undetermined";

export async function getPushPermissionStatus(): Promise<PushPermissionStatus> {
  if (!Device.isDevice) return "unsupported";
  if (Platform.OS !== "ios" && Platform.OS !== "android") return "unsupported";
  const existing = await Notifications.getPermissionsAsync();
  if (existing.granted) return "granted";
  // iOS exposes a `canAskAgain` style flag; treat anything we can still ask
  // as undetermined. Otherwise it's a hard denial.
  if (existing.canAskAgain) return "undetermined";
  return "denied";
}

async function ensureAndroidChannel(): Promise<void> {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
    lightColor: "#FF231F7C",
  });
}

async function readToken(): Promise<PushRegistration | null> {
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  try {
    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return {
      pushToken: tokenResponse.data,
      platform: Platform.OS as "ios" | "android",
    };
  } catch (err) {
    console.warn("[push] failed to get Expo token", err);
    return null;
  }
}

/** Idempotent: returns the token if permission is already granted. */
export async function getPushTokenIfGranted(): Promise<PushRegistration | null> {
  const status = await getPushPermissionStatus();
  if (status !== "granted") return null;
  await ensureAndroidChannel();
  return readToken();
}

/** Triggers the OS prompt if needed, then returns the token (or null). */
export async function requestPermissionAndGetToken(): Promise<PushRegistration | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS !== "ios" && Platform.OS !== "android") return null;

  await ensureAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let granted = existing.granted;
  if (!granted && existing.canAskAgain) {
    const req = await Notifications.requestPermissionsAsync();
    granted = req.granted;
  }
  if (!granted) return null;
  return readToken();
}
