import { Redirect } from "expo-router";
import { ActivityIndicator, View } from "react-native";
import { useAuth } from "@/auth/AuthContext";

/**
 * Entry route. Decides where to send the user based on the persisted auth
 * state loaded by `<AuthProvider>`.
 */
export default function Index() {
  const { status } = useAuth();
  if (status === "loading") {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator />
      </View>
    );
  }
  return status === "signedIn" ? (
    <Redirect href="/(app)" />
  ) : (
    <Redirect href="/(auth)/sign-in" />
  );
}
