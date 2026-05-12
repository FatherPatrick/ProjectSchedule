import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import {
  useAppointments,
  type AppointmentDTO,
} from "@/src/api/appointments";
import { AppointmentDetailModal } from "@/src/components/AppointmentDetailModal";
import { Screen } from "@/src/components/Screen";
import { EmptyState, ErrorState, LoadingState } from "@/src/components/State";
import {
  addDays,
  formatDayHeader,
  formatShortDay,
  formatTime,
  sameLocalDay,
  startOfLocalDay,
} from "@/src/lib/dates";

const VISIBLE_DAYS = 14;

export default function Calendar() {
  const params = useLocalSearchParams<{ appointmentId?: string }>();
  const [selected, setSelected] = useState<Date>(() => startOfLocalDay(new Date()));
  const [openId, setOpenId] = useState<string | null>(null);

  // Always fetch a 14-day window starting today; React Query cache keys it by
  // the ISO range so day-switches inside the window are instant.
  const { range, days } = useMemo(() => {
    const start = startOfLocalDay(new Date());
    return {
      range: { from: start, to: addDays(start, VISIBLE_DAYS) },
      days: Array.from({ length: VISIBLE_DAYS }, (_, i) => addDays(start, i)),
    };
  }, []);

  const query = useAppointments(range);

  // Open the detail modal when navigated here with `?appointmentId=...`
  // (e.g. from a push notification tap). Switches the day strip to the
  // appointment's date so the row is visible behind the modal.
  useEffect(() => {
    const id = params.appointmentId;
    if (!id) return;
    const appt = (query.data ?? []).find((a) => a.id === id);
    if (!appt) return;
    setOpenId(id);
    setSelected(startOfLocalDay(new Date(appt.startsAt)));
    // Clear the param so navigating away + back doesn't re-open it.
    router.setParams({ appointmentId: undefined });
  }, [params.appointmentId, query.data]);

  const visible = useMemo(() => {
    const all = query.data ?? [];
    return all
      .filter((a) => sameLocalDay(new Date(a.startsAt), selected))
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }, [query.data, selected]);

  const pendingCount = useMemo(
    () => (query.data ?? []).filter((a) => a.status === "PENDING").length,
    [query.data]
  );

  return (
    <Screen>
      <View style={styles.header}>
        <View>
          <Text style={styles.title} accessibilityRole="header">
            {formatDayHeader(selected)}
          </Text>
          {pendingCount > 0 ? (
            <Text style={styles.pendingHint}>
              {pendingCount} pending request{pendingCount === 1 ? "" : "s"} in
              the next {VISIBLE_DAYS} days
            </Text>
          ) : null}
        </View>
      </View>

      <DayStrip days={days} selected={selected} onSelect={setSelected} />

      {query.isLoading ? (
        <LoadingState />
      ) : query.isError ? (
        <ErrorState
          message={(query.error as Error)?.message ?? "Could not load appointments."}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <FlatList
          data={visible}
          keyExtractor={(a) => a.id}
          contentContainerStyle={
            visible.length === 0 ? styles.emptyContainer : styles.listContainer
          }
          ListEmptyComponent={
            <EmptyState
              title="Nothing scheduled"
              description="No appointments on this day."
            />
          }
          renderItem={({ item }) => (
            <AppointmentRow
              appt={item}
              onPress={() => setOpenId(item.id)}
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

      <AppointmentDetailModal
        appt={(query.data ?? []).find((a) => a.id === openId) ?? null}
        onClose={() => setOpenId(null)}
      />
    </Screen>
  );
}

function DayStrip({
  days,
  selected,
  onSelect,
}: {
  days: Date[];
  selected: Date;
  onSelect: (d: Date) => void;
}) {
  return (
    <FlatList
      data={days}
      horizontal
      keyExtractor={(d) => d.toISOString()}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.stripContainer}
      renderItem={({ item }) => {
        const isSelected = sameLocalDay(item, selected);
        const { weekday, day } = formatShortDay(item);
        return (
          <Pressable
            onPress={() => onSelect(item)}
            style={[styles.dayPill, isSelected && styles.dayPillSelected]}
            accessibilityRole="button"
            accessibilityState={{ selected: isSelected }}
            accessibilityLabel={`${weekday} ${day}`}
          >
            <Text
              style={[
                styles.dayPillWeekday,
                isSelected && styles.dayPillTextSelected,
              ]}
            >
              {weekday}
            </Text>
            <Text
              style={[
                styles.dayPillDay,
                isSelected && styles.dayPillTextSelected,
              ]}
            >
              {day}
            </Text>
          </Pressable>
        );
      }}
    />
  );
}

function AppointmentRow({
  appt,
  onPress,
}: {
  appt: AppointmentDTO;
  onPress: () => void;
}) {
  const start = new Date(appt.startsAt);
  const end = new Date(appt.endsAt);
  const isPending = appt.status === "PENDING";
  const isCancelled = appt.status === "CANCELLED";

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        isPending && styles.rowPending,
        isCancelled && styles.rowCancelled,
        pressed && styles.rowPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${appt.client.name}, ${appt.service.name} at ${formatTime(start)}${isPending ? ", pending" : isCancelled ? ", cancelled" : ""}`}
      accessibilityHint="Opens appointment details"
    >
      <View style={styles.rowTime}>
        <Text style={styles.rowTimeText}>{formatTime(start)}</Text>
        <Text style={styles.rowTimeMuted}>{formatTime(end)}</Text>
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowName}>{appt.client.name}</Text>
        <Text style={styles.rowMeta}>
          {appt.service.name}
          {isPending ? " · Pending" : ""}
          {isCancelled ? " · Cancelled" : ""}
        </Text>
        {appt.notes ? (
          <Text style={styles.rowNotes} numberOfLines={2}>
            “{appt.notes}”
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  title: { fontSize: 22, fontWeight: "700" },
  pendingHint: { fontSize: 13, color: "#a16207", marginTop: 2 },

  stripContainer: { paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  dayPill: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e5e5e5",
    alignItems: "center",
    minWidth: 56,
    minHeight: 60,
    justifyContent: "center",
  },
  dayPillSelected: { backgroundColor: "#111", borderColor: "#111" },
  dayPillWeekday: { fontSize: 11, color: "#777", fontWeight: "600" },
  dayPillDay: { fontSize: 18, fontWeight: "700", color: "#111" },
  dayPillTextSelected: { color: "#fff" },

  listContainer: { paddingHorizontal: 16, paddingBottom: 24, gap: 8 },
  emptyContainer: { flexGrow: 1 },

  row: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e5e5e5",
    padding: 12,
    gap: 12,
  },
  rowPending: { borderColor: "#fbbf24", backgroundColor: "#fffbeb" },
  rowCancelled: { opacity: 0.55 },
  rowPressed: { opacity: 0.85 },
  rowTime: { width: 70 },
  rowTimeText: { fontSize: 14, fontWeight: "700" },
  rowTimeMuted: { fontSize: 12, color: "#777", marginTop: 2 },
  rowBody: { flex: 1 },
  rowName: { fontSize: 16, fontWeight: "600" },
  rowMeta: { fontSize: 13, color: "#555", marginTop: 2 },
  rowNotes: { fontSize: 13, color: "#444", marginTop: 6, fontStyle: "italic" },
});
