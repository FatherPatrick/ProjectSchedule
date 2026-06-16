import Link from "next/link";
import { buttonClasses, type ButtonSize, type ButtonVariant } from "./Button";

export interface ButtonLinkProps
  extends React.ComponentPropsWithoutRef<typeof Link> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

/**
 * An anchor (next/link) styled as a button. Use for navigational CTAs that
 * should look like buttons — e.g. the home-page "Book an appointment" link —
 * so they share the exact pill styling without being <button>s.
 */
export function ButtonLink({
  variant,
  size,
  fullWidth,
  className,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    />
  );
}
