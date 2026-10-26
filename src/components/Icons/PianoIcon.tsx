import { Icon, type IconProps } from "./Icon";

/** An outline of piano keys, for playing along on a keyboard. */
export function PianoIcon(props: IconProps) {
  return (
    <Icon
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      {...props}
    >
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 13v7M15 13v7" />
      <path
        fill="currentColor"
        stroke="none"
        d="M7.5 4h3v9h-3zM13.5 4h3v9h-3z"
      />
    </Icon>
  );
}
