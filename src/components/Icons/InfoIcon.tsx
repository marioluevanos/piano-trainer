import { Icon, type IconProps } from "./Icon";

/** An "i" in a filled circle. */
export function InfoIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20Zm1 15h-2v-6h2v6Zm0-8h-2V7h2v2Z" />
    </Icon>
  );
}
