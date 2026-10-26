import { Icon, type IconProps } from "./Icon";

/** A trash can, for deleting. */
export function TrashIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M9 3v1H4v2h16V4h-5V3H9ZM6 8l1 13h10l1-13H6Zm4 2h1v9h-1v-9Zm3 0h1v9h-1v-9Z" />
    </Icon>
  );
}
