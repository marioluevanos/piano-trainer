import { Icon, type IconProps } from "./Icon";

/** A flame, for practice streaks. */
export function FlameIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        fill="currentColor"
        d="M12 2c.6 3.4 2.4 5.2 4.3 7.1C18 10.9 19 12.8 19 15a7 7 0 0 1-14 0c0-1.8.6-3.3 1.6-4.6.3 1 .9 1.8 1.9 2.2C8.1 9.3 9.6 5.4 12 2Zm0 18a3.5 3.5 0 0 0 3.5-3.5c0-1.6-1-2.4-1.8-3.4-.6 1.2-1.6 1.8-2.4 2.2-.9.4-1.3 1-1.3 1.9A2.3 2.3 0 0 0 12 20Z"
      />
    </Icon>
  );
}
