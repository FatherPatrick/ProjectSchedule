import { cn } from "@/lib/utils";

export type ButtonVariant = "primary" | "secondary" | "danger" | "success";
export type ButtonSize = "sm" | "md" | "lg";

export const VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-pink-600 text-white hover:bg-pink-700 disabled:bg-neutral-300 disabled:cursor-not-allowed",
  secondary:
    "border border-neutral-300 text-neutral-700 hover:bg-neutral-50 disabled:opacity-50",
  danger:
    "border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-50",
  success:
    "border border-emerald-300 text-emerald-800 hover:bg-emerald-50 disabled:opacity-50",
};

export const SIZES: Record<ButtonSize, string> = {
  sm: "px-3 py-1 text-sm",
  md: "px-4 py-2",
  lg: "px-5 py-2.5",
};

/**
 * Shared class generator for the pill button family. Both `Button` (a real
 * <button>) and `ButtonLink` (a next/link anchor styled as a button) compose
 * their classes through this, so the two never drift. Extra `className` wins
 * via tailwind-merge.
 */
export function buttonClasses(opts: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) {
  return cn(
    "inline-flex items-center justify-center rounded-full font-medium transition-colors",
    VARIANTS[opts.variant ?? "primary"],
    SIZES[opts.size ?? "md"],
    opts.fullWidth && "w-full",
    opts.className
  );
}

export interface ButtonProps extends React.ComponentPropsWithRef<"button"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * The app's pill button. `variant` picks the colour treatment, `size` the
 * padding. `type` is intentionally left to the native default ("submit") so
 * existing server-action forms keep working — pass `type="button"` for
 * non-submitting actions. Any extra className wins via tailwind-merge.
 */
export function Button({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    />
  );
}
