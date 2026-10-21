import { useCallback, useEffect, useState } from "react";
import { HOME, parseRoute, routeUrl, type Route } from "./route";

/** Marks history entries pushed by the app, which have the home page behind them. */
type EntryState = { fromHome: true } | null;

const currentRoute = () => parseRoute(location.search);

/**
 * The current page, kept in sync with the URL and browser history. Opening a
 * song pushes a history entry, so the browser (or Android) back button returns
 * to the song list, and a reload or shared link lands on the same page.
 */
export function useNavigation() {
  const [route, setRoute] = useState<Route>(currentRoute);

  useEffect(() => {
    const onPopState = () => setRoute(currentRoute());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const openSong = useCallback((songId: string) => {
    const next: Route = { page: "training", songId };
    const state: EntryState = { fromHome: true };
    history.pushState(state, "", routeUrl(next));
    setRoute(next);
  }, []);

  const goHome = useCallback(() => {
    // A page opened from a link or bookmark has no home entry to go back to,
    // so replace it rather than leave the app.
    if ((history.state as EntryState)?.fromHome) {
      history.back();
    } else {
      history.replaceState(null, "", routeUrl(HOME));
      setRoute(HOME);
    }
  }, []);

  return { route, openSong, goHome };
}
