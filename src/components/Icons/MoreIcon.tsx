import { Icon, type IconProps } from "./Icon";

/** Three vertical dots, for a "more actions" menu. */
export function MoreIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M12 8a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm0 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
    </Icon>
  );
}
