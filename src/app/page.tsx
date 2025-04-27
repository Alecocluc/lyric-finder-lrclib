"use client";

import { useState, useRef, useCallback, useEffect } from 'react';
import Image from 'next/image';
import { toPng } from 'html-to-image';

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
  { name: 'Geist Sans', value: 'var(--font-geist-sans)' },
  { name: 'Geist Mono', value: 'var(--font-geist-mono)' },
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Roboto Mono', value: '"Roboto Mono", monospace' },
  { name: 'Merriweather', value: 'Merriweather, serif' },
];

const gradientPresets = [
  { name: 'Default', value: 'bg-gradient-to-br from-purple-600 to-indigo-600' },
  { name: 'Sunset', value: 'bg-gradient-to-br from-red-500 to-orange-500' },
  { name: 'Ocean', value: 'bg-gradient-to-br from-blue-400 to-emerald-400' },
  { name: 'Forest', value: 'bg-gradient-to-br from-green-500 to-lime-600' },
  { name: 'Twilight', value: 'bg-gradient-to-br from-indigo-500 to-purple-800' },
  { name: 'Mono', value: 'bg-gradient-to-br from-gray-700 to-gray-900' },
];

export default function Home() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [selectedSong, setSelectedSong] = useState<SearchResult | null>(null);
  const [lyrics, setLyrics] = useState('');
  const [lyricsSource, setLyricsSource] = useState<string | null>(null);
  const [isSynced, setIsSynced] = useState(false);
  const [selectedLineIndices, setSelectedLineIndices] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingLyrics, setIsFetchingLyrics] = useState(false);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [selectedFont, setSelectedFont] = useState(fontOptions[1].value);
  const [selectedGradient, setSelectedGradient] = useState(gradientPresets[0].value);
  const [coverKey, setCoverKey] = useState(Date.now());
  const [coverLoaded, setCoverLoaded] = useState(false);
  const [accessToken, setAccessToken] = useState<string | null>(null);

  const SPOTIFY_CLIENT_ID = process.env.NEXT_PUBLIC_SPOTIFY_CLIENT_ID ?? '';
  const SPOTIFY_REDIRECT_URI = process.env.NEXT_PUBLIC_SPOTIFY_REDIRECT_URI ?? 'http://localhost:3000';
  const SPOTIFY_SCOPES = ['user-read-private', 'user-read-email'];

  const lyricsLines = lyrics.split('\n');

  const getSelectedLineContent = useCallback(() => {
    if (!lyrics || selectedLineIndices.length === 0) return [];
    return [...selectedLineIndices]
      .sort((a, b) => a - b)
      .map(i => lyricsLines[i] || '');
  }, [lyrics, lyricsLines, selectedLineIndices]);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash) return;
    const params = new URLSearchParams(hash.substring(1));
    const token = params.get('access_token');
    if (token) {
      setAccessToken(token);
      window.history.replaceState(null, '', window.location.pathname);
    } else if (params.get('error')) {
      setError(`Spotify login failed: ${params.get('error')}`);
    }
  }, []);

  const handleSpotifyLogin = () => {
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_REDIRECT_URI) {
      alert('Configure Spotify Client ID / Redirect URI.');
      return;
    }
    const authUrl = `https://accounts.spotify.com/authorize?${new URLSearchParams({
      response_type: 'token',
      client_id: SPOTIFY_CLIENT_ID,
      scope: SPOTIFY_SCOPES.join(' '),
      redirect_uri: SPOTIFY_REDIRECT_URI,
    }).toString()}`;
    window.location.href = authUrl;
  };

  const fetchApi = async (url: string) => {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!res.ok) {
      if (res.status === 401) {
        setAccessToken(null);
        throw new Error('Spotify session expired.');
      }
      const body = await res.json().catch(() => ({}));
      throw new Error((body as { error?: string }).error || `Request failed (${res.status})`);
    }
    return res.json();
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError('');
    try {
      const data = await fetchApi(`/api/lyrics?query=${encodeURIComponent(searchQuery)}`);
      setSearchResults(data.results || []);
      if (!data.results?.length) setError('No songs found.');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSong = async (song: SearchResult) => {
    setSelectedSong(song);
    setIsFetchingLyrics(true);
    setError('');
    try {
      const params = new URLSearchParams({
        trackName: song.title,
        artistName: song.artist,
        albumName: song.album,
        duration: String(song.duration),
      });
      const data = await fetchApi(`/api/lyrics?${params}`);
      setLyrics(data.lyrics || '');
      setLyricsSource(data.source || null);
      setIsSynced(data.isSynced ?? false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsFetchingLyrics(false);
    }
  };

  const handleLineSelect = (index: number) => {
    setSelectedLineIndices(prev => {
      if (!prev.length) return [index];
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

  const openPreviewModal = () => {
    if (!selectedLineIndices.length) {
      alert('Select some lines first.');
      return;
    }
    const sorted = [...selectedLineIndices].sort((a, b) => a - b);
    if (
      sorted.length > 1 &&
      !sorted.every((v, i) => i === 0 || v === sorted[i - 1] + 1)
    ) {
      alert('Select consecutive lines.');
      return;
    }
    setCoverKey(Date.now());
    setCoverLoaded(false);
    setSelectedFont(fontOptions[1].value);
    setSelectedGradient(gradientPresets[0].value);
    setIsModalOpen(true);
  };

  const closePreviewModal = () => setIsModalOpen(false);

  const exportPngFromModal = () => {
    const node = previewRef.current;
    if (!node) {
      alert('Error preparing image.');
      return;
    }
    toPng(node, { pixelRatio: 2, backgroundColor: 'transparent' })
      .then(dataUrl => {
        const link = document.createElement('a');
        const name = selectedSong!.title
          .replace(/[^a-z0-9]/gi, '_')
          .toLowerCase();
        link.download = `${name}_selection.png`;
        link.href = dataUrl;
        link.click();
        closePreviewModal();
      })
      .catch(err => {
        console.error(err);
        alert('PNG generation failed.');
      });
  };

  return (
    <div className="container mx-auto p-8 min-h-screen flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-4">Lyric Finder</h1>
      {!accessToken ? (
        <div className="w-full max-w-md p-6 bg-gray-100 dark:bg-gray-800 rounded-lg shadow-lg mt-8 text-center">
          <p className="text-lg mb-4 text-gray-800 dark:text-gray-200">
            Log in with Spotify to search songs.
          </p>
          <button
            onClick={handleSpotifyLogin}
            className="flex items-center justify-center bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-6 rounded-full transition shadow mx-auto"
          >
            <Image
              src="/spotify_logo.svg"
              alt="Spotify Logo"
              width={24}
              height={24}
              className="mr-2"
            />
            Login with Spotify
          </button>
          {error && <p className="text-red-500 mt-4">{error}</p>}
        </div>
      ) : (
        <>
          {(isLoading || isFetchingLyrics) && (
            <p className="text-blue-500 mb-4 text-center">
              {isLoading ? 'Searching...' : 'Fetching lyrics...'}
            </p>
          )}

          {/* Search Form */}
          <form onSubmit={handleSearch} className="w-full max-w-md mb-8">
            <div className="flex items-center border-b border-teal-500 py-2">
              <input
                type="text"
                placeholder="Search a song or artist..."
                className="flex-grow bg-transparent border-none py-1 px-2 text-gray-700 dark:text-gray-300 focus:outline-none"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={isLoading || isFetchingLyrics}
              />
              <button
                type="submit"
                className="ml-2 bg-teal-500 hover:bg-teal-700 text-white py-1 px-4 rounded disabled:opacity-50"
                disabled={!searchQuery.trim() || isLoading || isFetchingLyrics}
              >
                Search
              </button>
            </div>
          </form>
          {error && <p className="text-red-500 mb-4">{error}</p>}

          {/* Results */}
          {!isFetchingLyrics && searchResults.length > 0 && (
            <div className="w-full max-w-lg mb-8">
              <h2 className="text-2xl font-semibold mb-4 text-center">Results</h2>
              <ul className="space-y-3">
                {searchResults.map(song => (
                  <li
                    key={song.id}
                    onClick={() => handleSelectSong(song)}
                    className="flex items-center p-3 border rounded cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800"
                  >
                    {song.thumbnailUrl && (
                      <Image
                        src={song.thumbnailUrl}
                        alt={`${song.title} thumbnail`}
                        width={50}
                        height={50}
                        className="rounded mr-4"
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
          {selectedSong && lyrics && !isFetchingLyrics && (
            <div className="w-full max-w-2xl p-6 mb-8 bg-white dark:bg-gray-900 rounded shadow">
              <div className="flex items-center justify-center mb-6 space-x-4">
                {selectedSong.thumbnailUrl && (
                  <Image
                    src={selectedSong.thumbnailUrl}
                    alt={`${selectedSong.title} cover`}
                    width={64}
                    height={64}
                    className="rounded"
                  />
                )}
                <div>
                  <h2 className="text-2xl font-semibold">{selectedSong.title}</h2>
                  <p className="text-lg text-gray-600 dark:text-gray-400">
                    {selectedSong.artist} – {selectedSong.album}
                  </p>
                </div>
              </div>
              <div className="overflow-y-auto max-h-96 p-4 bg-gray-50 dark:bg-gray-800 rounded font-mono text-sm space-y-1">
                {lyricsLines.map((line, idx) => (
                  <p
                    key={idx}
                    onClick={() => handleLineSelect(idx)}
                    className={`cursor-pointer p-1 rounded ${selectedLineIndices.includes(idx)
                        ? 'bg-teal-200 dark:bg-teal-700 font-semibold'
                        : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                      }`}
                  >
                    {line || '\u00A0'}
                  </p>
                ))}
              </div>
            </div>
          )}

          {/* Create Image Button */}
          {selectedLineIndices.length > 0 && (
            <div className="mb-8">
              <button
                onClick={openPreviewModal}
                className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded"
              >
                Create Share Image ({selectedLineIndices.length}/{MAX_SELECTED_LINES})
              </button>
            </div>
          )}

          {/* Preview & Export Modal */}
          {isModalOpen && selectedSong && (
            <div className="fixed inset-0 flex items-center justify-center bg-black/70 p-4">
              <div className="bg-white dark:bg-gray-900 rounded shadow-lg max-w-md w-full overflow-hidden">
                <button
                  onClick={closePreviewModal}
                  className="absolute top-2 right-2 text-2xl text-gray-500 hover:text-gray-800"
                >
                  &times;
                </button>
                <div
                  ref={previewRef}
                  className={`${selectedGradient} text-white p-6 rounded-t`}
                  style={{ fontFamily: selectedFont, lineHeight: 1.6 }}
                >
                  {selectedSong.thumbnailUrl && (
                    <Image
                      src={`${selectedSong.thumbnailUrl}?_=${coverKey}`}
                      alt={`${selectedSong.title} cover`}
                      width={80}
                      height={80}
                      className="rounded float-right ml-4 mb-2 border-2 border-white/50"
                      onLoadingComplete={() => setCoverLoaded(true)}
                    />
                  )}
                  <h3 className="text-lg font-bold border-b border-white/30 pb-1 mb-2">
                    {selectedSong.title}
                  </h3>
                  <p className="text-sm opacity-80 mb-4">{selectedSong.artist}</p>
                  <div className="space-y-1">
                    {getSelectedLineContent().map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                  <p className="mt-4 text-xs opacity-60 text-right">
                    Lyrics via {lyricsSource || 'Genius'}{isSynced ? ', Synced' : ''}
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4 p-4 bg-gray-50 dark:bg-gray-800">
                  <div>
                    <label className="block text-sm mb-1">Font:</label>
                    <select
                      value={selectedFont}
                      onChange={e => setSelectedFont(e.target.value)}
                      className="w-full p-2 rounded border bg-white dark:bg-gray-700"
                    >
                      {fontOptions.map(f => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>
                          {f.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm mb-1">Gradient:</label>
                    <select
                      value={selectedGradient}
                      onChange={e => setSelectedGradient(e.target.value)}
                      className="w-full p-2 rounded border bg-white dark:bg-gray-700"
                    >
                      {gradientPresets.map(g => (
                        <option key={g.name} value={g.value}>
                          {g.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="flex justify-end space-x-2 p-4 bg-gray-100 dark:bg-gray-800">
                  <button
                    onClick={closePreviewModal}
                    className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={exportPngFromModal}
                    disabled={!coverLoaded && !!selectedSong.thumbnailUrl}
                    className={`px-4 py-2 rounded text-white ${coverLoaded ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400'
                      }`}
                  >
                    Export PNG
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
