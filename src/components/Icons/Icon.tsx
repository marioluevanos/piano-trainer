import type { ComponentPropsWithoutRef } from "react";

export interface IconProps extends ComponentPropsWithoutRef<"svg"> {
  /** Width and height in px. */
  size?: number;
}

/** The 24×24 frame every icon draws in. Hidden from screen readers; label the button instead. */
export function Icon({ size = 20, children, ...rest }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}
