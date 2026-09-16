import { useLiveQuery } from 'dexie-react-hooks'
import { useNavigate } from 'react-router-dom'
import BigButton from '../components/BigButton'
import TopBar from '../components/TopBar'
import { db } from '../lib/db'
import { useT } from '../lib/i18n'
import { setGuardSession } from '../lib/session'
import { processOutbox, retryErrors, useOnline, useSyncState } from '../lib/sync'
import { fmtDateTime } from '../lib/time'

export default function SyncStatus() {
  const { t } = useT()
  const nav = useNavigate()
  const online = useOnline()
  const state = useSyncState()
  const items = useLiveQuery(() => db.outbox.orderBy('seq').toArray(), [], [])
  const lastAt = useLiveQuery(async () => (await db.kv.get('sync.lastAt'))?.value as string | undefined, [])
  const errors = items.filter((i) => i.status === 'error')

  return (
    <div className="flex min-h-screen flex-col">
      <TopBar title={t('sync_status')} onBack={() => nav('/')} />
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-xl">{online ? '🟢' : '⚪'} {online ? '' : t('offline')} {lastAt ? `· ${t('last_sync')}: ${fmtDateTime(lastAt)}` : ''}</p>
        {items.length === 0 && <p className="rounded-2xl bg-green-100 p-4 text-center text-2xl font-bold text-green-800">{t('all_synced')}</p>}
        {state === 'auth' && (
          <BigButton variant="danger" icon="🔑" onClick={() => { setGuardSession(null); nav('/login', { replace: true }) }}>{t('login_again')}</BigButton>
        )}
        {items.length > 0 && (
          <>
            <BigButton icon="📤" onClick={() => void (errors.length ? retryErrors() : processOutbox())} disabled={!online || state === 'syncing'}>
              {state === 'syncing' ? '…' : t('retry')}
            </BigButton>
            <h2 className="text-lg font-bold">{t('pending_entries')}: {items.length - errors.length} · {t('failed_entries')}: {errors.length}</h2>
            <ul className="grid gap-2">
              {items.map((i) => (
                <li key={i.seq} className={`card p-2 ${i.status === 'error' ? 'border-red-400 bg-red-50' : ''}`}>
                  <div className="font-semibold">{i.label}</div>
                  <div className="text-sm text-gray-600">{fmtDateTime(i.createdAt)}{i.lastError ? ` · ${i.lastError}` : ''}</div>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  )
}
