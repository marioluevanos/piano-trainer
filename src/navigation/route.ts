/**
 * The app's pages and their URLs. The home page has no query; a song's
 * training page is `?song=<id>`; the practice activity page is `?activity`.
 * URLs stay relative so they work under any base path, including a Capacitor
 * WebView.
 *
 * DOM-free so it runs directly under Node in tests.
 */
export type Route =
  | { page: "home" }
  | { page: "training"; songId: string }
  | { page: "activity" };

export const HOME: Route = { page: "home" };
export const ACTIVITY: Route = { page: "activity" };

/** The route for a URL query string such as `location.search`. */
export function parseRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const songId = params.get("song");
  if (songId) return { page: "training", songId };
  return params.has("activity") ? ACTIVITY : HOME;
}

/** The relative URL of a route, for `history.pushState`. */
export function routeUrl(route: Route): string {
  switch (route.page) {
    case "training":
      return `?${new URLSearchParams({ song: route.songId })}`;
    case "activity":
      return "?activity";
    case "home":
      return "./";
  }
}
