import { useEffect, useState } from 'react'

export default function PinPad({ onComplete, disabled, resetKey }: { onComplete: (pin: string) => void; disabled?: boolean; resetKey?: number }) {
  const [pin, setPin] = useState('')
  useEffect(() => { setPin('') }, [resetKey])
  const push = (d: string) => {
    if (disabled || pin.length >= 4) return
    const p = pin + d
    setPin(p)
    if (p.length === 4) { onComplete(p); setTimeout(() => setPin(''), 300) }
  }
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫']
  return (
    <div className="mx-auto w-full max-w-xs">
      <div className="mb-4 flex justify-center gap-4">
        {[0, 1, 2, 3].map((i) => (
          <span key={i} className={`h-6 w-6 rounded-full border-4 border-blue-700 ${pin.length > i ? 'bg-blue-700' : 'bg-white'}`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {keys.map((k, i) => (
          <button
            key={i}
            type="button"
            disabled={disabled || k === ''}
            onClick={() => (k === '⌫' ? setPin(pin.slice(0, -1)) : push(k))}
            className={`h-16 rounded-2xl text-3xl font-bold ${k === '' ? 'invisible' : 'bg-gray-100 border-2 border-gray-300 active:bg-blue-100'}`}
          >
            {k}
          </button>
        ))}
      </div>
    </div>
  )
}
