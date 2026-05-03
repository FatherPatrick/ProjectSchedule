"use client";

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/dist/style.css";
import { format } from "date-fns";
import { formatDuration, formatPrice, cn } from "@/lib/utils";

interface ServiceLite {
  id: string;
  name: string;
  durationMinutes: number;
  priceCents: number;
  description: string | null;
}

interface Slot {
  startISO: string;
  label: string;
}

export function BookingForm({
  services,
  closedDayOfWeek,
}: {
  services: ServiceLite[];
  closedDayOfWeek: number[];
}) {
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState<Date | undefined>();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [startISO, setStartISO] = useState<string | null>(null);
  const [proposeMode, setProposeMode] = useState(false);
  const [customDate, setCustomDate] = useState<string>("");
  const [customTime, setCustomTime] = useState<string>("");
  const [customNotes, setCustomNotes] = useState<string>("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(true);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    when: string;
    serviceName: string;
    pending: boolean;
  } | null>(null);

  // Snapshot of "now" maintained via useSyncExternalStore so render-time logic
  // stays pure (React 19 forbids calling Date.now() directly during render).
  // Refreshes once a minute and on window focus.
  const subscribeNow = useCallback((cb: () => void) => {
    const id = setInterval(cb, 60_000);
    window.addEventListener("focus", cb);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", cb);
    };
  }, []);
  const nowMs = useSyncExternalStore(
    subscribeNow,
    () => Date.now(),
    () => 0 // SSR snapshot; client effects will replace it before any time-sensitive logic runs
  );

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  );

  // Compose a stable key for the current (service, date) selection. We use it
  // both to drive fetching and to reset the chosen slot when inputs change,
  // avoiding a setState-in-effect call.
  const dateKey = date ? format(date, "yyyy-MM-dd") : "";
  const slotsKey = serviceId && dateKey ? `${serviceId}|${dateKey}` : "";

  const [loadedSlotsKey, setLoadedSlotsKey] = useState("");
  // If the slots key changed since we last loaded, the previously-selected slot
  // is stale; clear it as derived state during render.
  if (startISO && slotsKey !== loadedSlotsKey) {
    setStartISO(null);
  }

  // Derived: only show fetched slots when they correspond to current inputs.
  const displaySlots = slotsKey && slotsKey === loadedSlotsKey ? slots : [];
  const slotsLoading = Boolean(slotsKey) && slotsKey !== loadedSlotsKey;

  useEffect(() => {
    if (!slotsKey) return;
    let cancelled = false;
    fetch(`/api/availability?serviceId=${serviceId}&date=${dateKey}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setSlots(d.slots ?? []);
        setLoadedSlotsKey(slotsKey);
      })
      .catch(() => {
        if (cancelled) return;
        setSlots([]);
        setLoadedSlotsKey(slotsKey);
      });
    return () => {
      cancelled = true;
    };
  }, [slotsKey, serviceId, dateKey]);

  // Earliest date a custom proposal is valid (24h from now in client tz).
  const minProposeDate = useMemo(() => {
    if (!nowMs) return "";
    return format(new Date(nowMs + 24 * 60 * 60 * 1000), "yyyy-MM-dd");
  }, [nowMs]);

  function customStartISO(): string | null {
    if (!customDate || !customTime) return null;
    const local = new Date(`${customDate}T${customTime}`);
    if (Number.isNaN(local.getTime())) return null;
    return local.toISOString();
  }

  function customLeadOk(): boolean {
    if (!nowMs) return false;
    const iso = customStartISO();
    if (!iso) return false;
    return new Date(iso).getTime() - nowMs >= 24 * 60 * 60 * 1000;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!serviceId) {
      setError("Please pick a service.");
      return;
    }
    if (!agree) {
      setError("Please agree to the terms and cancellation policy.");
      return;
    }
    let endpoint = "/api/appointments";
    let body: Record<string, unknown> = {
      serviceId,
      startISO,
      name,
      email,
      phone,
      smsOptIn,
    };
    if (proposeMode) {
      const iso = customStartISO();
      if (!iso) {
        setError("Please choose a date and time.");
        return;
      }
      if (!customLeadOk()) {
        setError("Proposed time must be at least 24 hours in advance.");
        return;
      }
      endpoint = "/api/appointments/propose";
      body = {
        serviceId,
        startISO: iso,
        name,
        email,
        phone,
        smsOptIn,
        notes: customNotes || undefined,
      };
    } else if (!startISO) {
      setError("Please pick a time.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not book.");
      setDone({
        when: data.whenLabel,
        serviceName: data.serviceName,
        pending: proposeMode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        className={cn(
          "rounded-2xl border p-6",
          done.pending
            ? "border-amber-200 bg-amber-50"
            : "border-emerald-200 bg-emerald-50"
        )}
      >
        <h2
          className={cn(
            "text-xl font-semibold",
            done.pending ? "text-amber-900" : "text-emerald-900"
          )}
        >
          {done.pending ? "Request received!" : "You're booked!"}
        </h2>
        <p
          className={cn(
            "mt-2",
            done.pending ? "text-amber-900" : "text-emerald-900"
          )}
        >
          {done.pending ? (
            <>
              Your <strong>{done.serviceName}</strong> proposal for{" "}
              <strong>{done.when}</strong> has been sent for review.
              We&apos;ll email you when it&apos;s confirmed or if we need to
              suggest a different time.
            </>
          ) : (
            <>
              Your <strong>{done.serviceName}</strong> appointment is confirmed
              for <strong>{done.when}</strong>. Check your email and texts for
              confirmation and a 24-hour reminder.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      {/* Service */}
      <fieldset className="rounded-2xl bg-white border border-neutral-200 p-4">
        <legend className="px-2 text-sm font-medium">1. Choose a service</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {services.map((s) => (
            <label
              key={s.id}
              className={cn(
                "flex items-start gap-3 rounded-xl border p-3 cursor-pointer",
                serviceId === s.id
                  ? "border-pink-600 bg-pink-50"
                  : "border-neutral-200"
              )}
            >
              <input
                type="radio"
                name="service"
                className="mt-1"
                checked={serviceId === s.id}
                onChange={() => setServiceId(s.id)}
              />
              <span className="flex-1">
                <span className="block font-medium">{s.name}</span>
                <span className="block text-xs text-neutral-500">
                  {formatDuration(s.durationMinutes)} ·{" "}
                  {formatPrice(s.priceCents)}
                </span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Date */}
      <fieldset className="rounded-2xl bg-white border border-neutral-200 p-4">
        <legend className="px-2 text-sm font-medium">2. Pick a date</legend>
        <div className="overflow-x-auto">
          <DayPicker
            mode="single"
            selected={date}
            onSelect={(d) => {
              setDate(d);
              if (d) {
                const dateKey = format(d, "yyyy-MM-dd");
                setCustomDate((prev) => prev || dateKey);
              }
            }}
            disabled={{ before: new Date() }}
            modifiers={{ closed: { dayOfWeek: closedDayOfWeek } }}
            modifiersClassNames={{ closed: "text-neutral-400 italic" }}
            showOutsideDays
          />
          <p className="mt-2 text-xs text-neutral-500">
            Greyed-out days are normally closed. You can still pick one and
            propose a custom time for review.
          </p>
        </div>
      </fieldset>

      {/* Time */}
      {date && (
        <fieldset className="rounded-2xl bg-white border border-neutral-200 p-4 space-y-3">
          <legend className="px-2 text-sm font-medium">3. Pick a time</legend>
          {slotsLoading ? (
            <p className="text-sm text-neutral-500">Loading times…</p>
          ) : displaySlots.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No openings on that day. Try another date or propose a custom
              time below.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {displaySlots.map((slot) => (
                <button
                  key={slot.startISO}
                  type="button"
                  onClick={() => {
                    setProposeMode(false);
                    setStartISO(slot.startISO);
                  }}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm",
                    !proposeMode && startISO === slot.startISO
                      ? "border-pink-600 bg-pink-50 text-pink-800"
                      : "border-neutral-200 hover:bg-neutral-50"
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}

          <div className="border-t border-neutral-200 pt-3">
            {!proposeMode ? (
              <button
                type="button"
                onClick={() => {
                  setProposeMode(true);
                  setStartISO(null);
                }}
                className="text-sm rounded-full border border-pink-300 text-pink-800 px-3 py-1.5 hover:bg-pink-50"
              >
                None of these work? Propose a custom time
              </button>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-medium">
                    Propose a custom time
                  </p>
                  <button
                    type="button"
                    onClick={() => setProposeMode(false)}
                    className="text-xs text-neutral-600 underline underline-offset-2"
                  >
                    Cancel
                  </button>
                </div>
                <p className="text-xs text-neutral-500">
                  Choose any date/time at least 24 hours from now. We&apos;ll
                  review your request and email you to confirm.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="text-sm flex flex-col gap-1">
                    Date
                    <input
                      type="date"
                      value={customDate}
                      min={minProposeDate}
                      onChange={(e) => setCustomDate(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-3 py-2"
                    />
                  </label>
                  <label className="text-sm flex flex-col gap-1">
                    Time
                    <input
                      type="time"
                      value={customTime}
                      onChange={(e) => setCustomTime(e.target.value)}
                      className="rounded-lg border border-neutral-300 px-3 py-2"
                    />
                  </label>
                </div>
                <label className="text-sm flex flex-col gap-1">
                  Notes (optional)
                  <textarea
                    value={customNotes}
                    onChange={(e) => setCustomNotes(e.target.value)}
                    rows={2}
                    placeholder="Anything we should know about this request?"
                    className="rounded-lg border border-neutral-300 px-3 py-2"
                  />
                </label>
                {customDate && customTime && !customLeadOk() && (
                  <p className="text-xs text-amber-700">
                    Proposed time must be at least 24 hours from now.
                  </p>
                )}
              </div>
            )}
          </div>
        </fieldset>
      )}

      {/* Contact */}
      {(startISO || (proposeMode && customLeadOk())) && (
        <fieldset className="rounded-2xl bg-white border border-neutral-200 p-4 space-y-3">
          <legend className="px-2 text-sm font-medium">4. Your info</legend>
          <input
            required
            placeholder="Full name"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            required
            type="email"
            placeholder="Email"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <input
            required
            type="tel"
            placeholder="Mobile phone (e.g. +1 555 123 4567)"
            className="w-full rounded-lg border border-neutral-300 px-3 py-2"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={smsOptIn}
              onChange={(e) => setSmsOptIn(e.target.checked)}
            />
            <span>
              Send me confirmation and reminder text messages. Reply STOP to
              opt out at any time. Msg & data rates may apply.
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm text-neutral-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
            />
            <span>
              I agree to the{" "}
              <a href="/terms" className="underline">
                Terms
              </a>
              ,{" "}
              <a href="/privacy" className="underline">
                Privacy Policy
              </a>
              , and{" "}
              <a href="/cancellation-policy" className="underline">
                Cancellation Policy
              </a>
              .
            </span>
          </label>
        </fieldset>
      )}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={
          submitting ||
          !agree ||
          (proposeMode ? !customLeadOk() : !startISO)
        }
        className="w-full rounded-full bg-pink-600 text-white py-3 font-medium disabled:bg-neutral-300"
      >
        {submitting
          ? proposeMode
            ? "Sending request…"
            : "Booking…"
          : proposeMode
            ? service
              ? `Request ${service.name}`
              : "Send request"
            : service
              ? `Book ${service.name} · ${formatPrice(service.priceCents)}`
              : "Book"}
      </button>
    </form>
  );
}
