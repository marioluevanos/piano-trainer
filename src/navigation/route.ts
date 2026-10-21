/**
 * The app's pages and their URLs. The home page has no query; a song's
 * training page is `?song=<id>`. URLs stay relative so they work under any
 * base path, including a Capacitor WebView.
 *
 * DOM-free so it runs directly under Node in tests.
 */
export type Route = { page: "home" } | { page: "training"; songId: string };

export const HOME: Route = { page: "home" };

/** The route for a URL query string such as `location.search`. */
export function parseRoute(search: string): Route {
  const songId = new URLSearchParams(search).get("song");
  return songId ? { page: "training", songId } : HOME;
}

/** The relative URL of a route, for `history.pushState`. */
export function routeUrl(route: Route): string {
  return route.page === "training"
    ? `?${new URLSearchParams({ song: route.songId })}`
    : "./";
}
