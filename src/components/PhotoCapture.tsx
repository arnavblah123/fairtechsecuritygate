import { useEffect, useRef, useState } from 'react'
import BigButton from './BigButton'
import { compressPhoto } from '../lib/photo'
import { useT } from '../lib/i18n'

/**
 * Uses the phone's native camera through <input capture>. Most reliable on basic Android.
 * The camera opens only when the guard presses the button (autoOpen is off by default everywhere).
 * Shows a preview with Retake / OK; calls onDone with the compressed JPEG.
 */
export default function PhotoCapture({ onDone, label, autoOpen = false }: { onDone: (blob: Blob) => void; label?: string; autoOpen?: boolean }) {
  const { t } = useT()
  const input = useRef<HTMLInputElement>(null)
  const [preview, setPreview] = useState<{ blob: Blob; url: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const opened = useRef(false)

  const open = () => input.current?.click()
  useEffect(() => {
    if (autoOpen && !opened.current) {
      opened.current = true
      const t = setTimeout(open, 50)
      return () => clearTimeout(t)
    }
  }, [autoOpen])

  const onFile = async (f: File | undefined) => {
    if (!f) return
    setBusy(true)
    try {
      const blob = await compressPhoto(f)
      if (preview) URL.revokeObjectURL(preview.url)
      setPreview({ blob, url: URL.createObjectURL(blob) })
    } finally {
      setBusy(false)
      if (input.current) input.current.value = ''
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <input ref={input} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void onFile(e.target.files?.[0])} />
      {preview ? (
        <>
          <img src={preview.url} alt="" className="max-h-[50vh] w-full rounded-2xl object-contain bg-black" />
          <div className="flex gap-3">
            <BigButton variant="plain" icon="🔄" onClick={open}>{t('retake')}</BigButton>
            <BigButton variant="in" icon="✓" onClick={() => onDone(preview.blob)}>{t('use_photo')}</BigButton>
          </div>
        </>
      ) : (
        <BigButton size="xl" icon="📷" onClick={open} disabled={busy}>{busy ? '…' : (label ?? t('take_photo'))}</BigButton>
      )}
    </div>
  )
}
