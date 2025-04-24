"use client";

import { useState, useRef, useCallback } from 'react';
import Image from "next/image";
import { toPng } from 'html-to-image';

// Define interfaces for our data structures
interface SearchResult {
  id: string; // Spotify ID is a string
  title: string;
  artist: string;
  album: string; // Album name
  duration: number; // Duration in ms
  thumbnailUrl?: string; // Optional cover thumbnail
  previewUrl?: string;  // Optional preview URL
}

const MAX_SELECTED_LINES = 4;

// Define Font Options
const fontOptions = [
  { name: 'Geist Sans', value: 'var(--font-geist-sans)' },
  { name: 'Geist Mono', value: 'var(--font-geist-mono)' },
  { name: 'Inter', value: 'Inter, sans-serif' },
  { name: 'Roboto Mono', value: '"Roboto Mono", monospace' },
  { name: 'Merriweather', value: 'Merriweather, serif' },
];

// Define Gradient Presets
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
  const [lyricsMessage, setLyricsMessage] = useState<string | null>(null);
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

  const lyricsLines = lyrics.split('\n');

  const getSelectedLineContent = useCallback(() => {
    if (!lyrics || selectedLineIndices.length === 0) return [];
    const sorted = [...selectedLineIndices].sort((a, b) => a - b);
    return sorted.map(i => lyricsLines[i] || '');
  }, [lyrics, lyricsLines, selectedLineIndices]);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setIsLoading(true);
    setError('');
    setSearchResults([]);
    setSelectedSong(null);
    setLyrics('');
    setLyricsSource(null);
    setIsSynced(false);
    setLyricsMessage(null);
    setSelectedLineIndices([]);

    try {
      const response = await fetch(`/api/lyrics?query=${encodeURIComponent(searchQuery)}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Search failed (status ${response.status})`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setSearchResults(data.results || []);
      if (!data.results || data.results.length === 0) {
        setError('No songs found for your query.');
      }
    } catch (err: any) {
      console.error(err);
      setError(`Failed to search for songs: ${err.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectSong = async (song: SearchResult) => {
    setSelectedSong(song);
    setSearchResults([]);
    setLyrics('');
    setLyricsSource(null);
    setIsSynced(false);
    setLyricsMessage(null);
    setSelectedLineIndices([]);
    setError('');
    setIsFetchingLyrics(true);

    try {
      const params = new URLSearchParams({
        trackName: song.title,
        artistName: song.artist,
        albumName: song.album,
        duration: String(song.duration),
      });
      const response = await fetch(`/api/lyrics?${params.toString()}`);
      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `Fetch lyrics failed (status ${response.status})`);
      }
      const data = await response.json();
      if (data.error) throw new Error(data.error);
      setLyrics(data.lyrics || '');
      setLyricsSource(data.source || null);
      setIsSynced(data.isSynced || false);
      setLyricsMessage(data.message || null);
      if (!data.lyrics && !data.message) {
        setLyricsMessage('Lyrics not found or empty.');
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to fetch lyrics.');
    } finally {
      setIsFetchingLyrics(false);
    }
  };

  const handleLineSelect = (index: number) => {
    setSelectedLineIndices(prev => {
      if (prev.length === 0) return [index];
      if (prev.includes(index)) return [];
      const sorted = [...prev].sort((a, b) => a - b);
      const min = sorted[0], max = sorted[sorted.length - 1];
      if ((index === min - 1 || index === max + 1) && prev.length < MAX_SELECTED_LINES) {
        return [...prev, index];
      }
      if (prev.length >= MAX_SELECTED_LINES) {
        alert(`You can only select up to ${MAX_SELECTED_LINES} lines.`);
        return prev;
      }
      return [index];
    });
  };

  const openPreviewModal = () => {
    if (selectedLineIndices.length === 0) {
      alert('Please select some lyrics lines first.');
      return;
    }
    const sorted = [...selectedLineIndices].sort((a, b) => a - b);
    const isConsecutive = sorted.every((v, i) => i === 0 || v === sorted[i-1] + 1);
    if (!isConsecutive && sorted.length > 1) {
      alert('Please select consecutive lines.');
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
    toPng(node, { cacheBust: true, pixelRatio: 2, backgroundColor: 'transparent', useCORS: true })
      .then(dataUrl => {
        const link = document.createElement('a');
        const name = selectedSong!.title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        link.download = `${name}_selection.png`;
        link.href = dataUrl;
        link.click();
        closePreviewModal();
      })
      .catch(err => {
        console.error(err);
        alert('Failed to generate PNG.');
      });
  };

  return (
    <div className="container mx-auto p-8 min-h-screen flex flex-col items-center">
      <h1 className="text-4xl font-bold mb-8">Lyric Snippet Generator</h1>

      {isLoading && <p className="text-blue-500 mb-4 text-center">Searching for songs...</p>}
      {isFetchingLyrics && <p className="text-blue-500 mb-4 text-center">Loading lyrics...</p>}

      <form onSubmit={handleSearch} className="w-full max-w-md mb-8">
        <div className="flex items-center border-b border-teal-500 py-2">
          <input
            className="appearance-none bg-transparent border-none w-full text-gray-700 dark:text-gray-300 mr-3 py-1 px-2 leading-tight focus:outline-none"
            type="text"
            placeholder="Search for a song or artist..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            disabled={isLoading || isFetchingLyrics}
          />
          <button
            className="flex-shrink-0 bg-teal-500 hover:bg-teal-700 border-teal-500 hover:border-teal-700 text-sm border-4 text-white py-1 px-2 rounded disabled:opacity-50 transition-colors duration-200"
            type="submit"
            disabled={isLoading || isFetchingLyrics || !searchQuery.trim()}
          >
            {(isLoading && !isFetchingLyrics) ? 'Searching...' : 'Search'}
          </button>
        </div>
      </form>

      {error && <p className="text-red-500 mb-4 text-center">{error}</p>}

      {!isFetchingLyrics && searchResults.length > 0 && (
        <div className="w-full max-w-lg mb-8">
          <h2 className="text-2xl font-semibold mb-4 text-center">Search Results</h2>
          <ul className="space-y-3">
            {searchResults.map(song => (
              <li
                key={song.id}
                onClick={() => handleSelectSong(song)}
                className="flex items-center p-3 border rounded hover:bg-gray-100 dark:hover:bg-gray-800 cursor-pointer transition-colors duration-150"
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
                  <p className="text-sm text-gray-600 dark:text-gray-400">{song.artist} - {song.album}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {selectedSong && !isFetchingLyrics && lyrics && (
        <div className="w-full max-w-2xl mb-8 p-6 border rounded shadow-md bg-white dark:bg-gray-900">
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
              <p className="text-lg text-gray-600 dark:text-gray-400">{selectedSong.artist} - {selectedSong.album}</p>
            </div>
          </div>
          <div className="lyrics-container overflow-y-auto max-h-96 bg-gray-50 dark:bg-gray-800 p-4 rounded border border-gray-200 dark:border-gray-700 font-mono text-sm">
            {lyricsLines.map((line, idx) => (
              <p
                key={idx}
                onClick={() => handleLineSelect(idx)}
                className={`whitespace-pre-wrap cursor-pointer p-1 rounded transition-colors duration-150 ${
                  selectedLineIndices.includes(idx)
                    ? 'bg-teal-200 dark:bg-teal-700 font-semibold'
                    : 'hover:bg-gray-200 dark:hover:bg-gray-600'
                }`}
              >
                {line.trim() === '' ? '\u00A0' : line}
              </p>
            ))}
          </div>
        </div>
      )}

      {selectedLineIndices.length > 0 && selectedSong && !isFetchingLyrics && (
        <div className="text-center mb-8">
          <button
            onClick={openPreviewModal}
            className="mt-6 bg-blue-500 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200"
          >
            Create Share Image ({selectedLineIndices.length}/{MAX_SELECTED_LINES})
          </button>
        </div>
      )}

      {isModalOpen && selectedSong && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-md w-full relative p-0 overflow-hidden">
            <button
              onClick={closePreviewModal}
              className="absolute top-2 right-3 text-gray-500 dark:text-gray-400 hover:text-black dark:hover:text-white text-3xl font-light leading-none z-10"
              aria-label="Close preview"
            >&times;</button>
            <div
              key={selectedSong.id}
              ref={previewRef}
              className={`p-6 text-white rounded-t-lg overflow-hidden ${selectedGradient}`}
              style={{ fontFamily: selectedFont, fontSize: '16px', lineHeight: 1.6 }}
            >
              {selectedSong.thumbnailUrl && (
                <img
                  src={`${selectedSong.thumbnailUrl}?_=${coverKey}`}
                  alt={`${selectedSong.title} cover`}
                  width={80}
                  height={80}
                  className="w-20 h-20 rounded object-cover float-right ml-4 mb-2 border-2 border-white/50 shadow-lg"
                  crossOrigin="anonymous"
                  onLoad={() => setCoverLoaded(true)}
                />
              )}
              <h3 className="text-lg font-bold mb-1 pb-1 border-b border-white/30">{selectedSong.title}</h3>
              <p className="text-sm mb-4 opacity-80">{selectedSong.artist}</p>
              <div className="clear-both pt-2">
                {getSelectedLineContent().map((line, i) => (
                  <p key={i} className="mb-1">{line || '\u00A0'}</p>
                ))}
              </div>
              <p className="mt-4 text-xs opacity-60 text-right clear-both">
                Lyrics via {lyricsSource || 'Genius'}{isSynced ? ', Synced' : ''}
              </p>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-b border-gray-200 dark:border-gray-700 grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="font-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Font:</label>
                <select
                  id="font-select"
                  value={selectedFont}
                  onChange={e => setSelectedFont(e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {fontOptions.map(f => (
                    <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="gradient-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Gradient:</label>
                <select
                  id="gradient-select"
                  value={selectedGradient}
                  onChange={e => setSelectedGradient(e.target.value)}
                  className="w-full p-2 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {gradientPresets.map(g => (
                    <option key={g.name} value={g.value}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="p-4 bg-gray-100 dark:bg-gray-800 rounded-b-lg flex justify-end space-x-3">
              <button
                onClick={closePreviewModal}
                className="px-4 py-2 rounded bg-gray-200 dark:bg-gray-600 text-gray-800 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors duration-200 text-sm font-medium"
              >Cancel</button>
              <button
                onClick={exportPngFromModal}
                disabled={!coverLoaded && !!selectedSong.thumbnailUrl}
                className={`px-4 py-2 rounded text-white transition-colors duration-200 ${coverLoaded ? 'bg-green-500 hover:bg-green-600' : 'bg-gray-400 cursor-not-allowed'}`}
              >Export as PNG</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}