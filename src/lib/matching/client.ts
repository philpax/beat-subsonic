/**
 * Main-thread client for the matching Web Worker.
 *
 * Provides an async method that posts data to the worker and awaits results.
 * Reports progress via a callback.
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
}

export class MatchClient {
  private worker: Worker | null = null
  private currentResolve: ((results: MatchResult[]) => void) | null = null
  private currentReject: ((error: Error) => void) | null = null
  private progressCallback: ((progress: MatchProgress) => void) | null = null

  init(): void {
    if (this.worker) return

    this.worker = new Worker(
      new URL('./worker.ts', import.meta.url),
      { type: 'module' }
    )

    this.worker.onmessage = (event: MessageEvent) => {
      const data = event.data

      if (data.type === 'progress') {
        this.progressCallback?.({
          phase: data.phase,
          current: data.current,
          total: data.total,
        })
      } else if (data.type === 'result') {
        this.currentResolve?.(data.results as MatchResult[])
        this.currentResolve = null
        this.currentReject = null
      } else if (data.type === 'error') {
        this.currentReject?.(new Error(data.error))
        this.currentResolve = null
        this.currentReject = null
      }
    }

    this.worker.onerror = (event) => {
      this.currentReject?.(new Error('Match worker error: ' + (event.message ?? 'unknown')))
      this.currentResolve = null
      this.currentReject = null
    }
  }

  async match(
    input: MatchWorkerInput,
    onProgress?: (progress: MatchProgress) => void
  ): Promise<MatchResult[]> {
    if (!this.worker) {
      this.init()
    }

    this.progressCallback = onProgress ?? null

    return new Promise((resolve, reject) => {
      this.currentResolve = resolve
      this.currentReject = reject
      this.worker!.postMessage(input)
    })
  }

  terminate(): void {
    if (this.worker) {
      this.worker.terminate()
      this.worker = null
    }
    this.currentResolve = null
    this.currentReject = null
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
