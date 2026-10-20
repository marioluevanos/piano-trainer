import type { ComponentPropsWithRef } from "react";
import "./Button.css";

interface Props extends ComponentPropsWithRef<"button"> {
  /**
   * "primary" fills with the accent color; "ghost" has no background until hovered;
   * "danger" is a ghost in the error color; "overlay" sits on a dark scrim over a cover image.
   */
  variant?: "default" | "primary" | "ghost" | "danger" | "overlay";
  /** Height in px: xs 24, sm 32, md 36, lg 40. Icon buttons are square at that size. */
  size?: "xs" | "sm" | "md" | "lg";
  /** A square button holding only an icon. */
  icon?: boolean;
  /** A circle instead of a rounded rectangle. */
  round?: boolean;
  /** Shows the button switched on, e.g. a toggle that is pressed or a menu that is open. */
  active?: boolean;
}

/** The app's one button. Defaults to type="button" so it never submits a form by accident. */
export function Button({
  variant = "default",
  size = "md",
  icon = false,
  round = false,
  active = false,
  type = "button",
  className,
  ...rest
}: Props) {
  const classes = [
    "button",
    variant !== "default" && variant,
    size !== "md" && size,
    icon && "icon",
    round && "round",
    active && "active",
    className,
  ]
    .filter(Boolean)
    .join(" ");
  return <button type={type} className={classes} {...rest} />;
}
