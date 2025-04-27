"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Image from "next/image";
import { toPng } from "html-to-image";

interface SearchResult {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number;
  thumbnailUrl?: string;
  previewUrl?: string;
}

const MAX_SELECTED_LINES = 4;

const fontOptions = [
  { name: "Geist Sans", value: "var(--font-geist-sans)" },
  { name: "Geist Mono", value: "var(--font-geist-mono)" },
  { name: "Inter", value: "Inter, sans-serif" },
  { name: "Roboto Mono", value: '"Roboto Mono", monospace' },
  { name: "Merriweather", value: "Merriweather, serif" },
];

const gradientPresets = [
  { name: "Default", value: "bg-gradient-to-br from-purple-600 to-indigo-600" },
  { name: "Sunset", value: "bg-gradient-to-br from-red-500 to-orange-500" },
  { name: "Ocean", value: "bg-gradient-to-br from-blue-400 to-emerald-400" },
  { name: "Forest", value: "bg-gradient-to-br from-green-500 to-lime-600" },
  { name: "Twilight", value: "bg-gradient-to-br from-indigo-500 to-purple-800" },
  { name: "Mono", value: "bg-gradient-to-br from-gray-700 to-gray-900" },
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<SearchResult | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [selectedLineIndices, setSelectedLineIndices] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false);
  const [error, setError] = useState("");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [selectedFont, setSelectedFont] = useState(fontOptions[1].value);
  const [selectedGradient, setSelectedGradient] = useState(gradientPresets[0].value);
  const [coverKey, setCoverKey] = useState(Date.now());
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  // Config Spotify
  const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID || "";
  const SPOTIFY_REDIRECT_URI = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI || "";

  const lyricsLines = lyrics.split("\n");
  const getSelectedLineContent = useCallback(() => {
    if (!lyrics || selectedLineIndices.length === 0) return [];
    return [...selectedLineIndices]
      .sort((a, b) => a - b)
      .map((i) => lyricsLines[i] || "");
  }, [lyrics, lyricsLines, selectedLineIndices]);

  // Extraer token de la URL
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get("access_token");
    if (token) {
      setAccessToken(token);
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const handleSpotifyLogin = () => {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
      alert("Configura Spotify Client ID y Redirect URI en .env.local");
      return;
    }
    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
      response_type: "token",
      client_id: SPOTIFY_CLIENT_ID,
      scope: "user-read-private user-read-email",
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }).toString()}`;
    window.location.href = authUrl;
  };

  // Wrapper de fetch con token
  const fetchApi = async <T = unknown>(url: string): Promise<T> => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        setAccessToken(null);
        throw new Error("Spotify session expired.");
      }
      const body: { error?: string } = await res.json().catch(() => ({}));
      throw new Error(body.error ?? `Error ${res.status}`);
    }
    return res.json();
  };

  // Búsqueda de canciones
  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError("");
    try {
      interface SearchResponse { results?: SearchResult[] }
      const data = await fetchApi<SearchResponse>(`/api/lyrics?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data.results ?? []);
      if (!data.results?.length) setError("No songs found.");
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  // Selección de canción y fetch de letras
  const handleSelectSong = async (song: SearchResult) => {
    setSelectedSong(song);
    setIsFetchingLyrics(true);
    setError("");
    try {
      interface LyricsResponse { lyrics?: string; source?: string; isSynced?: boolean }
      const params = new URLSearchParams({
        trackName: song.title,
        artistName: song.artist,
        albumName: song.album,
        duration: String(song.duration),
      });
      const data = await fetchApi<LyricsResponse>(`/api/lyrics?${params}`);
      setLyrics(data.lyrics ?? "");
      setLyricsSource(data.source ?? null);
      setIsSynced(data.isSynced ?? false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setIsFetchingLyrics(false);
    }
  };

  // Lógica de selección de líneas
  const handleLineSelect = (index: number) => {
    setSelectedLineIndices((prev) => {
      if (prev.length === 0) return [index];
      if (prev.includes(index)) return [];
      const sorted = [...prev].sort((a, b) => a - b);
      const [min, max] = [sorted[0], sorted.at(-1)!];
      if ((index === min - 1 || index === max + 1) && prev.length < MAX_SELECTED_LINES) {
        return [...prev, index];
      }
      if (prev.length >= MAX_SELECTED_LINES) {
        alert(`Only ${MAX_SELECTED_LINES} lines allowed.`);
        return prev;
      }
      return [index];
    });
  };

  // Apertura / cierre del modal
  const openPreviewModal = () => {
    if (selectedLineIndices.length === 0) {
      alert("Please select some lyrics lines first.");
      return;
    }
    const sorted = [...selectedLineIndices].sort((a, b) => a - b);
    if (sorted.length > 1 && !sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1)) {
      alert("Please select consecutive lines.");
      return;
    }
    setCoverKey(Date.now());
    setCoverLoaded(false);
    setSelectedFont(fontOptions[1].value);
    setSelectedGradient(gradientPresets[0].value);
    setIsModalOpen(true);
  };
  const closePreviewModal = () => setIsModalOpen(false);

  // Exportar PNG
  const exportPngFromModal = () => {
    const node = previewRef.current;
    if (!node) return alert("Error preparing image.");
    toPng(node, { pixelRatio: 2, backgroundColor: "transparent" })
      .then((url) => {
        const link = document.createElement("a");
        link.download = `${selectedSong!.title
          .replace(/[^a-z0-9]/gi, "_")
          .toLowerCase()}_selection.png`;
        link.href = url;
        link.click();
        closePreviewModal();
      })
      .catch(() => alert("Failed to generate PNG."));
  };

  return (
    <div className="container mx-auto p-8 min-h-screen flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-4">Lyric Snippet Generator</h1>

      {!accessToken ? (
        // Login View
        <div className="w-full max-w-md text-center p-6 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg mt-8 animate-fadeIn">
          <p className="text-lg mb-4 text-gray-800 dark:text-gray-200">
            Please log in with Spotify to search for songs and lyrics.
          </p>
          <button
            onClick={handleSpotifyLogin}
            className="flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-full transition-colors duration-200 ease-in-out transform hover:scale-105 shadow-md mx-auto"
          >
            <Image
              src="/spotify_logo.svg"
              width={24}
              height={24}
              alt="Spotify Logo"
              className="mr-2"
            />
            Login with Spotify
          </button>
          {error && <p className="text-red-500 mt-4">{error}</p>}
        </div>
      ) : (
        <>
          {(isLoading || isFetchingLyrics) && (
            <p className="text-blue-500 mb-4 text-center animate-pulse">
              {isLoading ? "Searching for songs..." : "Loading lyrics..."}
            </p>
          )}

          {/* Search Form */}
          <form onSubmit={handleSearch} className="w-full max-w-md mb-8">
            <div className="flex items-center border-b border-teal-500 py-2 transition-colors duration-200 ease-in-out">
              <input
                type="text"
                placeholder="Search for a song or artist..."
                className="flex-grow bg-transparent border-none py-1 px-2 text-gray-700 dark:text-gray-300 focus:outline-none"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                disabled={isLoading || isFetchingLyrics}
              />
              <button
                type="submit"
                disabled={!searchQuery.trim() || isLoading || isFetchingLyrics}
                className="flex-shrink-0 bg-teal-500 hover:bg-teal-700 border-4 border-teal-500 hover:border-teal-700 text-white py-1 px-2 rounded disabled:opacity-50 transition-colors duration-200 ease-in-out transform hover:scale-105"
              >
                {(isLoading && !isFetchingLyrics) ? "Searching..." : "Search"}
              </button>
            </div>
          </form>

          {/* Error */}
          {error && <p className="text-red-500 mb-4 text-center animate-shake">{error}</p>}

          {/* Search Results */}
          {!selectedSong && !isFetchingLyrics && searchResults.length > 0 && (
            <div className="w-full max-w-lg mb-8 animate-fadeIn">
              <h2 className="text-2xl font-semibold mb-4 text-center">Search Results</h2>
              <ul className="space-y-3">
                {searchResults.map((song) => (
                  <li
                    key={song.id}
                    onClick={() => handleSelectSong(song)}
                    className="flex items-center p-3 border rounded transition-all duration-200 ease-in-out transform hover:scale-102 hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer"
                  >
                    {song.thumbnailUrl && (
                      <Image
                        src={song.thumbnailUrl}
                        alt={`${song.title} thumbnail`}
                        width={50}
                        height={50}
                        className="rounded mr-4 object-cover"
                      />
                    )}
                    <div>
                      <p className="font-semibold">{song.title}</p>
                      <p className="text-sm text-gray-600 dark:text-gray-400">
                        {song.artist} – {song.album}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Lyrics Display */}
          {selectedSong && lyrics && (
            <div className="w-full max-w-2xl mb-8 p-6 border rounded shadow-md bg-white dark:bg-gray-900 animate-fadeInUp">
              <div className="flex items-center mb-6 space-x-4 justify-center">
                {selectedSong.thumbnailUrl && (
                  <Image
                    src={selectedSong.thumbnailUrl}
                    alt={`${selectedSong.title} cover`}
                    width={64}
                    height={64}
                    className="rounded object-cover shadow-md"
                  />
                )}
                <div>
                  <h2 className="text-2xl font-semibold">{selectedSong.title}</h2>
                  <p className="text-lg text-gray-600 dark:text-gray-400">
                    {selectedSong.artist} – {selectedSong.album}
                  </p>
                </div>
              </div>
              <div className="lyrics-container overflow-y-auto max-h-96 bg-gray-50 dark:bg-gray-800 p-4 rounded border font-mono text-sm animate-fadeIn">
                {lyricsLines.map((line, idx) => (
                  <p
                    key={idx}
                    onClick={() => handleLineSelect(idx)}
                    className={`whitespace-pre-wrap cursor-pointer p-1 rounded transition-colors duration-150 ${selectedLineIndices.includes(idx)
                        ? "bg-teal-200 dark:bg-teal-700 font-semibold"
                        : "hover:bg-gray-200 dark:hover:bg-gray-600"
                      }`}
                  >
                    {line.trim() === "" ? "\u00A0" : line}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Create Share Image */}
          {selectedLineIndices.length > 0 && (
            <div className="text-center mb-8 animate-fadeIn">
              <button
                onClick={openPreviewModal}
                className="mt-6 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-transform duration-200 ease-in-out hover:scale-105"
              >
                Create Share Image ({selectedLineIndices.length}/{MAX_SELECTED_LINES})
              </button>
            </div>
          )}

          {/* Preview & Export Modal */}
          {isModalOpen && selectedSong && (
            <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4 transition-opacity duration-300 ease-in-out">
              <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full overflow-hidden transform transition-transform duration-300 ease-out scale-100">
                <button
                  onClick={closePreviewModal}
                  className="absolute top-2 right-3 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white text-3xl font-light leading-none z-10 transition-colors duration-200"
                  aria-label="Close preview"
                >
                  &times;
                </button>
                <div
                  ref={previewRef}
                  className={`p-6 text-white rounded-t-lg overflow-hidden ${selectedGradient}`}
                  style={{ fontFamily: selectedFont, fontSize: "16px", lineHeight: 1.6 }}
                >
                  {selectedSong.thumbnailUrl && (
                    <Image
                      src={`${selectedSong.thumbnailUrl}?_=${coverKey}`}
                      alt={`${selectedSong.title} cover`}
                      width={80}
                      height={80}
                      className="rounded object-cover float-right ml-4 mb-2 border-2 border-white/50 shadow-lg transition-transform duration-200 ease-in-out hover:scale-105"
                      onLoadingComplete={() => setCoverLoaded(true)}
                    />
                  )}
                  <h3 className="text-lg font-bold mb-1 pb-1 border-b border-white/30">
                    {selectedSong.title}
                  </h3>
                  <p className="text-sm mb-4 opacity-80">{selectedSong.artist}</p>
                  <div className="clear-both pt-2">
                    {getSelectedLineContent().map((line, i) => (
                      <p key={i} className="mb-1">{line || "\u00A0"}</p>
                    ))}
                  </div>
                  <p className="mt-4 text-xs opacity-60 text-right clear-both">
                    Lyrics via {lyricsSource || "Genius"}{isSynced ? ", Synced" : ""}
                  </p>
                </div>
                <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-b grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="font-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Font:
                    </label>
                    <select
                      id="font-select"
                      value={selectedFont}
                      onChange={(e) => setSelectedFont(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-200 ease-in-out"
                    >
                      {fontOptions.map((f) => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor="gradient-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Gradient:
                    </label>
                    <select
                      id="gradient-select"
                      value={selectedGradient}
                      onChange={(e) => setSelectedGradient(e.target.value)}
                      className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 transition-colors duration-200 ease-in-out"
                    >
                      {gradientPresets.map((g) => (
                        <option key={g.name} value={g.value}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-b-lg flex justify-end space-x-3">
                  <button
                    onClick={closePreviewModal}
                    className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors duration-200 ease-in-out"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportPngFromModal}
                    disabled={!coverLoaded && !!selectedSong.thumbnailUrl}
                    className={`px-4 py-2 rounded text-white transition-transform duration-200 ease-in-out ${coverLoaded
                        ? "bg-green-500 hover:bg-green-600 transform hover:scale-105"
                        : "bg-gray-400 cursor-not-allowed"
                      }`}
                  >
                    Export as PNG
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
