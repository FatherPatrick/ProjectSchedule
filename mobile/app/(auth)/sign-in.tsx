import { router } from "expo-router";
import { useState } from "react";
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
import { requestOtp } from "@/api/auth";

export default function SignIn() {
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async () => {
    const trimmed = phone.trim();
    if (trimmed.length < 7) {
      Alert.alert("Enter your phone number first.");
      return;
    }
    setSubmitting(true);
    try {
      await requestOtp(trimmed);
      router.push({ pathname: "/(auth)/verify", params: { phone: trimmed } });
    } catch (err) {
      Alert.alert(
        "Could not send code",
        err instanceof Error ? err.message : "Try again shortly."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <View style={styles.container}>
        <Text style={styles.title} accessibilityRole="header">
          Admin sign in
        </Text>
        <Text style={styles.subtitle}>
          Enter your admin phone number. We&apos;ll text you a 6-digit code.
        </Text>

        <TextInput
          value={phone}
          onChangeText={setPhone}
          placeholder="Phone number"
          keyboardType="phone-pad"
          autoComplete="tel"
          autoFocus
          editable={!submitting}
          style={styles.input}
          accessibilityLabel="Phone number"
        />

        <Pressable
          style={({ pressed }) => [
            styles.button,
            (submitting || pressed) && styles.buttonPressed,
          ]}
          disabled={submitting}
          onPress={onSubmit}
          accessibilityRole="button"
          accessibilityLabel="Send verification code"
        >
          {submitting ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.buttonText}>Send code</Text>
          )}
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 96,
    gap: 16,
  },
  title: { fontSize: 28, fontWeight: "700" },
  subtitle: { fontSize: 15, color: "#555", marginBottom: 16 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 14,
    fontSize: 18,
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
});
