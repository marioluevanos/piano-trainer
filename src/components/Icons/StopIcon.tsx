import { Icon, type IconProps } from "./Icon";

/** A stop square. */
export function StopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M6 6h12v12H6z" />
    </Icon>
  );
}
