// @vitest-environment jsdom
/**
 * Behavioural tests for the two "Reset ..." actions on the admin appearance
 * form. Both only repopulate the visible fields — they don't call any
 * server action themselves — so this is pure client-state behavior,
 * exercised the same way AdminBookingForm's submit-gating tests are.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AppearanceForm } from "@/app/admin/appearance/AppearanceForm";

vi.mock("@/components/PrettySelect", () => ({
  PrettySelect: ({
    value,
    onChange,
    options,
    ariaLabel,
  }: {
    value: string;
    onChange: (v: string) => void;
    options: ReadonlyArray<{ value: string; label: string }>;
    ariaLabel: string;
  }) => (
    <select
      aria-label={ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  ),
}));

afterEach(cleanup);

const FONT_OPTIONS = [
  { value: "geist", label: "Geist (default)" },
  { value: "playfair", label: "Playfair Display" },
  { value: "poppins", label: "Poppins" },
  { value: "inter", label: "Inter" },
];

const SAVED = {
  brandColor: "#111111",
  accentColor: "#222222",
  backgroundColor: "#333333",
  fontKey: "playfair",
};

const brandHexInput = () =>
  screen.getByLabelText("Brand hex value") as HTMLInputElement;
const fontSelect = () =>
  screen.getByLabelText("Curated font") as HTMLSelectElement;

describe("AppearanceForm reset actions", () => {
  it("reset to last saved reverts in-progress edits to the values passed in as props", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);

    fireEvent.change(brandHexInput(), { target: { value: "#abcdef" } });
    fireEvent.change(fontSelect(), { target: { value: "geist" } });
    expect(brandHexInput().value).toBe("#abcdef");
    expect(fontSelect().value).toBe("geist");

    fireEvent.click(screen.getByRole("button", { name: "Reset to last saved" }));

    expect(brandHexInput().value).toBe(SAVED.brandColor);
    expect(fontSelect().value).toBe(SAVED.fontKey);
  });

  it("reset to default fills in the platform default colors and font", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));

    // Platform default brand is the pre-theming pink; font defaults to geist.
    expect(brandHexInput().value).toBe("#db2777");
    expect(fontSelect().value).toBe("geist");
  });

  it("reset to default followed by reset to last saved restores the original values", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(brandHexInput().value).toBe("#db2777");

    fireEvent.click(screen.getByRole("button", { name: "Reset to last saved" }));
    expect(brandHexInput().value).toBe(SAVED.brandColor);
    expect(fontSelect().value).toBe(SAVED.fontKey);
  });
});

function hiddenInput(name: string): HTMLInputElement {
  return document.querySelector(`input[type="hidden"][name="${name}"]`) as HTMLInputElement;
}

describe("AppearanceForm basic/advanced mode", () => {
  it("opens on Advanced when the saved theme isn't one of the presets", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);
    expect(screen.getByLabelText("Brand hex value")).toBeTruthy();
  });

  it("opens on Basic, with that preset marked current, when the saved theme is a preset", () => {
    render(
      <AppearanceForm
        brandColor="#db2777"
        accentColor="#db2777"
        backgroundColor="#fdf2f8"
        fontKey="geist"
        fontOptions={FONT_OPTIONS}
      />
    );
    const card = screen.getByRole("button", { name: /Classic Pink/ });
    expect(card.getAttribute("aria-pressed")).toBe("true");
    expect(screen.queryByLabelText("Brand hex value")).toBeNull();
  });

  it("clicking a preset in Basic mode posts its bundled colors + font as hidden fields", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Basic" }));
    fireEvent.click(screen.getByRole("button", { name: /Ocean/ }));

    expect(hiddenInput("brandColor").value).toBe("#0284c7");
    expect(hiddenInput("accentColor").value).toBe("#06b6d4");
    expect(hiddenInput("backgroundColor").value).toBe("#f0f9ff");
    expect(hiddenInput("fontKey").value).toBe("inter");
    expect(
      screen.getByRole("button", { name: /Ocean/ }).getAttribute("aria-pressed")
    ).toBe("true");
  });

  it("switching to Advanced after a preset click shows that preset's values in the fields", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);

    fireEvent.click(screen.getByRole("button", { name: "Basic" }));
    fireEvent.click(screen.getByRole("button", { name: /Sage/ }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    expect(brandHexInput().value).toBe("#4d7c0f");
    expect(fontSelect().value).toBe("poppins");
  });

  it("a custom hex typed in Advanced survives a round-trip through Basic mode", () => {
    render(<AppearanceForm {...SAVED} fontOptions={FONT_OPTIONS} />);

    fireEvent.change(brandHexInput(), { target: { value: "#123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Basic" }));
    fireEvent.click(screen.getByRole("button", { name: "Advanced" }));

    expect(brandHexInput().value).toBe("#123456");
  });
});
