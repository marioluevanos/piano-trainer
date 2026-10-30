import { Icon, type IconProps } from "./Icon";

/** A metronome, for the speed. */
export function MetronomeIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        fill="currentColor"
        d="M8.5 2h7l3.2 16H21v2H3v-2h2.3L8.5 2Zm1.6 2L7.4 18h9.2l-1.1-5.8-2 2.3-1.5-1.3 3-3.5L13.9 4h-3.8ZM19 5l1.7 1-2.6 4.6-1.7-1L19 5Z"
      />
    </Icon>
  );
}
