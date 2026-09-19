import Dexie, { type Table } from 'dexie'
import type { BlacklistEntry, Company, Contractor, Labourer, LabourMovement, OutboxItem, Staff, Vehicle, Visitor } from './types'

export interface PhotoBlob {
  path: string
  blob: Blob
  savedAt: string
  keep?: number // 1 = labourer profile photo, never pruned
}

export interface KV {
  key: string
  value: unknown
}

export interface MistakeLocal {
  id: string
  entry_id: string
  register: string
  reason: string
  at: string
}

class GateDB extends Dexie {
  labourers!: Table<Labourer, string>
  contractors!: Table<Contractor, string>
  movements!: Table<LabourMovement, string>
  outbox!: Table<OutboxItem, number>
  photos!: Table<PhotoBlob, string>
  kv!: Table<KV, string>
  mistakes!: Table<MistakeLocal, string>
  visitors!: Table<Visitor, string>
  vehicles!: Table<Vehicle, string>
  staff!: Table<Staff, string>
  companies!: Table<Company, string>
  blacklist!: Table<BlacklistEntry, string>

  constructor() {
    super('fairtech-gate')
    this.version(1).stores({
      labourers: 'id, unit_id, name, status',
      contractors: 'id, unit_id',
      movements: 'id, labourer_id, at, pending',
      outbox: '++seq, id, status',
      photos: 'path, savedAt',
      kv: 'key',
      mistakes: 'id, entry_id',
    })
    this.version(2).stores({
      visitors: 'id, in_at, pending, out_pending',
      vehicles: 'id, in_at, plate, pending, out_pending',
      staff: 'id',
      companies: 'id',
      blacklist: 'id, plate, labourer_id',
    })
  }
}

export const db = new GateDB()

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const row = await db.kv.get(key)
  return row?.value as T | undefined
}
export async function kvSet(key: string, value: unknown) {
  await db.kv.put({ key, value })
}

/** Wipe everything except the outbox and its photos (used on logout / unit change). */
export async function clearCaches() {
  await db.transaction('rw', [db.labourers, db.contractors, db.movements, db.mistakes, db.kv, db.visitors, db.vehicles, db.staff, db.companies, db.blacklist], async () => {
    await Promise.all([db.labourers, db.contractors, db.movements, db.mistakes, db.kv, db.visitors, db.vehicles, db.staff, db.companies, db.blacklist].map((t) => t.clear()))
  })
}
