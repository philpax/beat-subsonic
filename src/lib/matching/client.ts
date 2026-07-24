/**
 * Main-thread client for the matching Web Worker.
 *
 * Spawns multiple workers for parallel matching. Each worker handles a
 * slice of tracks against the full map set. Results are aggregated.
 *
 * Memory tradeoff: each worker builds its own trigram index from the maps,
 * so memory usage is ~N_workers × index_size. For 340k maps the index is
 * ~50-100MB per worker, so we default to min(4, hardwareConcurrency) workers.
 */

import type { MatchResult } from './matcher'

export interface MatchWorkerInput {
  tracks: { index: number; artist: string; title: string }[]
  maps: { index: number; levelAuthor: string; songAuthor: string; songName: string }[]
  threshold: number
}

export interface MatchProgress {
  phase: 'building-keys' | 'matching' | 'done'
  current: number
  total: number
  /** Which partition (0-based), or -1 for aggregate. */
  partition: number
}

interface WorkerState {
  worker: Worker
  partition: number
  resolve: ((results: MatchResult[]) => void) | null
  reject: ((error: Error) => void) | null
  progress: MatchProgress | null
}

export class MatchClient {
  private workers: WorkerState[] = []
  private numWorkers: number
  private progressCallback: ((progress: MatchProgress) => void) | null = null

  constructor(numWorkers?: number) {
    this.numWorkers = numWorkers ?? Math.min(4, navigator.hardwareConcurrency || 2)
  }

  async match(
    input: MatchWorkerInput,
    onProgress?: (progress: MatchProgress) => void
  ): Promise<MatchResult[]> {
    this.progressCallback = onProgress ?? null
    this.terminate()

    const { tracks, maps, threshold } = input
    const n = this.numWorkers

    // Partition tracks across workers
    const partitionSize = Math.ceil(tracks.length / n)
    const partitions: MatchWorkerInput['tracks'][] = []
    for (let i = 0; i < n; i++) {
      const start = i * partitionSize
      const end = Math.min(start + partitionSize, tracks.length)
      partitions.push(tracks.slice(start, end))
    }

    // Spawn workers and dispatch
    const promises: Promise<MatchResult[]>[] = partitions.map((partitionTracks, i) => {
      return this.runWorker(i, n, partitionTracks, maps, threshold)
    })

    const allResults = await Promise.all(promises)
    return allResults.flat()
  }

  private runWorker(
    partition: number,
    totalPartitions: number,
    tracks: MatchWorkerInput['tracks'],
    maps: MatchWorkerInput['maps'],
    threshold: number
  ): Promise<MatchResult[]> {
    return new Promise((resolve, reject) => {
      const worker = new Worker(
        new URL('./worker.ts', import.meta.url),
        { type: 'module' }
      )

      const state: WorkerState = {
        worker,
        partition,
        resolve,
        reject,
        progress: null,
      }
      this.workers.push(state)

      worker.onmessage = (event: MessageEvent) => {
        const data = event.data

        if (data.type === 'progress') {
          state.progress = {
            phase: data.phase,
            current: data.current,
            total: data.total,
            partition: data.partition,
          }
          // Report aggregate progress
          this.reportAggregateProgress()
        } else if (data.type === 'result') {
          state.resolve?.(data.results as MatchResult[])
          state.resolve = null
          state.reject = null
        } else if (data.type === 'error') {
          state.reject?.(new Error(data.error))
          state.resolve = null
          state.reject = null
        }
      }

      worker.onerror = (event) => {
        state.reject?.(new Error('Match worker error: ' + (event.message ?? 'unknown')))
        state.resolve = null
        state.reject = null
      }

      worker.postMessage({
        type: 'match',
        tracks,
        maps,
        threshold,
        partition,
        totalPartitions,
      })
    })
  }

  /** Sum up progress across all workers and report. */
  private reportAggregateProgress(): void {
    if (!this.progressCallback) return

    // Find the "best" phase — 'matching' > 'building-keys' > 'done'
    let bestPhase: MatchProgress['phase'] = 'done'
    let totalCurrent = 0
    let totalTotal = 0

    for (const state of this.workers) {
      if (!state.progress) continue
      const p = state.progress
      if (p.phase === 'matching' && bestPhase !== 'matching') bestPhase = 'matching'
      if (p.phase === 'building-keys' && bestPhase === 'done') bestPhase = 'building-keys'
      totalCurrent += p.current
      totalTotal += p.total
    }

    this.progressCallback({
      phase: bestPhase,
      current: totalCurrent,
      total: totalTotal,
      partition: -1,
    })
  }

  terminate(): void {
    for (const state of this.workers) {
      state.worker.terminate()
    }
    this.workers = []
    for (const state of this.workers) {
      state.resolve = null
      state.reject = null
    }
    this.progressCallback = null
  }
}

// Singleton instance
let matchClient: MatchClient | null = null

export function getMatchClient(): MatchClient {
  if (!matchClient) {
    matchClient = new MatchClient()
  }
  return matchClient
}
