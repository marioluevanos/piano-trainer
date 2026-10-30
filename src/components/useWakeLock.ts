import { useEffect } from "react";

/**
 * Keeps the screen awake while `active` is true and the calling component is
 * mounted, through the Screen Wake Lock API. The browser drops the lock on its
 * own when the page is hidden (another tab, the home screen), so it is asked
 * for again when the page is visible once more. Browsers without the API, or
 * that refuse it (low battery, a tab in the background), are left alone.
 */
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    const acquire = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const lock = await navigator.wakeLock.request("screen");
        // Released while the request was pending: let it go again.
        if (cancelled) lock.release().catch(() => {});
        else sentinel = lock;
      } catch {
        // Denied (battery saver, page hidden meanwhile); nothing to hold.
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") acquire();
    };

    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
      sentinel = null;
    };
  }, [active]);
}
