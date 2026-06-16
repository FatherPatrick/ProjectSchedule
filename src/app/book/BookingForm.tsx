"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { formatPrice, localDateKey } from "@/lib/utils";
import { Alert } from "@/components/Alert";
import { Button } from "@/components/Button";
import { TurnstileWidget, isCaptchaEnabled } from "@/components/TurnstileWidget";
import { ServicePicker } from "./ServicePicker";
import { DatePicker } from "./DatePicker";
import { TimeSlotPicker } from "./TimeSlotPicker";
import { ContactFields } from "./ContactFields";
import { BookingResultCard } from "./BookingResultCard";
import type { ServiceLite, Slot } from "./types";

export function BookingForm({
  services,
  closedDayOfWeek,
  maxAdvanceDays,
}: {
  services: ServiceLite[];
  closedDayOfWeek: number[];
  /** How far ahead booking is allowed, in days. `null` means no limit. */
  maxAdvanceDays: number | null;
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
  const [phone, setPhone] = useState("");
  const [smsOptIn, setSmsOptIn] = useState(false);
  const [agree, setAgree] = useState(false);
  const [agreePolicies, setAgreePolicies] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const captchaRequired = isCaptchaEnabled();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{
    when: string;
    serviceName: string;
    pending: boolean;
  } | null>(null);

  // Snapshot of "now" maintained via useSyncExternalStore so render-time logic
  // stays pure (React 19 forbids calling Date.now() directly during render).
  // Refreshes once a minute and on window focus.
  //
  // IMPORTANT: getSnapshot must return a *stable* value between notifications,
  // otherwise React detects a changed snapshot every render and re-renders
  // forever ("Maximum update depth exceeded"). useRef gives us a stable
  // mutable container that React Compiler is happy with.
  const nowRef = useRef({ value: 0 });
  const subscribeNow = useCallback((cb: () => void) => {
    nowRef.current.value = Date.now();
    const tick = () => {
      nowRef.current.value = Date.now();
      cb();
    };
    const id = setInterval(tick, 60_000);
    window.addEventListener("focus", tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
    };
  }, []);
  const getNowSnapshot = useCallback(() => nowRef.current.value, []);
  const getNowServerSnapshot = useCallback(() => 0, []);
  const nowMs = useSyncExternalStore(
    subscribeNow,
    getNowSnapshot,
    getNowServerSnapshot
  );

  const service = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  );

  // Compose a stable key for the current (service, date) selection. We use it
  // both to drive fetching and to reset the chosen slot when inputs change,
  // avoiding a setState-in-effect call.
  const dateKey = date ? localDateKey(date) : "";
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
    return localDateKey(new Date(nowMs + 24 * 60 * 60 * 1000));
  }, [nowMs]);

  // Latest bookable date, per the "max book-out" setting (null = no limit).
  const maxBookMs = useMemo(
    () =>
      maxAdvanceDays == null || !nowMs
        ? null
        : nowMs + maxAdvanceDays * 24 * 60 * 60 * 1000,
    [maxAdvanceDays, nowMs]
  );
  const maxProposeDate = useMemo(
    () => (maxBookMs == null ? "" : localDateKey(new Date(maxBookMs))),
    [maxBookMs]
  );

  // Stable references for react-day-picker. Passing a fresh `new Date()` or a
  // freshly-built object on every render causes the picker's internal effects
  // to re-run each render, which leads to "Maximum update depth exceeded".
  // We only need day-level granularity for "today", so bucket nowMs to the
  // start of the day in the user's timezone.
  const todayStart = useMemo(() => {
    if (!nowMs) return new Date(0);
    const d = new Date(nowMs);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [nowMs]);
  // Bucket the max-book date to end-of-day so the whole final day stays
  // selectable; a fresh object each render would re-run the picker's effects.
  const maxDayEnd = useMemo(() => {
    if (maxBookMs == null) return null;
    const d = new Date(maxBookMs);
    d.setHours(23, 59, 59, 999);
    return d;
  }, [maxBookMs]);
  const dpDisabled = useMemo(
    () =>
      maxDayEnd
        ? [{ before: todayStart }, { after: maxDayEnd }]
        : [{ before: todayStart }],
    [todayStart, maxDayEnd]
  );
  const dpModifiers = useMemo(
    () => ({ closed: { dayOfWeek: closedDayOfWeek } }),
    [closedDayOfWeek]
  );
  const dpModifiersClassNames = useMemo(
    () => ({ closed: "text-neutral-400 italic" }),
    []
  );

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

  // Within the max book-out window? Always true when no limit is configured.
  function customWithinWindow(): boolean {
    if (maxBookMs == null) return true;
    const iso = customStartISO();
    if (!iso) return true; // emptiness is handled by the lead-time check
    return new Date(iso).getTime() <= maxBookMs;
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
    if (!agreePolicies) {
      setError("Please acknowledge the studio policies.");
      return;
    }
    if (captchaRequired && !captchaToken) {
      setError("Please complete the captcha challenge.");
      return;
    }
    let endpoint = "/api/appointments";
    let body: Record<string, unknown> = {
      serviceId,
      startISO,
      name,
      phone,
      smsOptIn,
      captchaToken,
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
      if (!customWithinWindow()) {
        setError(
          "That date is further out than we're currently booking. Please choose a sooner date."
        );
        return;
      }
      endpoint = "/api/appointments/propose";
      body = {
        serviceId,
        startISO: iso,
        name,
        phone,
        smsOptIn,
        notes: customNotes || undefined,
        captchaToken,
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
      // Captcha tokens are single-use — reset for any subsequent submit.
      setCaptchaToken(null);
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
      <BookingResultCard
        done={done}
        onReset={() => {
          setDone(null);
          setStartISO(null);
          setProposeMode(false);
          setCustomDate("");
          setCustomTime("");
          setCustomNotes("");
          setDate(undefined);
          setSlots([]);
          setLoadedSlotsKey("");
          setError(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <ServicePicker
        services={services}
        serviceId={serviceId}
        onSelect={setServiceId}
      />

      <DatePicker
        selected={date}
        onSelect={(d) => {
          setDate(d);
          if (d) {
            const key = localDateKey(d);
            setCustomDate((prev) => prev || key);
          }
        }}
        disabled={dpDisabled}
        modifiers={dpModifiers}
        modifiersClassNames={dpModifiersClassNames}
        endMonth={maxDayEnd ?? undefined}
      />

      {date && (
        <TimeSlotPicker
          slotsLoading={slotsLoading}
          displaySlots={displaySlots}
          startISO={startISO}
          proposeMode={proposeMode}
          onSelectSlot={(iso) => {
            setProposeMode(false);
            setStartISO(iso);
          }}
          onEnterPropose={() => {
            setProposeMode(true);
            setStartISO(null);
          }}
          onExitPropose={() => setProposeMode(false)}
          customDate={customDate}
          customTime={customTime}
          customNotes={customNotes}
          onCustomDateChange={setCustomDate}
          onCustomTimeChange={setCustomTime}
          onCustomNotesChange={setCustomNotes}
          minProposeDate={minProposeDate}
          maxProposeDate={maxProposeDate}
          showLeadWarning={Boolean(customDate && customTime && !customLeadOk())}
          showWindowWarning={Boolean(customDate && !customWithinWindow())}
        />
      )}

      {(startISO || (proposeMode && customLeadOk())) && (
        <ContactFields
          name={name}
          phone={phone}
          smsOptIn={smsOptIn}
          agree={agree}
          agreePolicies={agreePolicies}
          onNameChange={setName}
          onPhoneChange={setPhone}
          onSmsOptInChange={setSmsOptIn}
          onAgreeChange={setAgree}
          onAgreePoliciesChange={setAgreePolicies}
        />
      )}

      {error && (
        <Alert tone="error" role="alert" className="rounded-xl p-3">
          {error}
        </Alert>
      )}

      {captchaRequired && (
        <TurnstileWidget
          onVerify={setCaptchaToken}
          onExpire={() => setCaptchaToken(null)}
        />
      )}

      <Button
        type="submit"
        fullWidth
        className="py-3"
        disabled={
          submitting ||
          !agree ||
          !agreePolicies ||
          (captchaRequired && !captchaToken) ||
          (proposeMode ? !customLeadOk() || !customWithinWindow() : !startISO)
        }
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
      </Button>
    </form>
  );
}
