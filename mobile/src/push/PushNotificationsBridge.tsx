/**
 * Wires `expo-notifications` lifecycle:
 *
 * 1. Sets the foreground handler (banner + sound when app is open).
 * 2. After sign-in, checks notification permission status.
 *    - If granted, silently fetch the Expo token and POST it to the server.
 *    - If undetermined and we haven't asked-and-been-dismissed this session,
 *      show an in-app primer; only call into the OS prompt if the user
 *      taps "Enable".
 *    - If denied, do nothing (user can re-enable from OS settings).
 * 3. Listens for the user tapping a notification; if the payload carries
 *    `data.appointmentId`, navigates to the Calendar tab so the screen can
 *    open the detail modal.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { registerPushToken } from "@/api/push";
import {
  getPushPermissionStatus,
  getPushTokenIfGranted,
  requestPermissionAndGetToken,
  type PushRegistration,
} from "./getExpoPushToken";
import { PushPermissionPrimer } from "./PushPermissionPrimer";

const PRIMER_DISMISSED_KEY = "mobile.pushPrimerDismissedAt";
/** How long after dismissing the primer before we'll show it again. */
const PRIMER_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Foreground display handler — applies regardless of auth state.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export function PushNotificationsBridge() {
  const auth = useAuth();
  const lastRegisteredToken = useRef<string | null>(null);
  const [primerVisible, setPrimerVisible] = useState(false);
  const [primerBusy, setPrimerBusy] = useState(false);

  const tryRegister = useCallback(
    async (reg: PushRegistration) => {
      if (lastRegisteredToken.current === reg.pushToken) return;
      try {
        await registerPushToken(auth, reg);
        lastRegisteredToken.current = reg.pushToken;
      } catch (err) {
        console.warn("[push] register failed", err);
      }
    },
    [auth]
  );

  // On sign-in: silently register if already granted, else maybe show primer.
  useEffect(() => {
    if (auth.status !== "signedIn") {
      lastRegisteredToken.current = null;
      setPrimerVisible(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      const status = await getPushPermissionStatus();
      if (cancelled) return;
      if (status === "granted") {
        const reg = await getPushTokenIfGranted();
        if (!cancelled && reg) await tryRegister(reg);
        return;
      }
      if (status !== "undetermined") return; // unsupported or denied
      const dismissedAt = await SecureStore.getItemAsync(PRIMER_DISMISSED_KEY);
      if (cancelled) return;
      const recent =
        dismissedAt &&
        Date.now() - Number(dismissedAt) < PRIMER_COOLDOWN_MS;
      if (recent) return;
      setPrimerVisible(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [auth.status, tryRegister]);

  const handleEnable = useCallback(() => {
    setPrimerBusy(true);
    void (async () => {
      try {
        const reg = await requestPermissionAndGetToken();
        if (reg) {
          await tryRegister(reg);
          // Clear any stale "dismissed" flag now that we're enabled.
          await SecureStore.deleteItemAsync(PRIMER_DISMISSED_KEY);
        } else {
          // User declined the OS prompt — record so we don't immediately re-ask.
          await SecureStore.setItemAsync(
            PRIMER_DISMISSED_KEY,
            String(Date.now())
          );
        }
      } finally {
        setPrimerBusy(false);
        setPrimerVisible(false);
      }
    })();
  }, [tryRegister]);

  const handleDismiss = useCallback(() => {
    setPrimerVisible(false);
    void SecureStore.setItemAsync(
      PRIMER_DISMISSED_KEY,
      String(Date.now())
    ).catch(() => undefined);
  }, []);

  // Tap-to-deep-link.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const data = response.notification.request.content.data as
          | { appointmentId?: string }
          | undefined;
        const id = data?.appointmentId;
        if (typeof id === "string" && id.length > 0) {
          router.push({
            pathname: "/(app)",
            params: { appointmentId: id },
          });
        }
      }
    );
    return () => sub.remove();
  }, []);

  return (
    <PushPermissionPrimer
      visible={primerVisible}
      busy={primerBusy}
      onEnable={handleEnable}
      onDismiss={handleDismiss}
    />
  );
}
