import { useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useApproveAppointment,
  useCancelAppointment,
  type AppointmentDTO,
} from "@/src/api/appointments";
import { formatDayHeader, formatTime } from "@/src/lib/dates";

type Props = {
  appt: AppointmentDTO | null;
  onClose: () => void;
};

/**
 * Bottom-sheet style detail modal for an appointment. Admin can approve a
 * pending request, cancel a confirmed one, or call/text the client. Cancelled
 * appointments are read-only.
 */
export function AppointmentDetailModal({ appt, onClose }: Props) {
  const approve = useApproveAppointment();
  const cancel = useCancelAppointment();
  const [cancelMessage, setCancelMessage] = useState("");
  const busy = approve.isPending || cancel.isPending;

  const handleApprove = () => {
    if (!appt) return;
    approve.mutate(
      { id: appt.id },
      {
        onSuccess: onClose,
        onError: (err) => Alert.alert("Couldn't approve", err.message),
      }
    );
  };

  const handleCancel = () => {
    if (!appt) return;
    const isPending = appt.status === "PENDING";
    Alert.alert(
      isPending ? "Decline this request?" : "Cancel this appointment?",
      isPending
        ? "The client will be notified if you included a message."
        : "The client will be notified by email and SMS.",
      [
        { text: "Keep", style: "cancel" },
        {
          text: isPending ? "Decline" : "Cancel",
          style: "destructive",
          onPress: () => {
            cancel.mutate(
              { id: appt.id, message: cancelMessage },
              {
                onSuccess: () => {
                  setCancelMessage("");
                  onClose();
                },
                onError: (err) => Alert.alert("Couldn't cancel", err.message),
              }
            );
          },
        },
      ]
    );
  };

  return (
    <Modal
      visible={appt !== null}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={busy ? undefined : onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {appt ? <Body
            appt={appt}
            cancelMessage={cancelMessage}
            setCancelMessage={setCancelMessage}
            busy={busy}
            onApprove={handleApprove}
            onCancel={handleCancel}
            onClose={onClose}
          /> : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Body({
  appt,
  cancelMessage,
  setCancelMessage,
  busy,
  onApprove,
  onCancel,
  onClose,
}: {
  appt: AppointmentDTO;
  cancelMessage: string;
  setCancelMessage: (s: string) => void;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
  onClose: () => void;
}) {
  const start = new Date(appt.startsAt);
  const end = new Date(appt.endsAt);
  const isPending = appt.status === "PENDING";
  const isCancelled = appt.status === "CANCELLED";
  const canCancel = appt.status === "CONFIRMED" || isPending;

  const callClient = () => {
    if (appt.client.phone) Linking.openURL(`tel:${appt.client.phone}`);
  };
  const textClient = () => {
    if (appt.client.phone) Linking.openURL(`sms:${appt.client.phone}`);
  };

  return (
    <ScrollView contentContainerStyle={styles.sheetContent} keyboardShouldPersistTaps="handled">
      <View style={styles.handle} />

      <Text style={styles.title} accessibilityRole="header">
        {appt.client.name}
      </Text>
      <Text style={styles.meta}>
        {formatDayHeader(start)} · {formatTime(start)} – {formatTime(end)}
      </Text>
      <Text style={styles.meta}>
        {appt.service.name} · ${(appt.service.priceCents / 100).toFixed(2)}
      </Text>
      <StatusBadge status={appt.status} />

      {appt.notes ? (
        <View style={styles.notesBlock}>
          <Text style={styles.notesLabel}>Client notes</Text>
          <Text style={styles.notesText}>“{appt.notes}”</Text>
        </View>
      ) : null}

      <View style={styles.contactRow}>
        <ContactButton
          label="Call"
          onPress={callClient}
          disabled={!appt.client.phone}
        />
        <ContactButton
          label="Text"
          onPress={textClient}
          disabled={!appt.client.phone}
        />
      </View>

      {canCancel && !isCancelled ? (
        <View style={styles.actions}>
          {isPending ? (
            <PrimaryButton
              label="Approve"
              onPress={onApprove}
              loading={busy}
              tone="primary"
            />
          ) : null}

          <Text style={styles.cancelLabel}>
            Optional message (sent to client){isPending ? "" : ":"}
          </Text>
          <TextInput
            value={cancelMessage}
            onChangeText={setCancelMessage}
            placeholder="e.g. Sorry, I have to reschedule."
            multiline
            editable={!busy}
            style={styles.cancelInput}
          />

          <PrimaryButton
            label={isPending ? "Decline" : "Cancel appointment"}
            onPress={onCancel}
            loading={busy}
            tone="destructive"
          />
        </View>
      ) : null}

      <Pressable
        onPress={onClose}
        disabled={busy}
        style={({ pressed }) => [
          styles.closeButton,
          pressed && styles.pressed,
        ]}
        accessibilityRole="button"
        accessibilityLabel="Close"
      >
        <Text style={styles.closeButtonText}>Close</Text>
      </Pressable>
    </ScrollView>
  );
}

function StatusBadge({ status }: { status: AppointmentDTO["status"] }) {
  const map: Record<AppointmentDTO["status"], { bg: string; fg: string; label: string }> = {
    PENDING: { bg: "#fef3c7", fg: "#92400e", label: "Pending" },
    CONFIRMED: { bg: "#dcfce7", fg: "#166534", label: "Confirmed" },
    CANCELLED: { bg: "#fee2e2", fg: "#991b1b", label: "Cancelled" },
    COMPLETED: { bg: "#e0e7ff", fg: "#3730a3", label: "Completed" },
    NO_SHOW: { bg: "#f3f4f6", fg: "#374151", label: "No-show" },
  };
  const s = map[status];
  return (
    <View style={[styles.badge, { backgroundColor: s.bg }]}>
      <Text style={[styles.badgeText, { color: s.fg }]}>{s.label}</Text>
    </View>
  );
}

function ContactButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.contactButton,
        disabled && styles.contactButtonDisabled,
        pressed && !disabled && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text
        style={[
          styles.contactButtonText,
          disabled && styles.contactButtonTextDisabled,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function PrimaryButton({
  label,
  onPress,
  loading,
  tone,
}: {
  label: string;
  onPress: () => void;
  loading: boolean;
  tone: "primary" | "destructive";
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.primaryButton,
        tone === "destructive" && styles.destructiveButton,
        (pressed || loading) && styles.pressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryButtonText}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "92%",
  },
  sheetContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
    gap: 8,
  },
  handle: {
    alignSelf: "center",
    width: 40,
    height: 4,
    backgroundColor: "#d4d4d4",
    borderRadius: 2,
    marginBottom: 12,
  },
  title: { fontSize: 22, fontWeight: "700" },
  meta: { fontSize: 14, color: "#555" },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 8,
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  notesBlock: {
    marginTop: 12,
    padding: 12,
    backgroundColor: "#fafafa",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#eee",
  },
  notesLabel: { fontSize: 12, color: "#777", fontWeight: "600" },
  notesText: { fontSize: 14, color: "#333", marginTop: 4, fontStyle: "italic" },

  contactRow: { flexDirection: "row", gap: 10, marginTop: 16 },
  contactButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: "#f3f4f6",
    alignItems: "center",
  },
  contactButtonDisabled: { opacity: 0.4 },
  contactButtonText: { fontSize: 15, fontWeight: "600", color: "#111" },
  contactButtonTextDisabled: { color: "#888" },

  actions: { gap: 10, marginTop: 16 },
  cancelLabel: { fontSize: 13, color: "#555", marginTop: 4 },
  cancelInput: {
    borderWidth: 1,
    borderColor: "#ddd",
    borderRadius: 10,
    padding: 12,
    minHeight: 70,
    textAlignVertical: "top",
    fontSize: 15,
  },

  primaryButton: {
    backgroundColor: "#111",
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
  },
  destructiveButton: { backgroundColor: "#b91c1c" },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "600" },

  closeButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: "center",
  },
  closeButtonText: { color: "#555", fontSize: 15, fontWeight: "600" },

  pressed: { opacity: 0.85 },
});
