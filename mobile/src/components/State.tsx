/**
 * Shared visual primitives for screen-level loading / empty / error states.
 * Each one fills the available space and centers content. Use inside a
 * `<Screen>` wrapper so they sit below the status bar safe area.
 */
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";

export function LoadingState({ label }: { label?: string }) {
  return (
    <View
      style={styles.center}
      accessibilityRole="progressbar"
      accessibilityLabel={label ?? "Loading"}
    >
      <ActivityIndicator />
      {label ? <Text style={styles.helperText}>{label}</Text> : null}
    </View>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: { label: string; onPress: () => void };
}) {
  return (
    <View style={styles.center} accessibilityRole="summary">
      <Text style={styles.emptyTitle}>{title}</Text>
      {description ? (
        <Text style={styles.emptyText}>{description}</Text>
      ) : null}
      {action ? (
        <Pressable
          onPress={action.onPress}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel={action.label}
        >
          <Text style={styles.buttonText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function ErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <Pressable
          onPress={onRetry}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Retry"
        >
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 12,
  },
  emptyTitle: { fontSize: 16, fontWeight: "600", color: "#333" },
  emptyText: { fontSize: 14, color: "#777", textAlign: "center" },
  helperText: { fontSize: 13, color: "#777" },
  errorText: {
    color: "#b91c1c",
    textAlign: "center",
    fontSize: 14,
  },
  button: {
    backgroundColor: "#111",
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 8,
    minHeight: 44,
    minWidth: 88,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontWeight: "600" },
});
