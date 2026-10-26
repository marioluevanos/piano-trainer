import { Icon, type IconProps } from "./Icon";

/** Four squares, for a grid layout. */
export function GridIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M3 3h8v8H3V3Zm10 0h8v8h-8V3ZM3 13h8v8H3v-8Zm10 0h8v8h-8v-8Z" />
    </Icon>
  );
}
