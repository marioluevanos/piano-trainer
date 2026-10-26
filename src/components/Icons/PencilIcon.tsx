import { Icon, type IconProps } from "./Icon";

/** A pencil, for editing. */
export function PencilIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25ZM20.7 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z" />
    </Icon>
  );
}
