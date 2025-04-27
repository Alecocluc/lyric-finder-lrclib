# Lyric Finder

This is a Next.js application that allows users to log in with their Spotify account, search for songs, view lyrics, and generate an image based on the lyrics.

## Features

- Spotify Authentication: Securely log in using your Spotify account.
- Song Search: Search for songs available on Spotify.
- Lyric Display: View the lyrics for the selected song (powered by LRCLIB).
- Image Generation: Generate a unique image inspired by the song's lyrics.

## Setup

1.  **Clone the repository:**
    ```bash
    git clone <repository-url>
    cd lyric-finder-lrclib
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    # or
    yarn install
    # or
    pnpm install
    ```

3.  **Set up environment variables:**
    Create a `.env.local` file in the root of the project and add the following variables:

    ```
    NEXT_PUBLIC_SPOTIFY_CLIENT_ID=YOUR_SPOTIFY_CLIENT_ID
    NEXT_PUBLIC_SPOTIFY_REDIRECT_URI=http://localhost:3000/callback
    ```

    - Replace `YOUR_SPOTIFY_CLIENT_ID` with your actual Spotify application Client ID.
    - Ensure the `NEXT_PUBLIC_SPOTIFY_REDIRECT_URI` matches the Redirect URI configured in your Spotify application settings (usually `http://localhost:3000/callback` for local development).

## Running Locally

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Tech Stack

- [Next.js](https://nextjs.org/)
- [React](https://reactjs.org/)
- [TypeScript](https://www.typescriptlang.org/)
- [Tailwind CSS](https://tailwindcss.com/)
- [Spotify Web API](https://developer.spotify.com/documentation/web-api)
- [LRCLIB](https://lrclib.net/) (for lyrics)