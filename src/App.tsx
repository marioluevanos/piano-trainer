import { useEffect, useState } from "react";
import { HomePage } from "./pages/HomePage/HomePage";
import { TrainingPage } from "./pages/TrainingPage/TrainingPage";
import { loadPiano } from "./midi/synth";
import {
  loadSelectedSongId,
  saveSelectedSongId,
  useSongLibrary,
  type ImportedSong,
  type SongDetails,
} from "./songs/library";
import { useNavigation } from "./navigation/useNavigation";
import { useFullscreen } from "./components/useFullscreen";

export default function App() {
  const library = useSongLibrary();
  const { route, openSong, goHome } = useNavigation();

  // The song being trained on, or on the home page the one trained on last.
  const [songId, setSongId] = useState(loadSelectedSongId);
  const routeSongId = route.page === "training" ? route.songId : null;
  if (routeSongId && routeSongId !== songId) setSongId(routeSongId);
  useEffect(() => {
    if (songId) saveSelectedSongId(songId);
  }, [songId]);

  // The installed app uses the whole screen, without the phone's system bars.
  useFullscreen();

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
          lastSongId={songId}
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
