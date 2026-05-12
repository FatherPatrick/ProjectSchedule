import {
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
} from "react-native";
import { useAuth } from "@/src/auth/AuthContext";
import { useSettings, useUpdateSettings } from "@/src/api/settings";
import { Screen } from "@/src/components/Screen";
import { ErrorState, LoadingState } from "@/src/components/State";
import { ALLOWED_GRANULARITIES } from "@/src/lib/granularity";

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const settings = useSettings();
  const update = useUpdateSettings();

  const onPickGranularity = (val: number) => {
    if (settings.data?.slotGranularityMin === val) return;
    update.mutate(
      { slotGranularityMin: val },
      { onError: (err) => Alert.alert("Could not save", err.message) }
    );
  };

  const onToggleAllowStartAtClose = (next: boolean) => {
    update.mutate(
      { allowStartAtClose: next },
      { onError: (err) => Alert.alert("Could not save", err.message) }
    );
  };

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Settings
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={settings.isFetching && !settings.isLoading}
            onRefresh={() => void settings.refetch()}
          />
        }
      >
        {settings.isLoading ? (
          <LoadingState />
        ) : settings.isError ? (
          <ErrorState
            message={(settings.error as Error)?.message ?? "Could not load settings."}
            onRetry={() => void settings.refetch()}
          />
        ) : (
          <>
            <Text style={styles.sectionTitle}>Booking interval</Text>
            <Text style={styles.help}>
              Spacing between offered start times in the public booker.
            </Text>
            <View style={styles.card}>
              {ALLOWED_GRANULARITIES.map((val) => {
                const selected = settings.data?.slotGranularityMin === val;
                return (
                  <Pressable
                    key={val}
                    onPress={() => onPickGranularity(val)}
                    disabled={update.isPending}
                    style={({ pressed }) => [
                      styles.optionRow,
                      pressed && styles.rowPressed,
                    ]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, disabled: update.isPending }}
                    accessibilityLabel={labelFor(val)}
                  >
                    <Text style={styles.optionLabel}>{labelFor(val)}</Text>
                    {selected ? <Text style={styles.checkmark}>✓</Text> : null}
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.sectionTitle}>Booking rules</Text>
            <View style={styles.card}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={styles.toggleLabel}>Allow start-at-close</Text>
                  <Text style={styles.toggleHint}>
                    Offer slots whose start time equals close time. Most shops
                    leave this off.
                  </Text>
                </View>
                <Switch
                  value={settings.data?.allowStartAtClose ?? false}
                  onValueChange={onToggleAllowStartAtClose}
                  disabled={update.isPending}
                />
              </View>
            </View>
          </>
        )}

        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Pressable
            onPress={() => {
              Alert.alert(
                "Sign out?",
                "You'll need your phone to sign back in.",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Sign out",
                    style: "destructive",
                    onPress: () => void signOut(),
                  },
                ]
              );
            }}
            style={({ pressed }) => [
              styles.signOutRow,
              pressed && styles.rowPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
          >
            <Text style={styles.signOutText}>Sign out</Text>
          </Pressable>
        </View>
      </ScrollView>
    </Screen>
  );
}

function labelFor(min: number): string {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} hr${h === 1 ? "" : "s"}` : `${h} hr ${m} min`;
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 40 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    marginTop: 12,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  help: { fontSize: 13, color: "#777", marginBottom: 8 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    overflow: "hidden",
  },
  optionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#eee",
  },
  optionLabel: { fontSize: 15 },
  checkmark: { color: "#0a66c2", fontWeight: "700", fontSize: 18 },
  rowPressed: { backgroundColor: "#f3f3f3" },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  toggleLabel: { fontSize: 15, fontWeight: "500" },
  toggleHint: { fontSize: 13, color: "#777", marginTop: 4 },

  signOutRow: { paddingVertical: 14, paddingHorizontal: 14, alignItems: "center", minHeight: 44 },
  signOutText: { color: "#b91c1c", fontWeight: "600", fontSize: 16 },
});
