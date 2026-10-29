import { useEffect } from "react";

/** Phones and tablets; an app installed on a desktop is left alone. */
const TOUCH_QUERY = "(pointer: coarse)";
/**
 * An installed PWA running with system bars, as the manifest's
 * `display: standalone` asks. A browser tab reports "browser", and an app
 * already fullscreen (an install from an older manifest) "fullscreen".
 */
const WINDOWED_APP_QUERY =
  "(display-mode: standalone), (display-mode: minimal-ui)";

/**
 * Makes an installed app on a touch device fullscreen while the calling page
 * is mounted, hiding the phone's status and navigation bars, and gives them
 * back when the page unmounts. Browsers only grant fullscreen in response to
 * a tap, so it is requested on every tap while not fullscreen: the first after
 * the page opens, and the first after the back gesture or a file picker left
 * it. A browser tab is never made fullscreen.
 */
export function useFullscreen() {
  useEffect(() => {
    const root = document.documentElement;
    // Checked once at launch: entering fullscreen changes the display mode too.
    const applies =
      matchMedia(TOUCH_QUERY).matches &&
      matchMedia(WINDOWED_APP_QUERY).matches &&
      Boolean(root.requestFullscreen);
    if (!applies) return;

    const enter = () => {
      if (document.fullscreenElement) return;
      root.requestFullscreen({ navigationUI: "auto" }).catch(() => {});
    };
    // Touch input grants the activation fullscreen needs on pointerup, not pointerdown.
    window.addEventListener("pointerup", enter);
    return () => window.removeEventListener("pointerup", enter);
  }, []);
}
