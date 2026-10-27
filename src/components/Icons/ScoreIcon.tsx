import { Icon, type IconProps } from "./Icon";

/** A note on staff lines, for the sheet music view. */
export function ScoreIcon(props: IconProps) {
  return (
    <Icon fill="none" stroke="currentColor" strokeWidth="1.75" {...props}>
      <path d="M3 6h18M3 10h18M3 14h18M3 18h18" opacity="0.55" />
      <path d="M12.5 16V4.5" />
      <ellipse
        cx="9.5"
        cy="16.5"
        rx="3.4"
        ry="2.4"
        fill="currentColor"
        stroke="none"
        transform="rotate(-18 9.5 16.5)"
      />
    </Icon>
  );
}
