import type { DatabaseStatus } from '@/hooks/useDatabase'
import type { DataLoadProgress } from '@/lib/data'

interface LoadingScreenProps {
  status: DatabaseStatus
  error: string | null
  progress: DataLoadProgress | null
}

const STAGE_LABELS: Record<string, string> = {
  idle: 'Initializing',
  fetching: 'Downloading',
  parsing: 'Parsing',
  importing: 'Indexing',
  ready: 'Ready',
  error: 'Error',
}

export function LoadingScreen({ status, error, progress }: LoadingScreenProps) {
  const bytesLoaded = progress?.bytesLoaded ?? 0
  const mbLoaded = (bytesLoaded / 1024 / 1024).toFixed(1)
  const stageLabel = STAGE_LABELS[status] ?? 'Loading'

  if (status === 'error') {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
        <div className="w-full max-w-sm space-y-4">
          <div className="h-1 w-full rounded-full bg-destructive" />
          <h1 className="text-lg font-semibold tracking-tight">Couldn't load data</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="text-sm text-primary hover:underline"
          >
            Try again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-background px-6">
      <div className="w-full max-w-sm space-y-6">
        {/* Wordmark */}
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">
            BeatSubsonic
          </h1>
          <p className="text-xs text-muted-foreground">
            BeatSaver map database
          </p>
        </div>

        {/* Saber ignition bar */}
        <div className="space-y-2">
          <div className="h-px w-full overflow-hidden bg-border">
            <div className="saber-bar saber-gradient h-full" />
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono text-muted-foreground">{stageLabel}</span>
            {bytesLoaded > 0 && status === 'fetching' && (
              <span className="font-mono text-muted-foreground">{mbLoaded} MB</span>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">
          First load downloads ~13 MB of map data.
        </p>
      </div>
    </div>
  )
}
