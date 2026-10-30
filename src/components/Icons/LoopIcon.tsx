import { Icon, type IconProps } from "./Icon";

/** Two arrows chasing each other, for a loop. */
export function LoopIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        fill="currentColor"
        d="M17 2 21 6l-4 4V7H7a2 2 0 0 0-2 2v2H3V9a4 4 0 0 1 4-4h10V2ZM7 22l-4-4 4-4v3h10a2 2 0 0 0 2-2v-2h2v2a4 4 0 0 1-4 4H7v3Z"
      />
    </Icon>
  );
}
