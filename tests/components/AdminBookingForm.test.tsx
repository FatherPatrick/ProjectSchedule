// @vitest-environment jsdom
/**
 * Behavioural tests for the admin "book for a client" form's submit gating.
 *
 * canSubmit = service && date && time && client. The service defaults to the
 * first one and the time defaults to 09:00, so the interesting logic is: a
 * date must be picked, and a client must be resolved — either an existing
 * client selected, or a new client's name + phone entered. We stub the custom
 * select/time-field (their internals aren't under test here) and the toaster.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AdminBookingForm } from "@/app/admin/book/AdminBookingForm";

vi.mock("@/components/PrettySelect", () => ({ PrettySelect: () => null }));
vi.mock("@/components/PrettyTimeField", () => ({ PrettyTimeField: () => null }));
vi.mock("@/app/admin/AdminToaster", () => ({ notifyAdminToast: vi.fn() }));

afterEach(cleanup);

const SERVICES = [
  { id: "s1", name: "Manicure", durationMinutes: 30, priceCents: 5000 },
];

const submitButton = () =>
  screen.getByRole("button", { name: "Book appointment" }) as HTMLButtonElement;
const dateInput = () =>
  document.querySelector('input[type="date"]') as HTMLInputElement;

describe("AdminBookingForm submit gating", () => {
  it("disables submit until a new client's details and a date are filled in", async () => {
    const user = userEvent.setup();
    render(<AdminBookingForm services={SERVICES} />);

    expect(submitButton().disabled).toBe(true);

    await user.click(screen.getByRole("button", { name: "New client" }));
    await user.type(screen.getByPlaceholderText("Full name"), "Jane Doe");
    await user.type(
      screen.getByPlaceholderText(/Mobile phone/),
      "+15555551212"
    );
    // Still missing a date.
    expect(submitButton().disabled).toBe(true);

    fireEvent.change(dateInput(), { target: { value: "2099-07-01" } });

    expect(submitButton().disabled).toBe(false);
  });

  it("keeps submit disabled in existing-client mode until a client is selected", () => {
    render(<AdminBookingForm services={SERVICES} />);

    // Existing-client mode is the default; fill the date but select nobody.
    fireEvent.change(dateInput(), { target: { value: "2099-07-01" } });

    expect(submitButton().disabled).toBe(true);
  });
});
