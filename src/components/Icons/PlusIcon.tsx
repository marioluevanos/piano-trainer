import { Icon, type IconProps } from "./Icon";

/** A plus sign, for adding something. */
export function PlusIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6V5Z" />
    </Icon>
  );
}
