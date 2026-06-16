"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { notifyAdminToast } from "@/app/admin/AdminToaster";
import { formatDuration, formatPrice, localDateKey } from "@/lib/utils";
import type { ClientLiteDTO, ClientSearchResponse } from "@/lib/api-types";
import { ServiceSelector } from "./ServiceSelector";
import { DateTimeFields } from "./DateTimeFields";
import { ClientSelector } from "./ClientSelector";
import { OptionsPanel } from "./OptionsPanel";
import { AdminBookingResultCard } from "./AdminBookingResultCard";
import type { ClientMode, ServiceLite } from "./types";

export function AdminBookingForm({ services }: { services: ServiceLite[] }) {
  const [serviceId, setServiceId] = useState(services[0]?.id ?? "");
  const [date, setDate] = useState("");
  // Default to 9:00 AM so the field matches what the time picker displays —
  // otherwise it *looks* like 9:00 is chosen but no value is set until a click.
  const [time, setTime] = useState("09:00");
  const [notes, setNotes] = useState("");
  const [notify, setNotify] = useState(true);

  const [mode, setMode] = useState<ClientMode>("existing");
  // Existing-client search.
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ClientLiteDTO[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ClientLiteDTO | null>(null);
  // New-client fields. Email is intentionally omitted for now — booking only
  // needs a name + mobile number (SMS is the confirmation channel).
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(true);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ when: string; serviceName: string } | null>(
    null
  );

  // Local YYYY-MM-DD for the date input's min. Computed once at mount.
  const todayKey = useState(() => localDateKey(new Date()))[0];

  const serviceOptions = services.map((s) => ({
    value: s.id,
    label: `${s.name} · ${formatDuration(s.durationMinutes)} · ${formatPrice(s.priceCents)}`,
  }));

  // Debounced client search. Skipped once a client is selected or in new mode.
  // All state updates happen inside the (deferred) timeout, never synchronously
  // in the effect body — that would trigger cascading renders.
  useEffect(() => {
    if (mode !== "existing" || selected) return;
    const q = query.trim();
    let cancelled = false;
    const t = setTimeout(() => {
      if (q.length < 1) {
        setResults([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      fetch(`/api/admin/clients?q=${encodeURIComponent(q)}`)
        .then((r) => r.json() as Promise<ClientSearchResponse>)
        .then((d) => {
          if (!cancelled) setResults(d.data ?? []);
        })
        .catch(() => {
          if (!cancelled) setResults([]);
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, mode, selected]);

  const clientReady =
    mode === "existing"
      ? Boolean(selected)
      : Boolean(name.trim() && phone.trim());
  const canSubmit = Boolean(serviceId && date && time && clientReady);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!canSubmit) {
      setError("Fill in the service, date, time, and client.");
      return;
    }
    const local = new Date(`${date}T${time}`);
    if (Number.isNaN(local.getTime())) {
      setError("Pick a valid date and time.");
      return;
    }

    const body =
      mode === "existing"
        ? {
            serviceId,
            startISO: local.toISOString(),
            clientId: selected!.id,
            notify,
            notes: notes || undefined,
          }
        : {
            serviceId,
            startISO: local.toISOString(),
            name,
            phone,
            smsOptIn,
            notify,
            notes: notes || undefined,
          };

    setSubmitting(true);
    try {
      const res = await fetch("/api/admin/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not book.");
      notifyAdminToast({ message: "Appointment booked." });
      setDone({ when: data.whenLabel, serviceName: data.serviceName });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg);
      notifyAdminToast({ kind: "error", message: msg });
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setDone(null);
    setDate("");
    setTime("");
    setNotes("");
    setNotify(true);
    setQuery("");
    setResults([]);
    setSelected(null);
    setName("");
    setPhone("");
    setSmsOptIn(true);
    setError(null);
  }

  if (done) {
    return (
      <AdminBookingResultCard done={done} notify={notify} onReset={reset} />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <ServiceSelector
        value={serviceId}
        onChange={setServiceId}
        options={serviceOptions}
      />

      <DateTimeFields
        date={date}
        time={time}
        todayKey={todayKey}
        onDateChange={setDate}
        onTimeChange={setTime}
      />

      <ClientSelector
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          setError(null);
        }}
        selected={selected}
        query={query}
        results={results}
        searching={searching}
        onQueryChange={setQuery}
        onSelect={(c) => {
          setSelected(c);
          setResults([]);
        }}
        onClearSelected={() => {
          setSelected(null);
          setQuery("");
        }}
        name={name}
        phone={phone}
        smsOptIn={smsOptIn}
        onNameChange={setName}
        onPhoneChange={setPhone}
        onSmsOptInChange={setSmsOptIn}
      />

      <OptionsPanel
        notify={notify}
        notes={notes}
        onNotifyChange={setNotify}
        onNotesChange={setNotes}
      />

      {error && (
        <Alert tone="error" role="alert" className="rounded-xl p-3">
          {error}
        </Alert>
      )}

      <Button type="submit" size="lg" disabled={submitting || !canSubmit}>
        {submitting ? "Booking…" : "Book appointment"}
      </Button>
    </form>
  );
}
