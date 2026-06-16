import { cn } from "@/lib/utils";

export type AlertTone = "success" | "error" | "warning" | "info";

/**
 * Tone → border/background/text classes for the app's colored panels.
 * Exported so other surfaces (e.g. AdminToaster) can reuse the same palette.
 */
export const ALERT_TONES: Record<AlertTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900",
  error: "border-rose-200 bg-rose-50 text-rose-900",
  warning: "border-amber-200 bg-amber-50 text-amber-900",
  info: "border-neutral-200 bg-neutral-50 text-neutral-700",
};

export interface AlertProps {
  tone?: AlertTone;
  /** ARIA role: "status" for success/info, "alert" for errors. */
  role?: "status" | "alert";
  className?: string;
  children: React.ReactNode;
}

/**
 * Colored status / notification panel. The default surface is
 * `rounded-2xl border p-4 text-sm`; override padding/rounding/etc. via
 * `className` (tailwind-merge wins) — e.g. result cards pass `className="p-6"`
 * and compose their own heading + actions as children.
 */
export function Alert({ tone = "info", role, className, children }: AlertProps) {
  return (
    <div
      role={role}
      className={cn("rounded-2xl border p-4 text-sm", ALERT_TONES[tone], className)}
    >
      {children}
    </div>
  );
}
