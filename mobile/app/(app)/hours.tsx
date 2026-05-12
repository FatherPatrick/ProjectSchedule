import { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  type DayHours,
  useDeleteHoursOverride,
  useHours,
  useHoursSchedule,
  useSaveHours,
} from "@/src/api/hours";
import { Screen } from "@/src/components/Screen";
import {
  dayLabel,
  minutesToHHMM,
  parseHHMM,
} from "@/src/lib/format";

/**
 * Weekly defaults editor + read-only list of future overrides (with delete).
 * Adding a new override is intentionally deferred — it requires a date picker
 * + 7-day editor and isn't required for v1 admin parity.
 */
export default function HoursScreen() {
  const hours = useHours();
  const schedule = useHoursSchedule();
  const save = useSaveHours();
  const deleteOverride = useDeleteHoursOverride();

  const [draft, setDraft] = useState<DraftRow[] | null>(null);

  useEffect(() => {
    if (hours.data && draft === null) {
      setDraft(hours.data.map(toDraft));
    }
  }, [hours.data, draft]);

  const dirty = useMemo(() => {
    if (!draft || !hours.data) return false;
    return JSON.stringify(draft) !== JSON.stringify(hours.data.map(toDraft));
  }, [draft, hours.data]);

  const handleSave = () => {
    if (!draft) return;
    const out: DayHours[] = [];
    for (const row of draft) {
      const open = parseHHMM(row.open);
      const close = parseHHMM(row.close);
      if (open === null || close === null) {
        Alert.alert(
          `${dayLabel(row.dayOfWeek)}: invalid time`,
          "Use 24-hour HH:MM format (e.g. 09:00 or 17:30)."
        );
        return;
      }
      if (close < open) {
        Alert.alert(
          `${dayLabel(row.dayOfWeek)}: close before open`,
          "Close time must be at or after open time."
        );
        return;
      }
      out.push({
        dayOfWeek: row.dayOfWeek,
        openMin: open,
        closeMin: close,
        active: row.active,
      });
    }
    save.mutate(out, {
      onError: (err) => Alert.alert("Could not save", err.message),
    });
  };

  const handleResetDraft = () => {
    if (hours.data) setDraft(hours.data.map(toDraft));
  };

  const refreshing =
    (hours.isFetching && !hours.isLoading) ||
    (schedule.isFetching && !schedule.isLoading);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Business hours
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              void hours.refetch();
              void schedule.refetch();
            }}
          />
        }
      >
        <Text style={styles.sectionTitle}>Weekly defaults</Text>

        {hours.isLoading || !draft ? (
          <View style={styles.inlineCenter}>
            <ActivityIndicator />
          </View>
        ) : hours.isError ? (
          <Text style={styles.errorText}>
            {(hours.error as Error)?.message ?? "Could not load hours."}
          </Text>
        ) : (
          <View style={styles.card}>
            {draft.map((row, i) => (
              <DayRow
                key={row.dayOfWeek}
                row={row}
                disabled={save.isPending}
                onChange={(next) => {
                  setDraft((curr) => {
                    if (!curr) return curr;
                    const copy = [...curr];
                    copy[i] = next;
                    return copy;
                  });
                }}
              />
            ))}

            <View style={styles.buttonRow}>
              <Pressable
                onPress={handleResetDraft}
                disabled={!dirty || save.isPending}
                style={[styles.secondaryBtn, !dirty && styles.btnDisabled]}
              >
                <Text style={styles.secondaryBtnText}>Reset</Text>
              </Pressable>
              <Pressable
                onPress={handleSave}
                disabled={!dirty || save.isPending}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (!dirty || pressed) && styles.btnPressed,
                ]}
              >
                {save.isPending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Save</Text>
                )}
              </Pressable>
            </View>
          </View>
        )}

        <Text style={styles.sectionTitle}>Upcoming overrides</Text>
        <Text style={styles.help}>
          Overrides for specific future dates are managed from the web admin.
        </Text>

        {schedule.isLoading ? (
          <View style={styles.inlineCenter}>
            <ActivityIndicator />
          </View>
        ) : schedule.isError ? (
          <Text style={styles.errorText}>
            {(schedule.error as Error)?.message ?? "Could not load overrides."}
          </Text>
        ) : (schedule.data ?? []).length === 0 ? (
          <Text style={styles.emptyText}>None scheduled.</Text>
        ) : (
          <View style={styles.card}>
            {(schedule.data ?? []).map((o) => (
              <View key={o.effectiveFrom} style={styles.overrideRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.overrideDate}>{o.effectiveFrom}</Text>
                  {o.note ? (
                    <Text style={styles.overrideNote}>{o.note}</Text>
                  ) : null}
                </View>
                <Pressable
                  onPress={() => {
                    Alert.alert(
                      "Remove override?",
                      `All 7 day rows for ${o.effectiveFrom} will be deleted.`,
                      [
                        { text: "Cancel", style: "cancel" },
                        {
                          text: "Remove",
                          style: "destructive",
                          onPress: () => {
                            deleteOverride.mutate(o.effectiveFrom, {
                              onError: (err) =>
                                Alert.alert(
                                  "Could not remove",
                                  err.message
                                ),
                            });
                          },
                        },
                      ]
                    );
                  }}
                  hitSlop={10}
                  disabled={deleteOverride.isPending}
                >
                  <Text style={styles.removeText}>Remove</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </Screen>
  );
}

type DraftRow = {
  dayOfWeek: number;
  open: string;
  close: string;
  active: boolean;
};

function toDraft(d: DayHours): DraftRow {
  return {
    dayOfWeek: d.dayOfWeek,
    open: minutesToHHMM(d.openMin),
    close: minutesToHHMM(d.closeMin),
    active: d.active,
  };
}

function DayRow({
  row,
  onChange,
  disabled,
}: {
  row: DraftRow;
  onChange: (next: DraftRow) => void;
  disabled?: boolean;
}) {
  return (
    <View style={styles.dayRow}>
      <Text style={styles.dayLabel}>{dayLabel(row.dayOfWeek)}</Text>
      <Switch
        value={row.active}
        onValueChange={(v) => onChange({ ...row, active: v })}
        disabled={disabled}
      />
      <TextInput
        value={row.open}
        onChangeText={(v) => onChange({ ...row, open: v })}
        placeholder="09:00"
        editable={!disabled && row.active}
        style={[styles.timeInput, !row.active && styles.timeInputDisabled]}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
      <Text style={styles.dash}>–</Text>
      <TextInput
        value={row.close}
        onChangeText={(v) => onChange({ ...row, close: v })}
        placeholder="18:00"
        editable={!disabled && row.active}
        style={[styles.timeInput, !row.active && styles.timeInputDisabled]}
        keyboardType="numbers-and-punctuation"
        maxLength={5}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: "700" },
  scroll: { padding: 16, paddingBottom: 40, gap: 8 },

  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    color: "#666",
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  help: { fontSize: 13, color: "#777", marginBottom: 8 },

  card: {
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    padding: 12,
    gap: 8,
  },

  dayRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  dayLabel: { width: 36, fontWeight: "600" },
  timeInput: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 15,
    minWidth: 70,
    textAlign: "center",
    backgroundColor: "#fff",
  },
  timeInputDisabled: { backgroundColor: "#f3f3f3", color: "#999" },
  dash: { fontSize: 16, color: "#888" },

  buttonRow: { flexDirection: "row", gap: 12, marginTop: 8 },
  primaryBtn: {
    flex: 1,
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 15 },
  btnPressed: { opacity: 0.85 },
  btnDisabled: { opacity: 0.4 },
  secondaryBtn: {
    flex: 1,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryBtnText: { color: "#333", fontWeight: "600", fontSize: 15 },

  overrideRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  overrideDate: { fontSize: 15, fontWeight: "600" },
  overrideNote: { fontSize: 13, color: "#666", marginTop: 2 },
  removeText: { color: "#b91c1c", fontWeight: "600" },

  inlineCenter: { padding: 24, alignItems: "center" },
  errorText: { color: "#b91c1c", textAlign: "center", paddingVertical: 12 },
  emptyText: { color: "#888", textAlign: "center", paddingVertical: 12 },
});
