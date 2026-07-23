import type { DatabaseStatus } from '@/hooks/useDatabase'
import type { DataLoadProgress } from '@/lib/data'
import { Loader2, Download, Database, AlertCircle } from 'lucide-react'

interface LoadingScreenProps {
  status: DatabaseStatus
  error: string | null
  progress: DataLoadProgress | null
}

export function LoadingScreen({ status, error, progress }: LoadingScreenProps) {
  const stageLabels: Record<string, string> = {
    idle: 'Initializing...',
    fetching: `Downloading data${progress?.sourceId ? ` from ${progress.sourceId}` : ''}...`,
    parsing: 'Parsing protobuf data...',
    importing: 'Importing into database...',
    ready: 'Ready',
    error: 'Error',
  }

  const bytesLoaded = progress?.bytesLoaded ?? 0
  const mbLoaded = (bytesLoaded / 1024 / 1024).toFixed(1)

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex flex-col items-center gap-4 px-4 text-center">
        {status === 'error' ? (
          <>
            <AlertCircle className="h-12 w-12 text-destructive" />
            <h1 className="text-xl font-semibold">Failed to load data</h1>
            <p className="max-w-md text-sm text-muted-foreground">{error}</p>
          </>
        ) : (
          <>
            <Database className="h-12 w-12 text-primary" />
            <h1 className="text-xl font-semibold">BeatSaver Map Database</h1>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>{stageLabels[status] ?? 'Loading...'}</span>
            </div>
            {bytesLoaded > 0 && status === 'fetching' && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Download className="h-3 w-3" />
                <span>{mbLoaded} MB downloaded</span>
              </div>
            )}
            <div className="text-xs text-muted-foreground">
              First load downloads ~50MB and may take a moment.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
