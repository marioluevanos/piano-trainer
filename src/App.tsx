import { useEffect, useState } from "react";
import { HomePage } from "./pages/HomePage/HomePage";
import { TrainingPage } from "./pages/TrainingPage/TrainingPage";
import { loadPiano } from "./midi/synth";
import {
  useSongLibrary,
  type ImportedSong,
  type SongDetails,
} from "./songs/library";
import {
  loadRecentSongIds,
  saveRecentSongIds,
  withRecentSong,
} from "./songs/recent";
import { useNavigation } from "./navigation/useNavigation";

export default function App() {
  const library = useSongLibrary();
  const { route, openSong, goHome } = useNavigation();

  // The songs trained on, newest first; the one being trained on leads.
  const [recentIds, setRecentIds] = useState(loadRecentSongIds);
  const routeSongId = route.page === "training" ? route.songId : null;
  if (routeSongId && routeSongId !== recentIds[0])
    setRecentIds(withRecentSong(recentIds, routeSongId));
  useEffect(() => {
    if (recentIds.length) saveRecentSongIds(recentIds);
  }, [recentIds]);

  // Fetch the piano samples up front so the first note does not fall back to the plain tone.
  useEffect(() => {
    void loadPiano();
  }, []);

  const onAddSong = async (song: ImportedSong, details: SongDetails) => {
    const added = await library.addSong(song, details);
    openSong(added.id);
  };

  switch (route.page) {
    case "home":
      return (
        <HomePage
          songs={library.songs}
          recentIds={recentIds}
          loading={library.loading}
          error={library.error}
          user={library.user}
          onOpen={openSong}
          onAdd={onAddSong}
          onEdit={library.editSong}
          onRemove={library.removeSong}
          onSignIn={library.signIn}
          onSignOut={library.signOut}
        />
      );
    case "training":
      return (
        // Keyed on the song so opening another one starts from a clean slate.
        <TrainingPage
          key={route.songId}
          song={library.songs.find((s) => s.id === route.songId)}
          loading={library.loading}
          signedIn={library.user !== null}
          onHome={goHome}
        />
      );
  }
}
