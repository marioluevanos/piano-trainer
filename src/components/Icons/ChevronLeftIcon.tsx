import { Icon, type IconProps } from "./Icon";

/** A left-pointing chevron, for going back or to the previous note. */
export function ChevronLeftIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M15.4 7.4 14 6l-6 6 6 6 1.4-1.4-4.6-4.6z" />
    </Icon>
  );
}
