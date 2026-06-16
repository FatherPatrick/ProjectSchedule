import { cn } from "@/lib/utils";

type CardOwnProps<E extends React.ElementType> = {
  /** Element to render. Defaults to "div"; use "form"/"section"/"fieldset"
   *  to keep the right semantics (and prop types) for the context. */
  as?: E;
  className?: string;
};

type CardProps<E extends React.ElementType> = CardOwnProps<E> &
  Omit<React.ComponentPropsWithoutRef<E>, keyof CardOwnProps<E>>;

/**
 * The white rounded panel used throughout the app. Polymorphic via `as` so a
 * panel can be a <form>, <section>, or <fieldset> while sharing one surface
 * style. Spacing (`space-y-*`) is left to the caller via `className`.
 */
export function Card<E extends React.ElementType = "div">({
  as,
  className,
  ...props
}: CardProps<E>) {
  const Tag = (as ?? "div") as React.ElementType;
  return (
    <Tag
      className={cn(
        "rounded-2xl border border-neutral-200 bg-white p-4",
        className
      )}
      {...props}
    />
  );
}
