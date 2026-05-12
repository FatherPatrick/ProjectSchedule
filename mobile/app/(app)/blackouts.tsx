import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
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
  type BlackoutDTO,
  useBlackouts,
  useCreateBlackout,
  useDeleteBlackout,
} from "@/api/blackouts";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingState } from "@/components/State";
import {
  formatDayHeader,
  formatTime,
  sameLocalDay,
} from "@/lib/dates";
import { isValidYMD, parseHHMM, todayYMD } from "@/lib/format";

export default function BlackoutsScreen() {
  const query = useBlackouts();
  const remove = useDeleteBlackout();
  const [adding, setAdding] = useState(false);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Blackouts
        </Text>
        <Pressable
          onPress={() => setAdding(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Add blackout"
        >
          <Text style={styles.addLink}>+ Add</Text>
        </Pressable>
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error)?.message ?? "Could not load blackouts."}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={query.data ?? []}
          keyExtractor={(b) => b.id}
          contentContainerStyle={
            (query.data ?? []).length === 0
              ? styles.emptyContainer
              : styles.listContainer
          }
          ListEmptyComponent={
            <EmptyState
              title="No upcoming blackouts"
              description="Add a blackout to make a date range unbookable."
              action={{ label: "Add blackout", onPress: () => setAdding(true) }}
            />
          }
          renderItem={({ item }) => (
            <BlackoutRow
              item={item}
              onDelete={() => {
                Alert.alert(
                  "Remove this blackout?",
                  "Slots in this window will become bookable again.",
                  [
                    { text: "Cancel", style: "cancel" },
                    {
                      text: "Remove",
                      style: "destructive",
                      onPress: () => {
                        remove.mutate(item.id, {
                          onError: (err) =>
                            Alert.alert("Could not remove", err.message),
                        });
                      },
                    },
                  ]
                );
              }}
            />
          )}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching && !query.isLoading}
              onRefresh={() => void query.refetch()}
            />
          }
        />
      )}

      <BlackoutEditor open={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}

function BlackoutRow({
  item,
  onDelete,
}: {
  item: BlackoutDTO;
  onDelete: () => void;
}) {
  const start = new Date(item.startsAt);
  const end = new Date(item.endsAt);
  const sameDay = sameLocalDay(start, end);

  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{formatDayHeader(start)}</Text>
        <Text style={styles.rowMeta}>
          {sameDay
            ? `${formatTime(start)} – ${formatTime(end)}`
            : `${formatTime(start)} → ${formatDayHeader(end)} ${formatTime(end)}`}
        </Text>
        {item.reason ? (
          <Text style={styles.rowReason}>{item.reason}</Text>
        ) : null}
      </View>
      <Pressable onPress={onDelete} hitSlop={10}>
        <Text style={styles.removeText}>Remove</Text>
      </Pressable>
    </View>
  );
}

function BlackoutEditor({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const create = useCreateBlackout();
  const [fromDay, setFromDay] = useState(todayYMD());
  const [toDay, setToDay] = useState(todayYMD());
  const [allDay, setAllDay] = useState(true);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("17:00");
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (open) {
      const today = todayYMD();
      setFromDay(today);
      setToDay(today);
      setAllDay(true);
      setStartTime("09:00");
      setEndTime("17:00");
      setReason("");
    }
  }, [open]);

  const busy = create.isPending;

  const handleCreate = () => {
    if (!isValidYMD(fromDay) || !isValidYMD(toDay)) {
      Alert.alert("Invalid date", "Use YYYY-MM-DD format.");
      return;
    }
    if (toDay < fromDay) {
      Alert.alert("Invalid range", "End date must be on or after start date.");
      return;
    }
    if (!allDay) {
      const s = parseHHMM(startTime);
      const e = parseHHMM(endTime);
      if (s === null || e === null) {
        Alert.alert("Invalid time", "Use HH:MM (e.g. 09:00).");
        return;
      }
      if (fromDay === toDay && e <= s) {
        Alert.alert("Invalid time", "End time must be after start time.");
        return;
      }
    }

    create.mutate(
      {
        fromDay,
        toDay,
        allDay,
        startTime: allDay ? null : startTime,
        endTime: allDay ? null : endTime,
        reason: reason.trim() ? reason.trim() : null,
      },
      {
        onSuccess: onClose,
        onError: (err) => Alert.alert("Could not create", err.message),
      }
    );
  };

  return (
    <Modal
      visible={open}
      animationType="slide"
      transparent
      onRequestClose={busy ? undefined : onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>New blackout</Text>

              <View style={styles.row2}>
                <Field label="From (YYYY-MM-DD)" style={{ flex: 1 }}>
                  <TextInput
                    value={fromDay}
                    onChangeText={setFromDay}
                    style={styles.input}
                    editable={!busy}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
                <Field label="To (YYYY-MM-DD)" style={{ flex: 1 }}>
                  <TextInput
                    value={toDay}
                    onChangeText={setToDay}
                    style={styles.input}
                    editable={!busy}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </Field>
              </View>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>All day</Text>
                <Switch value={allDay} onValueChange={setAllDay} disabled={busy} />
              </View>

              {!allDay ? (
                <View style={styles.row2}>
                  <Field label="Start (HH:MM)" style={{ flex: 1 }}>
                    <TextInput
                      value={startTime}
                      onChangeText={setStartTime}
                      style={styles.input}
                      editable={!busy}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </Field>
                  <Field label="End (HH:MM)" style={{ flex: 1 }}>
                    <TextInput
                      value={endTime}
                      onChangeText={setEndTime}
                      style={styles.input}
                      editable={!busy}
                      keyboardType="numbers-and-punctuation"
                      maxLength={5}
                    />
                  </Field>
                </View>
              ) : null}

              <Field label="Reason (optional)">
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  style={styles.input}
                  editable={!busy}
                  placeholder="Vacation"
                  maxLength={200}
                />
              </Field>

              <Pressable
                onPress={handleCreate}
                disabled={busy}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (busy || pressed) && styles.btnPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>Create</Text>
                )}
              </Pressable>
              <Pressable
                onPress={onClose}
                disabled={busy}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Cancel</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Field({
  label,
  children,
  style,
}: {
  label: string;
  children: React.ReactNode;
  style?: object;
}) {
  return (
    <View style={[{ marginBottom: 12 }, style]}>
      <Text style={styles.fieldLabel}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  title: { fontSize: 22, fontWeight: "700" },
  addLink: { color: "#0a66c2", fontWeight: "600", fontSize: 16, paddingVertical: 8 },

  listContainer: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  emptyContainer: { flexGrow: 1 },

  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    padding: 14,
    gap: 8,
  },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowMeta: { fontSize: 13, color: "#555", marginTop: 2 },
  rowReason: { fontSize: 13, color: "#666", marginTop: 6, fontStyle: "italic" },
  removeText: { color: "#b91c1c", fontWeight: "600", paddingVertical: 8, paddingHorizontal: 4 },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: "92%",
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", marginBottom: 12 },

  fieldLabel: { fontSize: 13, color: "#555", marginBottom: 6, fontWeight: "600" },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    backgroundColor: "#fff",
  },
  row2: { flexDirection: "row", gap: 12 },

  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
  },
  toggleLabel: { fontSize: 16, fontWeight: "500" },

  primaryBtn: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  primaryBtnText: { color: "#fff", fontWeight: "600", fontSize: 16 },
  btnPressed: { opacity: 0.85 },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelBtnText: { color: "#555", fontSize: 15 },
});
