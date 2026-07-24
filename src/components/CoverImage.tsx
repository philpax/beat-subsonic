import { useState } from 'react'
import { buildCoverUrl } from '@/lib/types'

interface CoverImageProps {
  hash: string
  alt?: string
  className?: string
}

export function CoverImage({ hash, alt = '', className = '' }: CoverImageProps) {
  const [loaded, setLoaded] = useState(false)
  const [error, setError] = useState(false)

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-muted ${className}`}>
        <span className="text-xs text-muted-foreground">No cover</span>
      </div>
    )
  }

  return (
    <>
      {!loaded && <div className={`animate-pulse bg-muted ${className}`} />}
      <img
        src={buildCoverUrl(hash)}
        alt={alt}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setError(true)}
        className={`${className} ${loaded ? '' : 'hidden'}`}
      />
    </>
  )
}
