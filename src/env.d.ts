/** Build timestamp, injected by `define` in vite.config.ts. */
declare const __BUILD_TIME__: string;

interface ImportMetaEnv {
  /** The sheet music scanner's URL (omr/); unset hides the Scan sheet music button. */
  readonly VITE_OMR_URL?: string;
}
