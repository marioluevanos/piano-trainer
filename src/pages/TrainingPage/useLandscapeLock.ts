import { useEffect } from "react";

type LockableOrientation = ScreenOrientation & {
  lock?: (orientation: "landscape") => Promise<void>;
};

/**
 * Locks the screen to landscape while the calling page is mounted. Browsers
 * only allow the lock in an installed PWA (or fullscreen), so in a browser tab
 * it quietly does nothing.
 */
export function useLandscapeLock() {
  useEffect(() => {
    const orientation = screen.orientation as LockableOrientation;
    orientation.lock?.("landscape").catch(() => {});
    return () => orientation.unlock?.();
  }, []);
}
