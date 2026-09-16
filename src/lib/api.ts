// Guard-side actions. Everything is written locally first, then queued for sync.
import { db } from './db'
import { enqueue } from './sync'
import { newPhotoPath, storePhotoLocally } from './photo'
import { getDeviceId } from './session'
import type { Direction, GuardSession, Labourer, LabourMovement } from './types'

const nowIso = () => new Date().toISOString()

export async function latestMovement(labourerId: string): Promise<LabourMovement | undefined> {
  const rows = await db.movements.where('labourer_id').equals(labourerId).filter((m) => !m.voided_at).toArray()
  rows.sort((a, b) => (a.at < b.at ? 1 : -1))
  return rows[0]
}

export async function nextDirection(labourerId: string): Promise<Direction> {
  const last = await latestMovement(labourerId)
  return last?.direction === 'in' ? 'out' : 'in'
}

export async function recordMovement(s: GuardSession, labourer: Labourer, direction: Direction): Promise<LabourMovement> {
  const id = crypto.randomUUID()
  const at = nowIso()
  const row: LabourMovement = {
    id, unit_id: s.unitId, labourer_id: labourer.id, direction, at, device_at: at,
    guard_id: s.guardId, carrying_photo_path: null, voided_at: null, pending: 1,
  }
  await db.movements.put(row)
  await enqueue([{
    id, kind: 'insert', table: 'labour_movements', label: `${direction.toUpperCase()} ${labourer.name}`,
    payload: { id, unit_id: s.unitId, labourer_id: labourer.id, direction, device_at: at, guard_id: s.guardId, device_id: getDeviceId() },
  }])
  return row
}

export async function attachCarryingPhoto(s: GuardSession, movementId: string, blob: Blob) {
  const path = newPhotoPath(s.unitId, 'labour')
  await storePhotoLocally(path, blob)
  await db.movements.update(movementId, { carrying_photo_path: path })
  await enqueue([
    { id: `${movementId}:photo`, kind: 'upload', path, label: 'Carrying photo' },
    { id: `${movementId}:carry`, kind: 'rpc', fn: 'attach_carrying_photo', payload: { p_movement: movementId, p_path: path }, label: 'Carrying photo link' },
  ])
}

export async function createLabourerAndEnter(s: GuardSession, name: string, contractorId: string | null, contractorName: string | null, photo: Blob) {
  const id = crypto.randomUUID()
  const path = newPhotoPath(s.unitId, 'labourer')
  await storePhotoLocally(path, photo, true)
  const labourer: Labourer = { id, unit_id: s.unitId, name, contractor_id: contractorId, contractor_name: contractorName, photo_path: path, status: 'pending', updated_at: nowIso() }
  await db.labourers.put(labourer)
  await enqueue([
    { id: `${id}:photo`, kind: 'upload', path, label: `Photo ${name}` },
    { id, kind: 'insert', table: 'labourers', label: `New person ${name}`, payload: { id, unit_id: s.unitId, name, contractor_id: contractorId, photo_path: path, status: 'pending' } },
  ])
  const mv = await recordMovement(s, labourer, 'in')
  return { labourer, movement: mv }
}

export async function reportMistake(s: GuardSession, register: 'labour' | 'visitor' | 'vehicle', entryId: string, reason: string) {
  const id = crypto.randomUUID()
  const at = nowIso()
  await db.mistakes.put({ id, entry_id: entryId, register, reason, at })
  await enqueue([{
    id, kind: 'insert', table: 'mistake_reports', label: 'Mistake report',
    payload: { id, unit_id: s.unitId, register, entry_id: entryId, reason, guard_id: s.guardId, device_at: at },
  }])
}
