import { useEffect, useMemo, useState } from "react";
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
  type ServiceDTO,
  useCreateService,
  useDeleteService,
  useServices,
  useUpdateService,
} from "@/api/services";
import { Screen } from "@/components/Screen";
import { EmptyState, ErrorState, LoadingState } from "@/components/State";
import { formatDuration, formatPrice } from "@/lib/format";

export default function ServicesScreen() {
  const query = useServices();
  const [editing, setEditing] = useState<ServiceDTO | "new" | null>(null);

  const sorted = useMemo(() => {
    const list = query.data ?? [];
    return [...list].sort(
      (a, b) =>
        Number(b.active) - Number(a.active) ||
        a.sortOrder - b.sortOrder ||
        a.name.localeCompare(b.name)
    );
  }, [query.data]);

  return (
    <Screen>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Services
        </Text>
        <Pressable
          onPress={() => setEditing("new")}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Add service"
        >
          <Text style={styles.addLink}>+ Add</Text>
        </Pressable>
      </View>

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error)?.message ?? "Could not load services."}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={sorted}
          keyExtractor={(s) => s.id}
          contentContainerStyle={
            sorted.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          ListEmptyComponent={
            <EmptyState
              title="No services yet"
              description={'Tap "+ Add" to create your first service.'}
              action={{ label: "Add service", onPress: () => setEditing("new") }}
            />
          }
          renderItem={({ item }) => (
            <ServiceRow svc={item} onPress={() => setEditing(item)} />
          )}
          refreshControl={
            <RefreshControl
              refreshing={query.isFetching && !query.isLoading}
              onRefresh={() => void query.refetch()}
            />
          }
        />
      )}

      <ServiceEditor
        target={editing}
        onClose={() => setEditing(null)}
      />
    </Screen>
  );
}

function ServiceRow({ svc, onPress }: { svc: ServiceDTO; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        !svc.active && styles.rowInactive,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${svc.name}, ${formatDuration(svc.durationMinutes)}, ${formatPrice(svc.priceCents)}${!svc.active ? ", inactive" : ""}`}
      accessibilityHint="Opens editor"
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName}>{svc.name}</Text>
        <Text style={styles.rowMeta}>
          {formatDuration(svc.durationMinutes)} · {formatPrice(svc.priceCents)}
          {!svc.active ? " · Inactive" : ""}
        </Text>
        {svc.description ? (
          <Text style={styles.rowDesc} numberOfLines={2}>
            {svc.description}
          </Text>
        ) : null}
      </View>
      <Text style={styles.chevron}>›</Text>
    </Pressable>
  );
}

function ServiceEditor({
  target,
  onClose,
}: {
  target: ServiceDTO | "new" | null;
  onClose: () => void;
}) {
  const create = useCreateService();
  const update = useUpdateService();
  const remove = useDeleteService();

  const isNew = target === "new";
  const existing = target && target !== "new" ? target : null;

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [hours, setHours] = useState("0");
  const [minutes, setMinutes] = useState("30");
  const [priceDollars, setPriceDollars] = useState("0");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (target === null) return;
    if (isNew) {
      setName("");
      setDescription("");
      setHours("0");
      setMinutes("30");
      setPriceDollars("0");
      setActive(true);
    } else if (existing) {
      setName(existing.name);
      setDescription(existing.description ?? "");
      const h = Math.floor(existing.durationMinutes / 60);
      const m = existing.durationMinutes % 60;
      setHours(String(h));
      setMinutes(String(m));
      setPriceDollars((existing.priceCents / 100).toFixed(2));
      setActive(existing.active);
    }
  }, [target, isNew, existing]);

  const busy = create.isPending || update.isPending || remove.isPending;

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert("Name is required.");
      return;
    }
    const h = Number(hours);
    const m = Number(minutes);
    const dur = (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
    if (dur < 5) {
      Alert.alert("Duration must be at least 5 minutes.");
      return;
    }
    const priceNum = Number(priceDollars);
    if (!Number.isFinite(priceNum) || priceNum < 0) {
      Alert.alert("Price must be a non-negative number.");
      return;
    }
    const priceCents = Math.round(priceNum * 100);

    const payload = {
      name: trimmed,
      description: description.trim() ? description.trim() : null,
      durationMinutes: dur,
      priceCents,
      active,
    };

    if (isNew) {
      create.mutate(payload, {
        onSuccess: onClose,
        onError: (err) => Alert.alert("Could not create", err.message),
      });
    } else if (existing) {
      update.mutate(
        { id: existing.id, patch: payload },
        {
          onSuccess: onClose,
          onError: (err) => Alert.alert("Could not save", err.message),
        }
      );
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert(
      "Delete this service?",
      "This is permanent. Future bookings using this service will fail. Consider toggling it inactive instead.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            remove.mutate(existing.id, {
              onSuccess: onClose,
              onError: (err) => Alert.alert("Could not delete", err.message),
            });
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={target !== null}
      animationType="slide"
      transparent
      onRequestClose={busy ? undefined : onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable
          style={styles.sheet}
          onPress={(e) => e.stopPropagation()}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
          >
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sheetTitle}>
                {isNew ? "New service" : "Edit service"}
              </Text>

              <Field label="Name">
                <TextInput
                  value={name}
                  onChangeText={setName}
                  style={styles.input}
                  editable={!busy}
                  placeholder="Gel manicure"
                />
              </Field>

              <Field label="Description (optional)">
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  style={[styles.input, styles.inputMultiline]}
                  editable={!busy}
                  multiline
                  numberOfLines={3}
                />
              </Field>

              <View style={styles.row2}>
                <Field label="Hours" style={{ flex: 1 }}>
                  <TextInput
                    value={hours}
                    onChangeText={setHours}
                    keyboardType="number-pad"
                    style={styles.input}
                    editable={!busy}
                  />
                </Field>
                <Field label="Minutes" style={{ flex: 1 }}>
                  <TextInput
                    value={minutes}
                    onChangeText={setMinutes}
                    keyboardType="number-pad"
                    style={styles.input}
                    editable={!busy}
                  />
                </Field>
              </View>

              <Field label="Price (USD)">
                <TextInput
                  value={priceDollars}
                  onChangeText={setPriceDollars}
                  keyboardType="decimal-pad"
                  style={styles.input}
                  editable={!busy}
                />
              </Field>

              <View style={styles.toggleRow}>
                <Text style={styles.toggleLabel}>Active</Text>
                <Switch value={active} onValueChange={setActive} disabled={busy} />
              </View>

              <Pressable
                onPress={handleSave}
                disabled={busy}
                style={({ pressed }) => [
                  styles.primaryBtn,
                  (busy || pressed) && styles.btnPressed,
                ]}
              >
                {busy ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {isNew ? "Create" : "Save"}
                  </Text>
                )}
              </Pressable>

              {!isNew && existing ? (
                <Pressable
                  onPress={handleDelete}
                  disabled={busy}
                  style={({ pressed }) => [
                    styles.dangerBtn,
                    (busy || pressed) && styles.btnPressed,
                  ]}
                >
                  <Text style={styles.dangerBtnText}>Delete</Text>
                </Pressable>
              ) : null}

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
  rowInactive: { opacity: 0.55 },
  rowPressed: { opacity: 0.85 },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowMeta: { fontSize: 13, color: "#555", marginTop: 2 },
  rowDesc: { fontSize: 13, color: "#666", marginTop: 6 },
  chevron: { fontSize: 22, color: "#bbb" },

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
  inputMultiline: { minHeight: 70, textAlignVertical: "top" },
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
  dangerBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#b91c1c",
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 12,
  },
  dangerBtnText: { color: "#b91c1c", fontWeight: "600" },
  btnPressed: { opacity: 0.85 },
  cancelBtn: { paddingVertical: 14, alignItems: "center", marginTop: 4 },
  cancelBtnText: { color: "#555", fontSize: 15 },
});
