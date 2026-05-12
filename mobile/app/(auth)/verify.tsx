import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { requestOtp, verifyOtp } from "@/src/api/auth";
import { useAuth } from "@/src/auth/AuthContext";

const RESEND_SECONDS = 30;
const CODE_LENGTH = 6;

export default function Verify() {
  const { phone } = useLocalSearchParams<{ phone?: string }>();
  const { signIn } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resendIn, setResendIn] = useState(RESEND_SECONDS);
  const [resending, setResending] = useState(false);
  const submittedFor = useRef<string | null>(null);

  // Resend countdown.
  useEffect(() => {
    if (resendIn <= 0) return;
    const id = setInterval(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendIn]);

  const submit = useCallback(
    async (raw: string) => {
      if (!phone) {
        Alert.alert("Missing phone number.", "Go back and start over.");
        return;
      }
      const trimmed = raw.trim();
      if (trimmed.length < 4) {
        Alert.alert("Enter the code from your text message.");
        return;
      }
      if (submittedFor.current === trimmed) return; // already in-flight
      submittedFor.current = trimmed;
      setSubmitting(true);
      try {
        const r = await verifyOtp({
          phone,
          code: trimmed,
          deviceLabel: `${Platform.OS} mobile`,
        });
        await signIn({
          accessToken: r.accessToken,
          accessTokenExpiresAt: r.accessTokenExpiresAt,
          refreshToken: r.refreshToken,
          refreshTokenExpiresAt: r.refreshTokenExpiresAt,
        });
        router.replace("/(app)");
      } catch (err) {
        submittedFor.current = null;
        Alert.alert(
          "Could not verify code",
          err instanceof Error ? err.message : "Try again."
        );
      } finally {
        setSubmitting(false);
      }
    },
    [phone, signIn]
  );

  // Auto-submit when the user has typed 6 digits (covers iOS one-time-code
  // autofill from SMS).
  const onChangeCode = (next: string) => {
    const digits = next.replace(/\D+/g, "").slice(0, CODE_LENGTH);
    setCode(digits);
    if (digits.length === CODE_LENGTH && !submitting) {
      void submit(digits);
    }
  };

  const handleResend = async () => {
    if (!phone || resendIn > 0 || resending) return;
    setResending(true);
    try {
      await requestOtp(phone);
      setResendIn(RESEND_SECONDS);
      submittedFor.current = null;
      setCode("");
    } catch (err) {
      Alert.alert(
        "Could not resend",
        err instanceof Error ? err.message : "Try again shortly."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          Enter code
        </Text>
        <Text style={styles.subtitle}>
          We sent a 6-digit code to {phone ?? "your phone"}.
        </Text>

        <TextInput
          value={code}
          onChangeText={onChangeCode}
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={CODE_LENGTH}
          autoFocus
          editable={!submitting}
          style={styles.input}
          accessibilityLabel="One-time code"
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (submitting || pressed) && styles.buttonPressed,
          ]}
          disabled={submitting}
          onPress={() => void submit(code)}
          accessibilityRole="button"
          accessibilityLabel="Verify code"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Verify</Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleResend}
          disabled={resendIn > 0 || resending || submitting}
          accessibilityRole="button"
          accessibilityLabel={
            resendIn > 0
              ? `Resend code available in ${resendIn} seconds`
              : "Resend code"
          }
        >
          <Text
            style={[
              styles.linkText,
              (resendIn > 0 || resending) && styles.linkDisabled,
            ]}
          >
            {resending
              ? "Sending…"
              : resendIn > 0
                ? `Resend code in ${resendIn}s`
                : "Resend code"}
          </Text>
        </Pressable>

        <Pressable
          onPress={() => router.back()}
          disabled={submitting}
          accessibilityRole="button"
          accessibilityLabel="Use a different number"
        >
          <Text style={styles.linkText}>Use a different number</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flex: 1, paddingHorizontal: 24, paddingTop: 96, gap: 16 },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 15, color: "#555", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 14,
    fontSize: 22,
    letterSpacing: 6,
    textAlign: "center",
    minHeight: 56,
  },
  button: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
    minHeight: 50,
    justifyContent: "center",
  },
  buttonPressed: { opacity: 0.85 },
  buttonText: { color: "#fff", fontSize: 16, fontWeight: "600" },
  linkText: {
    textAlign: "center",
    color: "#0a66c2",
    marginTop: 8,
    paddingVertical: 8,
  },
  linkDisabled: { color: "#999" },
});
