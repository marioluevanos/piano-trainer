import { Icon, type IconProps } from "./Icon";

/** A right-pointing chevron, for the next note. */
export function ChevronRightIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M8.6 16.6 10 18l6-6-6-6-1.4 1.4 4.6 4.6z" />
    </Icon>
  );
}
