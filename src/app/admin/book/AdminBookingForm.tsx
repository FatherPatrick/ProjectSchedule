"use client";

import { useEffect, useState } from "react";
import { PrettySelect } from "@/components/PrettySelect";
import { PrettyTimeField } from "@/components/PrettyTimeField";
import { notifyAdminToast } from "@/app/admin/AdminToaster";
import { formatDuration, formatPrice, cn } from "@/lib/utils";
import type { ClientLiteDTO, ClientSearchResponse } from "@/lib/api-types";

interface ServiceLite {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
}

type ClientMode = "existing" | "new";

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

  const todayKey = useState(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    // Local YYYY-MM-DD for the date input's min.
    const off = d.getTimezoneOffset() * 60_000;
    return new Date(d.getTime() - off).toISOString().slice(0, 10);
  })[0];

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
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">
          Appointment booked
        </h2>
        <p className="mt-2 text-emerald-900">
          <strong>{done.serviceName}</strong> is confirmed for{" "}
          <strong>{done.when}</strong>
          {notify ? " — the client has been notified." : "."}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-4 rounded-full border border-emerald-300 px-3 py-1.5 text-sm font-medium text-emerald-900 hover:bg-emerald-100"
        >
          Book another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      {/* Service */}
      <fieldset className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-2">
        <legend className="px-2 text-sm font-medium">Service</legend>
        <PrettySelect
          value={serviceId}
          onChange={setServiceId}
          ariaLabel="Service"
          triggerClassName="min-w-[18rem]"
          options={serviceOptions}
        />
      </fieldset>

      {/* When */}
      <fieldset className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <legend className="px-2 text-sm font-medium">Date &amp; time</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm flex flex-col gap-1">
            Date
            <input
              type="date"
              value={date}
              min={todayKey}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-lg border border-neutral-300 px-3 py-2"
            />
          </label>
          <label className="text-sm flex flex-col gap-1">
            Time
            <PrettyTimeField
              value={time}
              onChange={setTime}
              ariaLabel="Appointment time"
              className="w-full"
              inputProps={{
                className:
                  "w-full rounded-lg border border-neutral-300 px-3 py-2",
              }}
            />
          </label>
        </div>
      </fieldset>

      {/* Client */}
      <fieldset className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <legend className="px-2 text-sm font-medium">Client</legend>
        <div className="inline-flex rounded-full border border-neutral-200 p-0.5 text-sm">
          {(["existing", "new"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
              }}
              className={cn(
                "rounded-full px-3 py-1 font-medium transition-colors",
                mode === m
                  ? "bg-pink-600 text-white"
                  : "text-neutral-600 hover:text-pink-700"
              )}
            >
              {m === "existing" ? "Existing client" : "New client"}
            </button>
          ))}
        </div>

        {mode === "existing" ? (
          <div className="space-y-2">
            {selected ? (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-pink-200 bg-pink-50 p-3">
                <div className="min-w-0">
                  <div className="font-medium truncate">{selected.name}</div>
                  <div className="text-xs text-neutral-600 truncate">
                    {[selected.email, selected.phone].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelected(null);
                    setQuery("");
                  }}
                  className="text-xs text-pink-700 underline underline-offset-2 shrink-0"
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search by name, email, or phone"
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2"
                />
                {query.trim() && (
                  <ul className="mt-1 max-h-56 overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
                    {searching && results.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-neutral-500">
                        Searching…
                      </li>
                    ) : results.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-neutral-500">
                        No matches. Use “New client” to add them.
                      </li>
                    ) : (
                      results.map((c) => (
                        <li key={c.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelected(c);
                              setResults([]);
                            }}
                            className="flex w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-pink-50"
                          >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-xs text-neutral-500">
                              {[c.email, c.phone].filter(Boolean).join(" · ")}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              placeholder="Full name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
            <input
              type="tel"
              placeholder="Mobile phone (e.g. +1 555 123 4567)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            />
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <input
                type="checkbox"
                checked={smsOptIn}
                onChange={(e) => setSmsOptIn(e.target.checked)}
              />
              Client agreed to appointment texts
            </label>
          </div>
        )}
      </fieldset>

      {/* Options */}
      <fieldset className="rounded-2xl border border-neutral-200 bg-white p-4 space-y-3">
        <legend className="px-2 text-sm font-medium">Options</legend>
        <label className="flex items-start gap-2 text-sm text-neutral-700">
          <input
            type="checkbox"
            className="mt-1"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
          />
          <span>
            Send the client a confirmation now and a 24-hour reminder. Uncheck to
            book silently.
          </span>
        </label>
        <label className="text-sm flex flex-col gap-1">
          Notes (optional)
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={2}
            placeholder="Internal note for this appointment"
            className="rounded-lg border border-neutral-300 px-3 py-2"
          />
        </label>
      </fieldset>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={submitting || !canSubmit}
        className="rounded-full bg-pink-600 px-5 py-2.5 font-medium text-white disabled:bg-neutral-300"
      >
        {submitting ? "Booking…" : "Book appointment"}
      </button>
    </form>
  );
}
