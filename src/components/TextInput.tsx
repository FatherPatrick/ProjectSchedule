import { cn } from "@/lib/utils";

/**
 * Standard bordered text input used across the app's forms. Forwards every
 * native input prop (and `ref`, via React 19's ref-as-prop) so it drops in
 * for controlled inputs, uncontrolled `defaultValue`s, and form-library
 * registration alike. Override padding/width/etc. through `className`.
 */
export function TextInput({
  className,
  ...props
}: React.ComponentPropsWithRef<"input">) {
  return (
    <input
      className={cn("rounded-lg border border-neutral-300 px-3 py-2", className)}
      {...props}
    />
  );
}
