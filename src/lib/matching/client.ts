/**
 * Main-thread client for the matching Web Workers.
 *
 * The map set is partitioned across N persistent workers, so keys and
 * indexes are built exactly once in total — split across the workers and
 * built in parallel — and reused across matches (setMaps is a no-op when
 * the data version is unchanged).
 *
 * A match is two phases:
 * 1. probe — every worker builds track keys and reports which track
 *    artists have an exact hit in its shard.
 * 2. match — every worker matches against its shard, given the union of
 *    exact-hit artists so the fuzzy artist fallback behaves exactly as it
 *    would against the unpartitioned index.
 *
 * Shards are disjoint, so per-track results concatenate without dedup.
 * Scores are computed worker-side; the main thread never builds keys.
 */

export interface MatchProgress {
  phase: 'building-keys' | 'matching' | 'done'
  current: number
  total: number
}

export interface ScoredMatch {
  mapIndex: number
  score: number
}

export interface ScoredMatchResult {
  trackIndex: number
  matches: ScoredMatch[]
}

export interface MatchTrackInput {
  index: number
  artist: string
  title: string
}

export interface MatchMapInput {
  index: number
  levelAuthor: string
  songAuthor: string
  songName: string
}

interface WorkerState {
  worker: Worker
  /** Latest progress per worker, for aggregate reporting. */
  progress: MatchProgress | null
}

export class MatchClient {
  private workers: WorkerState[] = []
  private numWorkers: number
  private mapsVersion: string | null = null
  private tracksToken = 0
  private progressCallback: ((progress: MatchProgress) => void) | null = null

  constructor(numWorkers?: number) {
    this.numWorkers = numWorkers ?? Math.min(4, navigator.hardwareConcurrency || 2)
  }

  private ensureWorkers(): WorkerState[] {
    while (this.workers.length < this.numWorkers) {
      this.workers.push({
        worker: new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }),
        progress: null,
      })
    }
    return this.workers
  }

  /** Whether the workers already hold this version of the map set. */
  hasMaps(version: string): boolean {
    return this.workers.length > 0 && this.mapsVersion === version
  }

  /**
   * Partition the map set across the workers, each building keys for its
   * shard. No-op if the version is unchanged.
   */
  async setMaps(
    version: string,
    maps: MatchMapInput[],
    onProgress?: (progress: MatchProgress) => void,
  ): Promise<void> {
    if (this.hasMaps(version)) return
    this.progressCallback = onProgress ?? null

    const states = this.ensureWorkers()
    const shardSize = Math.ceil(maps.length / states.length)

    await Promise.all(
      states.map((state, i) => {
        const shard = maps.slice(i * shardSize, Math.min((i + 1) * shardSize, maps.length))
        return this.request<void>(
          state,
          { type: 'set-maps', version, maps: shard },
          'maps-ready',
          () => undefined,
        )
      }),
    )
    this.mapsVersion = version
    this.progressCallback = null
  }

  /** Match tracks against the previously-set maps. */
  async match(
    tracks: MatchTrackInput[],
    threshold: number,
    onProgress?: (progress: MatchProgress) => void,
  ): Promise<ScoredMatchResult[]> {
    this.progressCallback = onProgress ?? null
    const states = this.ensureWorkers()
    const token = ++this.tracksToken

    // Phase 1: probe — which track artists have exact hits, per shard
    const signatureLists = await Promise.all(
      states.map((state) =>
        this.request<string[]>(
          state,
          { type: 'probe', tracksToken: token, tracks },
          'probe-result',
          (data) => data.signatures as string[],
        ),
      ),
    )
    const exactArtists = Array.from(new Set(signatureLists.flat()))

    // Phase 2: match every shard with the global exact-hit set
    for (const state of states) state.progress = null
    const shardResults = await Promise.all(
      states.map((state) =>
        this.request<ScoredMatchResult[]>(
          state,
          { type: 'match', tracksToken: token, threshold, exactArtists },
          'result',
          (data) => data.results as ScoredMatchResult[],
        ),
      ),
    )
    this.progressCallback = null

    // Merge: shards are disjoint, so concatenate matches per track
    const byTrack = new Map<number, ScoredMatchResult>()
    for (const results of shardResults) {
      for (const r of results) {
        const existing = byTrack.get(r.trackIndex)
        if (existing) existing.matches.push(...r.matches)
        else byTrack.set(r.trackIndex, { trackIndex: r.trackIndex, matches: [...r.matches] })
      }
    }
    return Array.from(byTrack.values())
  }

  /**
   * Send one request to one worker and await its terminal message. Each
   * worker processes messages serially and callers serialize phases, so a
   * single pending handler per worker suffices.
   */
  private request<T>(
    state: WorkerState,
    payload: unknown,
    doneType: string,
    extract: (data: Record<string, unknown>) => T,
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const { worker } = state
      const onMessage = (event: MessageEvent) => {
        const data = event.data
        if (data.type === 'progress') {
          state.progress = { phase: data.phase, current: data.current, total: data.total }
          this.reportAggregateProgress()
        } else if (data.type === doneType) {
          cleanup()
          resolve(extract(data))
        } else if (data.type === 'error') {
          cleanup()
          reject(new Error(data.error))
        }
      }
      const onError = (event: ErrorEvent) => {
        cleanup()
        this.terminate()
        reject(new Error('Match worker error: ' + (event.message ?? 'unknown')))
      }
      const cleanup = () => {
        worker.removeEventListener('message', onMessage)
        worker.removeEventListener('error', onError)
      }
      worker.addEventListener('message', onMessage)
      worker.addEventListener('error', onError)
      worker.postMessage(payload)
    })
  }

  /** Sum progress across workers and report. */
  private reportAggregateProgress(): void {
    if (!this.progressCallback) return

    let bestPhase: MatchProgress['phase'] = 'done'
    let current = 0
    let total = 0
    for (const state of this.workers) {
      if (!state.progress) continue
      const p = state.progress
      if (p.phase === 'matching' && bestPhase !== 'matching') bestPhase = 'matching'
      if (p.phase === 'building-keys' && bestPhase === 'done') bestPhase = 'building-keys'
      current += p.current
      total += p.total
    }
    this.progressCallback({ phase: bestPhase, current, total })
  }

  terminate(): void {
    for (const state of this.workers) state.worker.terminate()
    this.workers = []
    this.mapsVersion = null
    this.progressCallback = null
  }
}

// Singleton instance — keeps the workers (and their shard indexes) alive
// across tab switches so re-matching stays warm
let matchClient: MatchClient | null = null

export function getMatchClient(): MatchClient {
  if (!matchClient) {
    matchClient = new MatchClient()
  }
  return matchClient
}
