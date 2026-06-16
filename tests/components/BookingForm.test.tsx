// @vitest-environment jsdom
/**
 * Behavioural tests for the public booking form's two validation gates:
 *
 *  1. The submit button stays disabled until BOTH the Terms and the studio
 *     policies checkboxes are ticked (even once a slot is chosen).
 *  2. Propose-a-custom-time warns when the chosen time is < 24h out.
 *
 * react-day-picker is mocked to a single button that selects a fixed date,
 * and `fetch` (availability) is stubbed, so the date → time → contact flow is
 * deterministic without real calendar interaction or network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("react-day-picker/dist/style.css", () => ({}));
vi.mock("react-day-picker", () => ({
  DayPicker: ({ onSelect }: { onSelect: (d: Date) => void }) => (
    <button type="button" onClick={() => onSelect(new Date("2099-07-01T12:00:00"))}>
      pick-day
    </button>
  ),
}));

import { BookingForm } from "@/app/book/BookingForm";

const SERVICES = [
  {
    id: "s1",
    name: "Manicure",
    durationMinutes: 30,
    priceCents: 5000,
    description: null,
  },
];

function stubFetchSlots(slots: Array<{ startISO: string; label: string }>) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ slots }),
    }))
  );
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function todayLocalKey() {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(cleanup);

describe("BookingForm submit gating", () => {
  it("requires both Terms and studio policies to be accepted before booking", async () => {
    const user = userEvent.setup();
    stubFetchSlots([{ startISO: "2099-07-01T15:00:00.000Z", label: "3:00 PM" }]);

    render(
      <BookingForm services={SERVICES} closedDayOfWeek={[]} maxAdvanceDays={null} />
    );

    await user.click(screen.getByText("pick-day"));
    // Availability resolves -> the slot button renders.
    await user.click(await screen.findByText("3:00 PM"));

    const submit = screen.getByRole("button", {
      name: /Book Manicure/,
    }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);

    // Contact fieldset checkboxes, in DOM order: smsOptIn, terms, policies.
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[1]); // Terms
    expect(submit.disabled).toBe(true); // policies still unchecked
    await user.click(checkboxes[2]); // Studio policies

    expect(submit.disabled).toBe(false);
  });

  it("warns when a proposed custom time is less than 24 hours out", async () => {
    const user = userEvent.setup();
    stubFetchSlots([]); // no openings -> only the propose path is offered

    render(
      <BookingForm services={SERVICES} closedDayOfWeek={[]} maxAdvanceDays={null} />
    );

    await user.click(screen.getByText("pick-day"));
    await user.click(await screen.findByText(/Propose a custom time/));

    // A same-day proposal is necessarily < 24h from now.
    fireEvent.change(screen.getByLabelText("Date"), {
      target: { value: todayLocalKey() },
    });
    fireEvent.change(screen.getByLabelText("Proposed time"), {
      target: { value: "10:00" },
    });

    expect(
      await screen.findByText("Proposed time must be at least 24 hours from now.")
    ).toBeTruthy();
  });
});
