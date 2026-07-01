"use client";

import { useState } from "react";
import { ColorField } from "./ColorField";
import { PrettySelect } from "@/components/PrettySelect";
import { Button } from "@/components/Button";
import { contrastTextColor, passesWhiteTextAA } from "@/lib/theme/color";
import { PLATFORM_DEFAULT_APPEARANCE } from "@/lib/theme/defaults";
import { fontCssVar } from "@/lib/theme/fontKeys";
import { APPEARANCE_PRESETS, matchingPresetKey } from "@/lib/theme/presets";
import { cn } from "@/lib/utils";

interface AppearanceValues {
  brandColor: string;
  accentColor: string;
  backgroundColor: string;
  fontKey: string;
}

interface AppearanceFormProps extends AppearanceValues {
  fontOptions: ReadonlyArray<{ value: string; label: string }>;
}

/**
 * Colors + font fields, live preview, and the reset actions.
 *
 * "Basic" mode picks one of a curated set of preset bundles; "Advanced" is
 * the original four individual controls. Both — like the two "Reset ..."
 * buttons — only repopulate the fields shown here; nothing here calls a
 * server action. The admin still clicks "Save appearance" to persist,
 * exactly like manually picking a color, so a stray click never instantly
 * changes the live site.
 */
export function AppearanceForm({
  brandColor: savedBrand,
  accentColor: savedAccent,
  backgroundColor: savedBackground,
  fontKey: savedFontKey,
  fontOptions,
}: AppearanceFormProps) {
  const [brand, setBrand] = useState(savedBrand);
  const [accent, setAccent] = useState(savedAccent);
  const [background, setBackground] = useState(savedBackground);
  const [fontKey, setFontKey] = useState(savedFontKey);

  // Bumping `resetEpoch` changes the color fields' React `key`, forcing a
  // remount so the (intentionally uncontrolled-while-typing) inputs pick up
  // the new starting value instead of ignoring it the way a live `value`
  // prop update would while the user is mid-keystroke elsewhere. Their
  // `defaultValue` reads `brand`/`accent`/`background` directly (not a
  // separately-tracked "seed") so a remount triggered by something else —
  // e.g. toggling Basic/Advanced — always reflects the latest typed value,
  // not a stale snapshot from the last preset click.
  const [resetEpoch, setResetEpoch] = useState(0);

  // Default to Basic when the saved theme is exactly one of the presets
  // (nothing to lose by showing it there); otherwise it's a custom config
  // Basic can't represent, so open on Advanced.
  const [mode, setMode] = useState<"basic" | "advanced">(() =>
    matchingPresetKey({
      brandColor: savedBrand,
      accentColor: savedAccent,
      backgroundColor: savedBackground,
      fontKey: savedFontKey,
    })
      ? "basic"
      : "advanced"
  );

  function applyPreset(values: AppearanceValues) {
    setResetEpoch((e) => e + 1);
    setBrand(values.brandColor);
    setAccent(values.accentColor);
    setBackground(values.backgroundColor);
    setFontKey(values.fontKey);
  }

  const brandWarning = !passesWhiteTextAA(brand);
  const accentWarning = !passesWhiteTextAA(accent);
  const selectedPresetKey = matchingPresetKey({
    brandColor: brand,
    accentColor: accent,
    backgroundColor: background,
    fontKey,
  });

  return (
    <div className="space-y-4">
      <div className="inline-flex rounded-full border border-neutral-200 p-0.5 text-sm">
        {(
          [
            { key: "basic", label: "Basic" },
            { key: "advanced", label: "Advanced" },
          ] as const
        ).map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setMode(key)}
            className={cn(
              "rounded-full px-3 py-1 font-medium transition-colors",
              mode === key
                ? "bg-brand text-brand-contrast"
                : "text-neutral-600 hover:text-brand"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <div className="space-y-3">
          {mode === "basic" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {APPEARANCE_PRESETS.map((preset) => {
                const isSelected = preset.key === selectedPresetKey;
                return (
                  <button
                    key={preset.key}
                    type="button"
                    onClick={() => applyPreset(preset)}
                    aria-pressed={isSelected}
                    className={cn(
                      "flex flex-col items-start gap-2 rounded-xl border p-3 text-left transition",
                      isSelected
                        ? "border-brand ring-2 ring-brand-soft"
                        : "border-neutral-200 hover:border-brand-soft"
                    )}
                    style={{ background: preset.backgroundColor }}
                  >
                    <div className="flex gap-1.5">
                      <span
                        aria-hidden
                        className="h-5 w-5 rounded-full border border-white shadow-sm"
                        style={{ background: preset.brandColor }}
                      />
                      <span
                        aria-hidden
                        className="h-5 w-5 rounded-full border border-white shadow-sm"
                        style={{ background: preset.accentColor }}
                      />
                    </div>
                    <span
                      className="text-sm font-semibold"
                      style={{
                        color: preset.brandColor,
                        fontFamily: `var(${fontCssVar(preset.fontKey)})`,
                      }}
                    >
                      {preset.name}
                    </span>
                    {isSelected && (
                      <span className="text-xs font-medium text-brand">Current</span>
                    )}
                  </button>
                );
              })}
            </div>
          ) : (
            <>
              <ColorField
                key={`brand-${resetEpoch}`}
                name="brandColor"
                label="Brand"
                defaultValue={brand}
                onChange={setBrand}
              />
              {brandWarning && (
                <p className="text-xs text-amber-700">
                  This brand color is light — button text automatically switches to dark
                  for readability.
                </p>
              )}
              <ColorField
                key={`accent-${resetEpoch}`}
                name="accentColor"
                label="Accent"
                defaultValue={accent}
                onChange={setAccent}
              />
              {accentWarning && (
                <p className="text-xs text-amber-700">
                  This accent color is light — its text automatically switches to dark
                  for readability.
                </p>
              )}
              <ColorField
                key={`background-${resetEpoch}`}
                name="backgroundColor"
                label="Background"
                defaultValue={background}
                onChange={setBackground}
              />

              <div className="flex items-center gap-2">
                <label className="w-28 shrink-0 text-sm font-medium text-neutral-700">
                  Font
                </label>
                <PrettySelect
                  name="fontKey"
                  value={fontKey}
                  onChange={setFontKey}
                  options={fontOptions}
                  ariaLabel="Curated font"
                  triggerClassName="max-w-xs"
                />
              </div>
            </>
          )}

          {/* Basic mode still needs these posted with the form. */}
          {mode === "basic" && (
            <>
              <input type="hidden" name="brandColor" value={brand} />
              <input type="hidden" name="accentColor" value={accent} />
              <input type="hidden" name="backgroundColor" value={background} />
              <input type="hidden" name="fontKey" value={fontKey} />
            </>
          )}
        </div>

        <div
          className="space-y-3 rounded-2xl border border-neutral-200 p-4"
          style={{ background }}
        >
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
            Live preview
          </p>
          <div className="rounded-xl bg-white p-3 shadow-sm">
            <p className="text-sm font-medium" style={{ color: brand }}>
              Book an appointment
            </p>
            <div className="mt-2 flex gap-2">
              <span
                className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium"
                style={{ background: brand, color: contrastTextColor(brand) }}
              >
                Primary button
              </span>
              <span
                className="inline-flex items-center rounded-full px-3 py-1.5 text-sm font-medium"
                style={{ background: accent, color: contrastTextColor(accent) }}
              >
                Accent button
              </span>
            </div>
            <p className="mt-2 text-sm underline" style={{ color: brand }}>
              A themed link
            </p>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-neutral-200 pt-3">
        <Button type="submit">Save appearance</Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() =>
            applyPreset({
              brandColor: savedBrand,
              accentColor: savedAccent,
              backgroundColor: savedBackground,
              fontKey: savedFontKey,
            })
          }
        >
          Reset to last saved
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => applyPreset(PLATFORM_DEFAULT_APPEARANCE)}
        >
          Reset to default
        </Button>
      </div>
    </div>
  );
}
