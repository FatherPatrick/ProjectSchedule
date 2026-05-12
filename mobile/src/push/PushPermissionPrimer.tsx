/**
 * In-app primer that appears once after sign-in (on iOS / Android physical
 * devices) before we ask the OS for notification permission. Most users
 * dismiss the system dialog reflexively; the primer explains *why* the app
 * needs pushes, so the system prompt sees a more informed user.
 *
 * State machine (computed by the parent):
 * - `hidden` → don't render
 * - `visible` → render modal; user picks "Enable" or "Not now"
 *
 * Persistence ("not now") lives in the parent via SecureStore so we re-prompt
 * on the next sign-in but not on every cold launch.
 */
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

export function PushPermissionPrimer({
  visible,
  onEnable,
  onDismiss,
  busy,
}: {
  visible: boolean;
  onEnable: () => void;
  onDismiss: () => void;
  busy?: boolean;
}) {
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={busy ? undefined : onDismiss}
    >
      <View style={styles.backdrop}>
        <View
          style={styles.card}
          accessibilityViewIsModal
          accessibilityLabel="Enable notifications"
        >
          <Text style={styles.title}>Get pinged for new bookings</Text>
          <Text style={styles.body}>
            Turn on notifications so this device alerts you the moment a new
            appointment request comes in or a client cancels.
          </Text>
          <Text style={styles.bodyMuted}>
            You can change this any time in your phone&apos;s Settings.
          </Text>

          <Pressable
            style={({ pressed }) => [
              styles.primary,
              (busy || pressed) && styles.pressed,
            ]}
            disabled={busy}
            onPress={onEnable}
            accessibilityRole="button"
            accessibilityLabel="Enable notifications"
          >
            <Text style={styles.primaryText}>Enable notifications</Text>
          </Pressable>
          <Pressable
            style={styles.secondary}
            disabled={busy}
            onPress={onDismiss}
            accessibilityRole="button"
            accessibilityLabel="Not now"
          >
            <Text style={styles.secondaryText}>Not now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 380,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 22,
    gap: 10,
  },
  title: { fontSize: 18, fontWeight: "700" },
  body: { fontSize: 14, color: "#333", lineHeight: 20 },
  bodyMuted: { fontSize: 13, color: "#777", marginBottom: 6 },
  primary: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
    marginTop: 4,
  },
  primaryText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  secondary: {
    paddingVertical: 12,
    alignItems: "center",
    minHeight: 44,
    justifyContent: "center",
  },
  secondaryText: { color: "#555", fontWeight: "500", fontSize: 15 },
  pressed: { opacity: 0.85 },
});
