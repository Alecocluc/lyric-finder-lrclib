// src/app/api/lyrics/route.ts

import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import SpotifyWebApi from 'spotify-web-api-node';

// Definimos la forma que puede tener un error lanzado por spotify-web-api-node
interface SpotifyError extends Error {
  statusCode?: number;
  body?: {
    error?: {
      message?: string;
    };
  };
}

// Type guard para errores de Spotify
function isSpotifyError(err: unknown): err is SpotifyError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'statusCode' in err
  );
}

export async function GET(request: NextRequest) {
  console.log('--- NEW REQUEST ---');
  console.log(`Request URL: ${request.url}`);
  const params = request.nextUrl.searchParams;

  const query = params.get('query');
  const trackName = params.get('trackName');
  const artistName = params.get('artistName');
  const albumName = params.get('albumName');
  const durationStr = params.get('duration');

  const auth = request.headers.get('Authorization');
  if (!auth?.startsWith('Bearer ')) {
    return NextResponse.json(
      { error: 'Unauthorized: missing Spotify token.' },
      { status: 401 }
    );
  }
  const token = auth.split(' ')[1];

  const spotifyApi = new SpotifyWebApi();
  spotifyApi.setAccessToken(token);

  try {
    if (query) {
      // --- Spotify Search ---
      try {
        const res = await spotifyApi.searchTracks(query, { limit: 10 });
        const items = res.body.tracks?.items ?? [];
        const results = items.map((t) => ({
          id: t.id,
          title: t.name,
          artist: t.artists.map((a) => a.name).join(', '),
          album: t.album.name,
          duration: t.duration_ms,
          thumbnailUrl: t.album.images?.[t.album.images.length - 1]?.url,
          previewUrl: t.preview_url,
        }));
        return NextResponse.json({ results });
      } catch (err: unknown) {
        let status = 500;
        let message = 'Unknown error during Spotify search.';
        if (isSpotifyError(err)) {
          status = err.statusCode ?? 500;
          message = err.body?.error?.message ?? err.message;
        } else if (err instanceof Error) {
          message = err.message;
        }
        return NextResponse.json(
          { error: `Spotify search failed: ${message}` },
          { status }
        );
      }
    } else if (trackName && artistName && albumName && durationStr) {
      // --- LRCLIB Lyrics Fetch ---
      const duration = Math.round(parseInt(durationStr, 10) / 1000);
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(
        trackName
      )}&artist_name=${encodeURIComponent(
        artistName
      )}&album_name=${encodeURIComponent(albumName)}&duration=${duration}`;

      try {
        const { data, status: st } = await axios.get(url, {
          headers: {
            'User-Agent':
              'LyricsApp/0.1 (Next.js; +https://github.com/your-repo)',
          },
        });
        if (st === 404) {
          return NextResponse.json(
            { lyrics: null, source: 'lrclib', message: 'No lyrics found.' },
            { status: 200 }
          );
        }
        if (st !== 200) {
          return NextResponse.json(
            { error: `LRCLIB returned status ${st}.` },
            { status: 502 }
          );
        }
        const plainLyrics = (data as { plainLyrics?: string }).plainLyrics ?? null;
        if (!plainLyrics) {
          return NextResponse.json(
            {
              lyrics: null,
              source: 'lrclib',
              message: 'Empty lyrics content.',
            },
            { status: 200 }
          );
        }
        return NextResponse.json({
          lyrics: plainLyrics,
          source: 'lrclib',
          isSynced: false,
        });
      } catch (err: unknown) {
        if (axios.isAxiosError(err)) {
          const status = err.response?.status ?? 500;
          if (status === 404) {
            return NextResponse.json(
              { lyrics: null, source: 'lrclib', message: 'No lyrics found.' },
              { status: 200 }
            );
          }
          return NextResponse.json(
            { error: `LRCLIB network error (${status}).` },
            { status: 502 }
          );
        }
        return NextResponse.json(
          { error: 'Unexpected error fetching lyrics.' },
          { status: 500 }
        );
      }
    } else {
      return NextResponse.json(
        {
          error:
            'Se requiere `query` o bien (`trackName`, `artistName`, `albumName` y `duration`).',
        },
        { status: 400 }
      );
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json(
      { error: `Error interno: ${msg}` },
      { status: 500 }
    );
  }
}
