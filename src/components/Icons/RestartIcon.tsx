import { Icon, type IconProps } from "./Icon";

/** A counterclockwise arrow, for going back to the start. */
export function RestartIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        fill="currentColor"
        d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8Z"
      />
    </Icon>
  );
}
