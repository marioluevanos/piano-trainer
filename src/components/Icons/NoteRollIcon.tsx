import { Icon, type IconProps } from "./Icon";

/** Bars falling onto a line, for the falling notes view. */
export function NoteRollIcon(props: IconProps) {
  return (
    <Icon fill="currentColor" {...props}>
      <rect x="4" y="3" width="4" height="9" rx="1.5" />
      <rect x="10" y="7.5" width="4" height="11.5" rx="1.5" />
      <rect x="16" y="2" width="4" height="7" rx="1.5" />
      <path
        d="M3 21.5h18"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </Icon>
  );
}
