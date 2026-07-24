# BeatSubsonic

A client-only (browser) BeatSaver map database viewer with Subsonic integration and fuzzy matching. It downloads the `songDetails2_v3.gz` dump from [kinsi55/BeatSaberScrappedData](https://github.com/kinsi55/BeatSaberScrappedData), imports it into a client-side SQLite database, and presents a searchable table UI with OneClick install buttons. It can also connect to an OpenSubsonic server, cache the track library locally, and fuzzy-match tracks against BeatSaver maps.

**Live:** [beat-subsonic.philpax.me](https://beat-subsonic.philpax.me/). Also served over plain [http://](http://beat-subsonic.philpax.me/) for use with plain-http Subsonic servers; see [Mixed content](#mixed-content).

## Tabs

Tabs are hash-routed (`#/beatsaver`, `#/subsonic`, `#/match`) and bookmarkable. A first visit lands on Subsonic.

1. **BeatSaver** — map database with search, filters, sorting, and OneClick install.
2. **Subsonic** — connect to an OpenSubsonic server; the track library is fetched on connect and cached in SQLite.
3. **Match** — fuzzy-match Subsonic tracks against BeatSaver maps. Tracks with the same artist and title across albums are grouped into one row. Matched maps expand beneath each track in a sortable table with OneClick install.

## Setup

```bash
npm install
npm run dev
```

Open the URL shown in the terminal (typically `http://localhost:5173`).

## Subsonic setup

1. Go to the **Subsonic** tab.
2. Enter your server URL (e.g. `https://music.example.com`), username, and password.
3. Click **Connect**. The connection is verified and all tracks are fetched and cached in SQLite, persisting across reloads.
4. Click **Refresh** to re-fetch later.

**CORS:** your Subsonic server must allow cross-origin requests from the app's origin. Many don't by default; you may need a reverse proxy or a CORS setting on the server.

**Authentication:** salt+token auth (MD5 of password+salt). The password is stored in `localStorage` only. It's never written to the SQLite database.

### Mixed content

A page loaded over HTTPS can't connect to a plain-http Subsonic server; browsers block mixed content. The deployed site is served over both schemes for this reason. Use the `http://` version for plain-http servers — the Subsonic tab shows a notice with a link when this applies. OPFS requires a secure context, so caches don't persist between sessions on plain http.

## Matching

A track matches a map only when both the artist and the title match: equality, word-aligned containment, or fuzzy similarity at or above the threshold (default 0.85, configurable in the UI).

- **Normalisation** (ported from [blackbird](https://github.com/philpax/blackbird)): fold Unicode lookalikes and diacritics to ASCII, lowercase, produce stripped and spaced variants. Trailing parenthesized qualifiers ("(Remaster)") and filler words ("deluxe", "and", "bgm", "theme") are stripped.
- **Conflated fields:** old BeatSaver maps mix up artist, mapper, and title. Artist credits are split into collaborator segments ("Camellia feat. nanahira" also indexes as "camellia" and "nanahira"), mapper credits ("mapped by X") are dropped, and "Artist - Title" song names contribute both fields.
- **Remixes:** remixer identities are extracted from version clauses. A remix only matches the same remix: "Cinema (Congorock remix)" matches neither the original "Cinema" nor the Skrillex remix. Generic clauses like "radio edit" still match the original.
- **Metrics** (ported from blackbird-spotcheck): Jaro-Winkler and token-set similarity, plus word-aligned containment. Jaro-Winkler runs on the remainder after shared leading words, so "The Deal"/"The Pain" pairs don't false-positive while typo tolerance is preserved.
- **Performance:** ~18k tracks against ~120k maps in about a second, single-core. Artist variants are interned to integer ids with a CSR trigram index, and everything derivable from a track's artist is cached per unique artist, so fuzzy comparisons run per (artist, variant) rather than per (track, map). Matching runs in a Web Worker with progress updates.

## How it works

1. On first load, the app fetches `songDetails2_v3.gz` from GitHub raw, with a jsDelivr fallback.
2. The gzip is decompressed with the native `DecompressionStream` API.
3. The protobuf (`SongProtoContainer`) is parsed with a hand-written decoder.
4. Songs (~120k) and difficulties (~200k+) are bulk-inserted into SQLite WASM in a Web Worker, with OPFS persistence.
5. Later loads serve from the SQLite cache immediately. When the cached dump is older than 24 hours, it's re-downloaded and re-imported in the background. GitHub raw doesn't expose its ETag cross-origin, so conditional requests can't detect staleness.
6. The UI queries SQLite via worker messages with paginated WHERE/ORDER BY/LIMIT.
7. Subsonic tracks are fetched via the `search3` endpoint with an empty query and large `songCount`, paginated, and cached in the same database.
8. Matching runs in a separate Web Worker.

## Data source

- **Repository:** [kinsi55/BeatSaberScrappedData](https://github.com/kinsi55/BeatSaberScrappedData)
- **File:** `songDetails2_v3.gz` — gzip-compressed protobuf, ~120k BeatSaver maps
- **Format version:** 3 (protobuf `SongProtoContainer`)

## OneClick download

The OneClick button triggers the `beatsaver://<hexkey>` protocol. This requires [ModAssistant](https://github.com/Assistant/ModAssistant) or [BeatSaverDl](https://github.com/kinsi55/BeatSaverDl) with the protocol handler registered.

Without a handler, use the fallback links:

- **View on BeatSaver:** `https://beatsaver.com/maps/<key>`
- **Download ZIP:** `https://beatsaver.com/api/download/key/<key>`

## Persistence

SQLite persists via the OPFS SyncAccessHandle Pool VFS. It works in a dedicated worker without cross-origin isolation headers, which is why it works on static hosting like GitHub Pages. It requires a secure context (HTTPS or `localhost`) and a browser with OPFS support.

The fallback chain is SAH pool → classic OPFS VFS (only when cross-origin isolated) → in-memory, which re-downloads on every load and is what plain http gets. The SAH pool takes exclusive file locks, so a second open tab of the app falls back to in-memory.

## Tech stack

- **React 19** with React Compiler
- **Vite**
- **TypeScript**
- **wouter** for hash routing
- **Tailwind CSS v4**
- **@sqlite.org/sqlite-wasm**
- **@tanstack/react-virtual** for virtualized tables
- **Vitest**, **oxlint**, **Prettier**

## Protobuf schema

The data is a single `SongProtoContainer` protobuf message, not a length-delimited stream. Key fields:

- `formatVersion` (1, uint32) — must be 3
- `scrapeEndedTimeUnix` (2, uint32) — when the scrape completed
- `songHashes` (3, bytes) — concatenated 20-byte SHA1 hashes
- `songs` (4, repeated SongProto) — the song list
- `tagList` (5, repeated string) — tag names indexed by bit position

See `src/lib/proto/schema.ts` for the full TypeScript definitions with field numbers.

## Development

```bash
npm run dev           # dev server
npm run build         # typecheck + production build
npm run test          # tests (watch mode; `npx vitest run` for one-shot)
npm run lint          # oxlint
npm run format        # Prettier (format:check to verify)
npm run preview       # preview production build
```

CI runs format check, lint, tests, and build on every push and PR. Pushes to `main` deploy to GitHub Pages.

## License

[MIT](LICENSE). Uses data from [kinsi55/BeatSaberScrappedData](https://github.com/kinsi55/BeatSaberScrappedData); map data originates from [BeatSaver](https://beatsaver.com).
