import { Icon, type IconProps } from "./Icon";

/** A play triangle. */
export function PlayIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M8 5v14l11-7z" />
    </Icon>
  );
}
