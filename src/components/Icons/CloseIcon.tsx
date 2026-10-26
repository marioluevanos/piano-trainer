import { Icon, type IconProps } from "./Icon";

/** An X, for removing or closing something. */
export function CloseIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path fill="currentColor" d="m6.4 5 5.6 5.6L17.6 5 19 6.4 13.4 12l5.6 5.6-1.4 1.4-5.6-5.6L6.4 19 5 17.6l5.6-5.6L5 6.4 6.4 5Z" />
    </Icon>
  );
}
