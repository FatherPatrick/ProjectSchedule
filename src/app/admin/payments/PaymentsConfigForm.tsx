"use client";

import { useState } from "react";
import { PrettySelect } from "@/components/PrettySelect";
import { Button } from "@/components/Button";

const MODE_OPTIONS = [
  { value: "NONE", label: "None", description: "Pay in person — current behavior." },
  { value: "DEPOSIT", label: "Deposit", description: "Collect a deposit at booking." },
  { value: "FULL", label: "Full payment", description: "Collect the full price at booking." },
] as const;

const DEPOSIT_TYPE_OPTIONS = [
  { value: "FIXED", label: "Fixed amount" },
  { value: "PERCENT", label: "Percent of price" },
] as const;

interface PaymentsConfigFormProps {
  chargesEnabled: boolean;
  paymentsEnabled: boolean;
  paymentMode: "NONE" | "DEPOSIT" | "FULL";
  depositType: "FIXED" | "PERCENT";
  depositCents: number | null;
  depositPercent: number | null;
}

export function PaymentsConfigForm({
  chargesEnabled,
  paymentsEnabled: savedEnabled,
  paymentMode: savedMode,
  depositType: savedDepositType,
  depositCents,
  depositPercent,
}: PaymentsConfigFormProps) {
  const [enabled, setEnabled] = useState(savedEnabled);
  const [mode, setMode] = useState<"NONE" | "DEPOSIT" | "FULL">(savedMode);
  const [depositType, setDepositType] = useState<"FIXED" | "PERCENT">(savedDepositType);

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <input
          type="checkbox"
          name="paymentsEnabled"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!chargesEnabled}
          className="h-4 w-4 rounded border-neutral-300"
        />
        Enable online payments
      </label>
      {!chargesEnabled && (
        <p className="text-xs text-amber-700">
          Finish connecting Stripe above before payments can be turned on.
        </p>
      )}

      <div className="flex items-center gap-2">
        <label className="w-32 shrink-0 text-sm font-medium text-neutral-700">
          Payment mode
        </label>
        <PrettySelect
          name="paymentMode"
          value={mode}
          onChange={setMode}
          options={MODE_OPTIONS}
          ariaLabel="Payment mode"
          triggerClassName="max-w-xs"
        />
      </div>

      {mode === "DEPOSIT" && (
        <div className="space-y-3 rounded-xl border border-neutral-200 p-3">
          <div className="flex items-center gap-2">
            <label className="w-32 shrink-0 text-sm font-medium text-neutral-700">
              Deposit type
            </label>
            <PrettySelect
              name="depositType"
              value={depositType}
              onChange={setDepositType}
              options={DEPOSIT_TYPE_OPTIONS}
              ariaLabel="Deposit type"
              triggerClassName="max-w-xs"
            />
          </div>
          {depositType === "FIXED" ? (
            <div className="flex items-center gap-2">
              <label className="w-32 shrink-0 text-sm font-medium text-neutral-700">
                Amount ($)
              </label>
              <input
                type="number"
                name="depositDollars"
                min={0.5}
                step={0.01}
                defaultValue={depositCents != null ? depositCents / 100 : ""}
                className="w-32 rounded-xl border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <label className="w-32 shrink-0 text-sm font-medium text-neutral-700">
                Percent (%)
              </label>
              <input
                type="number"
                name="depositPercent"
                min={1}
                max={100}
                defaultValue={depositPercent ?? ""}
                className="w-32 rounded-xl border border-neutral-300 px-3 py-1.5 text-sm"
              />
            </div>
          )}
        </div>
      )}

      <div className="border-t border-neutral-200 pt-3">
        <Button type="submit">Save payment settings</Button>
      </div>
    </div>
  );
}
