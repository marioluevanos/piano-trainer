# Pages

Each folder here is one screen of the app, chosen by the URL. App renders exactly one page at a time and keeps only what pages share (the song library, navigation, the last song); everything else lives in the page that uses it.

| Page                                        | URL           | What it is                                               |
| ------------------------------------------- | ------------- | -------------------------------------------------------- |
| [HomePage](HomePage/HomePage.tsx)           | `./`          | The song list: open, import, edit and remove songs       |
| [TrainingPage](TrainingPage/TrainingPage.tsx) | `?song=<id>` | Practicing one song: toolbar, keyboard, score and status |

Pages are made of the reusable pieces in [src/components/](../components/). A component that only one page needs can still live there; a page is what a route maps to.

## How routing works

- [src/navigation/route.ts](../navigation/route.ts) defines `Route`, a union with one member per page, and converts between routes and URLs (`parseRoute`, `routeUrl`). It is pure and tested in `route.test.ts`.
- [src/navigation/useNavigation.ts](../navigation/useNavigation.ts) keeps the current `Route` in sync with the URL and browser history, and exposes one function per way of moving between pages (`openSong`, `goHome`).
- [src/App.tsx](../App.tsx) switches on `route.page` and renders the matching page.

URLs are query strings (`?song=<id>`), not paths, and stay relative. That keeps them working under `base: "./"`, on any hosting path and inside the Capacitor WebView, with no server rewrites.

## Adding a page

Say we add a stats page at `?stats`.

1. **Create the folder.** `src/pages/StatsPage/StatsPage.tsx` exporting `StatsPage`, with its styles in `StatsPage.css` next to it, imported by the component. Give the root element a class named after the page (`stats-page`) and scope the page's CSS under it. Use the color variables from `:root` in [src/styles.css](../styles.css); do not write literal colors.

2. **Add the route** in `route.ts`:

   ```ts
   export type Route =
     | { page: "home" }
     | { page: "training"; songId: string }
     | { page: "stats" };
   ```

   Teach `parseRoute` to recognise the URL and `routeUrl` to produce it. Check more specific queries first, and keep every unknown URL falling back to `HOME`. Add a test to `route.test.ts` that the new route round-trips through its URL.

3. **Add a way to get there** in `useNavigation.ts`, following `openSong`: build the `Route`, `history.pushState({ fromHome: true }, "", routeUrl(next))`, then `setRoute(next)`. Push (not replace) so the browser and Android back buttons return to where the user came from. Return it from the hook alongside `openSong` and `goHome`.

4. **Render it** in `App.tsx` by adding a `case "stats":` to the `switch`. TypeScript reports the switch as incomplete until you do, since `App` must return on every route. Pass the page only what it needs: data from `useSongLibrary` and callbacks from `useNavigation` such as `goHome`.

5. **Run `npm test` and `npm run build`.**

### Things to keep in mind

- **State belongs to the page.** A page unmounts when the user leaves it, so its state resets and its effects clean up (playback stops, listeners detach). Put state in App only when another page needs it too, as with the last opened song.
- **Use `key` to reset a page between parameters.** App renders `<TrainingPage key={route.songId} />`, so opening a different song mounts a fresh page instead of carrying over the old song's loop, steps and engine state. Do the same for any page whose route carries an id.
- **Every page must survive a reload or a shared link.** The route is all a page gets on a cold start, so a page must handle its data not being loaded yet (the library is still `loading`) or no longer existing.
- **Leaving a page.** `goHome` goes back when the home page is behind the current entry and replaces the entry otherwise, so a page opened from a link does not leave the app. A new "back" action should follow the same rule.
- **Page-wide side effects** such as the training page's landscape lock go in an effect in that page, undone in the effect's cleanup.
