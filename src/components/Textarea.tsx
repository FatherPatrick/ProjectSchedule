import { cn } from "@/lib/utils";

/**
 * Standard bordered textarea matching TextInput's surface. Forwards every
 * native textarea prop (and `ref`, via React 19's ref-as-prop). Override
 * sizing/etc. through `className`.
 */
export function Textarea({
  className,
  ...props
}: React.ComponentPropsWithRef<"textarea">) {
  return (
    <textarea
      className={cn("rounded-lg border border-neutral-300 px-3 py-2", className)}
      {...props}
    />
  );
}
