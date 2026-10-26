import { Icon, type IconProps } from "./Icon";

/** Rows of bullets and lines, for a list layout. */
export function ListIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M3 5h4v4H3V5Zm6 1h12v2H9V6Zm-6 4h4v4H3v-4Zm6 1h12v2H9v-2Zm-6 4h4v4H3v-4Zm6 1h12v2H9v-2Z" />
    </Icon>
  );
}
