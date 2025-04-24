import { NextRequest, NextResponse } from 'next/server';
import axios from 'axios';
import SpotifyWebApi from 'spotify-web-api-node';

// Ensure you have SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in your .env.local file
const spotifyApi = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
});

// Function to get Spotify Access Token
async function getSpotifyToken() {
  try {
    const data = await spotifyApi.clientCredentialsGrant();
    spotifyApi.setAccessToken(data.body['access_token']);
    console.log('Spotify token obtained successfully.');
    // Set a timeout to refresh the token before it expires (expires_in is in seconds)
    const expiresIn = data.body['expires_in'];
    setTimeout(getSpotifyToken, (expiresIn - 60) * 1000); // Refresh 1 minute before expiry
  } catch (error) {
    console.error('Error getting Spotify client credentials token:', error);
    // Implement retry logic or handle the error appropriately
    // For now, we'll retry after a delay
    setTimeout(getSpotifyToken, 60000); // Retry after 1 minute
  }
}

// Initialize Spotify token on server start
getSpotifyToken();

export async function GET(request: NextRequest) {
  console.log(`--- NEW REQUEST ---`);
  console.log(`Request URL: ${request.url}`);
  const searchParams = request.nextUrl.searchParams;
  console.log(`Raw searchParams string: ${searchParams.toString()}`);

  const query = searchParams.get('query');
  const trackName = searchParams.get('trackName');
  const artistName = searchParams.get('artistName');
  const albumName = searchParams.get('albumName');
  const durationStr = searchParams.get('duration'); // Duration in milliseconds from Spotify

  // Log parsed parameters
  console.log(`API parsed params - query: ${query}, trackName: ${trackName}, artistName: ${artistName}, albumName: ${albumName}, duration: ${durationStr}`);

  // Ensure Spotify token is available
  if (!spotifyApi.getAccessToken()) {
    console.error('Spotify Access Token not available.');
    // Attempt to refresh token immediately if missing
    await getSpotifyToken();
    if (!spotifyApi.getAccessToken()) {
        return NextResponse.json({ error: 'Could not authenticate with Spotify. Check credentials.' }, { status: 503 });
    }
  }

  try {
    if (query) {
      // --- Spotify Search ---
      console.log(`Searching Spotify for query: ${query}`);
      try {
        const searchResults = await spotifyApi.searchTracks(query, { limit: 10 });
        const tracks = searchResults.body.tracks?.items.map(track => ({
          id: track.id,
          title: track.name,
          artist: track.artists.map(a => a.name).join(', '),
          album: track.album.name,
          duration: track.duration_ms, // Duration in milliseconds
          thumbnailUrl: track.album.images?.[track.album.images.length - 1]?.url, // Smallest image
          previewUrl: track.preview_url, // Audio preview if available
        })) ?? [];
        console.log(`Found ${tracks.length} tracks on Spotify.`);
        return NextResponse.json({ results: tracks });
      } catch (spotifyError: any) {
        console.error('Error searching Spotify:', spotifyError.message);
        // Handle potential token expiration
        if (spotifyError.statusCode === 401) {
            console.log('Spotify token expired or invalid, attempting refresh...');
            await getSpotifyToken(); // Refresh token
            // Retry the search after refreshing
            try {
                const searchResults = await spotifyApi.searchTracks(query, { limit: 10 });
                const tracks = searchResults.body.tracks?.items.map(track => ({
                  id: track.id,
                  title: track.name,
                  artist: track.artists.map(a => a.name).join(', '),
                  album: track.album.name,
                  duration: track.duration_ms,
                  thumbnailUrl: track.album.images?.[track.album.images.length - 1]?.url,
                  previewUrl: track.preview_url,
                })) ?? [];
                console.log(`Found ${tracks.length} tracks on Spotify after token refresh.`);
                return NextResponse.json({ results: tracks });
            } catch (retryError: any) {
                 console.error('Error searching Spotify after token refresh:', retryError.message);
                 return NextResponse.json({ error: `Spotify search failed after token refresh: ${retryError.message}` }, { status: retryError.statusCode || 500 });
            }
        }
        return NextResponse.json({ error: `Spotify search failed: ${spotifyError.message}` }, { status: spotifyError.statusCode || 500 });
      }
    } else if (trackName && artistName && albumName && durationStr) {
      // --- LRCLIB Lyrics Fetch ---
      const duration = parseInt(durationStr, 10) / 1000; // Convert ms to seconds for LRCLIB
      console.log(`Fetching lyrics from LRCLIB for: ${trackName} by ${artistName}, Album: ${albumName}, Duration: ${duration}s`);

      const lrclibUrl = `https://lrclib.net/api/get?track_name=${encodeURIComponent(trackName)}&artist_name=${encodeURIComponent(artistName)}&album_name=${encodeURIComponent(albumName)}&duration=${Math.round(duration)}`;

      try {
        const { data: lyricsData, status: lrclibStatus } = await axios.get(lrclibUrl, {
            headers: {
                'User-Agent': 'LyricsApp/0.1 (Next.js; +https://github.com/your-repo)' // Be polite, identify your app
            }
        });
        console.log(`LRCLIB response status: ${lrclibStatus}`);

        if (lrclibStatus === 404) {
            console.log('No lyrics found on LRCLIB.');
            return NextResponse.json({ lyrics: null, source: 'lrclib', message: 'No lyrics found for this track.' });
        }

        if (lrclibStatus !== 200) {
            console.error(`LRCLIB returned non-200 status: ${lrclibStatus}`);
            return NextResponse.json({ error: `LRCLIB request failed with status ${lrclibStatus}` }, { status: 502 });
        }

        // Use only plain lyrics as requested
        const lyrics = lyricsData.plainLyrics || null;

        if (!lyrics) {
             console.log('LRCLIB response did not contain lyrics content.');
             return NextResponse.json({ lyrics: null, source: 'lrclib', message: 'Lyrics found but content is empty.' });
        }

        console.log(`Successfully fetched plain lyrics from LRCLIB.`);
        return NextResponse.json({ lyrics: lyrics, source: 'lrclib', isSynced: false }); // Always false now

      } catch (lrclibError: any) {
        console.error(`Error fetching lyrics from LRCLIB (${lrclibUrl}):`, lrclibError.message);
        if (axios.isAxiosError(lrclibError)) {
          console.error('Axios error details (fetching LRCLIB):', lrclibError.response?.status, lrclibError.response?.data);
          const status = lrclibError.response?.status || 500;
          // Handle 404 specifically as 'not found' rather than a server error
          if (status === 404) {
              return NextResponse.json({ lyrics: null, source: 'lrclib', message: 'No lyrics found for this track.' });
          }
          return NextResponse.json({ error: `Failed to fetch lyrics from LRCLIB (Status: ${status})` }, { status: 502 }); // 502 Bad Gateway
        }
        return NextResponse.json({ error: 'An unexpected error occurred while fetching lyrics from LRCLIB.' }, { status: 500 });
      }
    } else {
      // Missing required parameters
      return NextResponse.json({ error: 'Either query (for search) or trackName, artistName, albumName, and duration (for lyrics) parameters are required' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('Unhandled error in API route:', error.message);
    return NextResponse.json({ error: 'An unexpected server error occurred' }, { status: 500 });
  }
}