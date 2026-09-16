import { useEffect, useState } from 'react'
import { photoUrl } from '../lib/photo'

export function usePhotoUrl(path: string | null | undefined, keep = false) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    setUrl(null)
    void photoUrl(path, keep).then((u) => { if (alive) setUrl(u) })
    return () => { alive = false }
  }, [path, keep])
  return url
}

export default function Photo({ path, keep, className = '', alt = '' }: { path: string | null | undefined; keep?: boolean; className?: string; alt?: string }) {
  const url = usePhotoUrl(path, keep)
  if (!url) return <div className={`flex items-center justify-center bg-gray-200 text-gray-400 ${className}`}>{path ? '…' : '👤'}</div>
  return <img src={url} alt={alt} className={className} />
}
