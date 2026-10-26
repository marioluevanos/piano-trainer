import { Icon, type IconProps } from "./Icon";

/** An arrow into a tray, for downloading a file. */
export function DownloadIcon(props: IconProps) {
  return (
    <Icon {...props}>
      <path
        fill="currentColor"
        d="M11 3h2v9.17l3.59-3.58L18 10l-6 6-6-6 1.41-1.41L11 12.17V3ZM4 15h2v4h12v-4h2v6H4v-6Z"
      />
    </Icon>
  );
}
