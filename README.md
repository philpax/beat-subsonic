# BeatSaver Map Database Viewer

A client-only (browser) BeatSaver map database viewer that downloads the `songDetails2_v3.gz` dump from [kinsi55/BeatSaberScrappedData](https://github.com/kinsi55/BeatSaberScrappedData), parses it, imports it into a local client-side SQLite database, and presents a searchable/filterable/sortable table UI with OneClick download buttons.

## Setup

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (typically `http://localhost:5173`).

## How it works

1. On first load, the app fetches `songDetails2_v3.gz` from GitHub raw (with a jsDelivr CDN fallback).
2. The gzip file is decompressed using the native `DecompressionStream` API.
3. The protobuf data (`SongProtoContainer`) is parsed with a hand-written lightweight decoder.
4. All songs (~100k+) and difficulties (~200k+) are bulk-inserted into a Web Worker running SQLite WASM with OPFS-backed persistence.
5. On subsequent loads, ETag-based change detection skips re-downloading if the data hasn't changed.
6. The UI queries SQLite via worker messages with paginated WHERE/ORDER BY/LIMIT.

## Data source

- **Repository:** [kinsi55/BeatSaberScrappedData](https://github.com/kinsi55/BeatSaberScrappedData)
- **File:** `songDetails2_v3.gz` — a gzip-compressed protobuf containing ~100k+ BeatSaver maps
- **Format version:** 3 (protobuf `SongProtoContainer`)

## OneClick download

The OneClick button triggers the `beatsaver://<hexkey>` protocol. This requires:

- [ModAssistant](https://github.com/Assistant/ModAssistant) or [BeatSaverDl](https://github.com/kinsi55/BeatSaverDl) installed
- The `beatsaver://` protocol handler registered with your OS

If you don't have a handler registered, use the fallback links:
- **View on BeatSaver:** `https://beatsaver.com/maps/<key>`
- **Download ZIP:** `https://beatsaver.com/api/download/key/<key>`

## OPFS requirements

The app uses OPFS (Origin Private File System) for persistent SQLite storage. This requires:

- A secure context (HTTPS or `localhost`)
- A modern browser (Chrome 102+, Firefox 111+, Safari 15.2+)

If OPFS is unavailable, the app falls back to in-memory SQLite (re-imports on every page load).

## Tech stack

- **React 19** with React Compiler
- **Vite** for bundling and dev server
- **TypeScript** for type safety
- **Tailwind CSS v4** for styling
- **@sqlite.org/sqlite-wasm** for client-side SQLite
- **@tanstack/react-virtual** for virtualized table rendering
- **Vitest** for unit/integration tests

## Protobuf schema

The data is a single `SongProtoContainer` protobuf message (not a length-delimited stream). Key fields:

- `formatVersion` (1, uint32) — must be 3
- `scrapeEndedTimeUnix` (2, uint32) — when the scrape completed
- `songHashes` (3, bytes) — concatenated 20-byte SHA1 hashes
- `songs` (4, repeated SongProto) — the song list
- `tagList` (5, repeated string) — tag names indexed by bit position

See `src/lib/proto/schema.ts` for the full TypeScript interface definitions with field numbers and JSDoc.

## Development

```bash
npm run dev      # Start dev server
npm run build    # Build for production
npm run test     # Run tests
npm run preview  # Preview production build
```

## License

This project uses data from [kinsi55/BeatSaberScrappedData](https://github.com/kinsi55/BeatSaberScrappedData). Map data originates from [BeatSaver](https://beatsaver.com).
