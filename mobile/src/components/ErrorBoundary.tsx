/**
 * Top-level error boundary for the mobile app.
 *
 * Wraps the provider tree in `app/_layout.tsx` so any render-time crash
 * inside QueryClient / Auth / Push / navigation surfaces a usable
 * "Something went wrong" screen with a retry button — instead of the
 * default red-box (dev) / blank-white-screen (prod) failure mode.
 *
 * Recovery is best-effort: tapping "Try again" clears the captured
 * error and re-renders children. If the underlying issue is sticky
 * (bad cached data, persistent provider failure), the boundary will
 * just re-trip on the next render — that's fine, the UI is still
 * usable and the user gets feedback.
 *
 * React Native does not have `componentDidCatch` for async/effect
 * errors, so this only catches synchronous render-phase failures.
 * Network / mutation errors should still be surfaced via React Query's
 * error states or local `try/catch` in handlers.
 */
import { Component, type ErrorInfo, type ReactNode } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface Props {
  children: ReactNode;
  /**
   * Optional logger hook so the host app can report to its observability
   * sink (e.g. Sentry). Called once per caught error.
   */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Always log so the dev console still shows the stack even after
    // the fallback UI takes over.
     
    console.error("[ErrorBoundary]", error, info.componentStack);
    this.props.onError?.(error, info);
  }

  reset = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <View style={styles.container} accessibilityRole="alert">
        <Text style={styles.title}>Something went wrong</Text>
        <Text style={styles.message} numberOfLines={4}>
          {error.message || "An unexpected error occurred."}
        </Text>
        <Pressable
          onPress={this.reset}
          style={({ pressed }) => [
            styles.button,
            pressed && styles.buttonPressed,
          ]}
          accessibilityRole="button"
          accessibilityLabel="Try again"
        >
          <Text style={styles.buttonText}>Try again</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "#fff",
  },
  title: {
    fontSize: 20,
    fontWeight: "600",
    marginBottom: 8,
    color: "#111",
  },
  message: {
    fontSize: 14,
    color: "#555",
    textAlign: "center",
    marginBottom: 24,
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#111",
  },
  buttonPressed: { opacity: 0.7 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "500" },
});
