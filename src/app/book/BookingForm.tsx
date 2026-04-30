"use client";

import { useEffect, useMemo, useState } from "react";
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

export function BookingForm({ services }: { services: ServiceLite[] }) {
  const [serviceId, setServiceId] = useState<string>(services[0]?.id ?? "");
  const [date, setDate] = useState<Date | undefined>();
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [startISO, setStartISO] = useState<string | null>(null);
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
  } | null>(null);

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  );

  useEffect(() => {
    setStartISO(null);
    if (!serviceId || !date) {
      setSlots([]);
      return;
    }
    const dateKey = format(date, "yyyy-MM-dd");
    setSlotsLoading(true);
    fetch(`/api/availability?serviceId=${serviceId}&date=${dateKey}`)
      .then((r) => r.json())
      .then((d) => setSlots(d.slots ?? []))
      .catch(() => setSlots([]))
      .finally(() => setSlotsLoading(false));
  }, [serviceId, date]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!serviceId || !startISO) {
      setError("Please pick a service and time.");
      return;
    }
    if (!agree) {
      setError("Please agree to the terms and cancellation policy.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          serviceId,
          startISO,
          name,
          email,
          phone,
          smsOptIn,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not book.");
      setDone({ when: data.whenLabel, serviceName: data.serviceName });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6">
        <h2 className="text-xl font-semibold text-emerald-900">
          You&apos;re booked!
        </h2>
        <p className="mt-2 text-emerald-900">
          Your <strong>{done.serviceName}</strong> appointment is confirmed for{" "}
          <strong>{done.when}</strong>. Check your email and texts for
          confirmation and a 24-hour reminder.
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
            onSelect={setDate}
            disabled={{ before: new Date() }}
            showOutsideDays
          />
        </div>
      </fieldset>

      {/* Time */}
      {date && (
        <fieldset className="rounded-2xl bg-white border border-neutral-200 p-4">
          <legend className="px-2 text-sm font-medium">3. Pick a time</legend>
          {slotsLoading ? (
            <p className="text-sm text-neutral-500">Loading times…</p>
          ) : slots.length === 0 ? (
            <p className="text-sm text-neutral-500">
              No availability on that day. Try another date.
            </p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {slots.map((slot) => (
                <button
                  key={slot.startISO}
                  type="button"
                  onClick={() => setStartISO(slot.startISO)}
                  className={cn(
                    "rounded-lg border px-2 py-2 text-sm",
                    startISO === slot.startISO
                      ? "border-pink-600 bg-pink-50 text-pink-800"
                      : "border-neutral-200 hover:bg-neutral-50"
                  )}
                >
                  {slot.label}
                </button>
              ))}
            </div>
          )}
        </fieldset>
      )}

      {/* Contact */}
      {startISO && (
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
        disabled={!startISO || !agree || submitting}
        className="w-full rounded-full bg-pink-600 text-white py-3 font-medium disabled:bg-neutral-300"
      >
        {submitting
          ? "Booking…"
          : service
            ? `Book ${service.name} · ${formatPrice(service.priceCents)}`
            : "Book"}
      </button>
    </form>
  );
}
