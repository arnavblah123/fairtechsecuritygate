// Guard-side actions. Everything is written locally first, then queued for sync.
import { db } from './db'
import { enqueue } from './sync'
import { newPhotoPath, storePhotoLocally } from './photo'
import { nativeName } from './names'
import { getDeviceId } from './session'
import type { Direction, GuardSession, IdType, Labourer, LabourMovement, Register, Vehicle, VehiclePurpose, VehicleType, Visitor, VisitorPurpose } from './types'

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

/** Save IN / OUT. flag = 'double_in' / 'double_out' when the guard confirmed a repeated direction; the server re-checks it. */
export async function recordMovement(s: GuardSession, labourer: Labourer, direction: Direction, flag: LabourMovement['flag'] = null): Promise<LabourMovement> {
  const id = crypto.randomUUID()
  const at = nowIso()
  const row: LabourMovement = {
    id, unit_id: s.unitId, labourer_id: labourer.id, direction, at, device_at: at,
    guard_id: s.guardId, carrying_photo_path: null, voided_at: null, flag, pending: 1,
  }
  await db.movements.put(row)
  await enqueue([{
    id, kind: 'insert', table: 'labour_movements', label: `${direction.toUpperCase()} ${labourer.name}${flag ? ' (flagged)' : ''}`,
    payload: { id, unit_id: s.unitId, labourer_id: labourer.id, direction, device_at: at, guard_id: s.guardId, device_id: getDeviceId(), flag },
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
  const labourer: Labourer = { id, unit_id: s.unitId, name, name_hi: nativeName(name), contractor_id: contractorId, contractor_name: contractorName, photo_path: path, status: 'pending', updated_at: nowIso() }
  await db.labourers.put(labourer)
  await enqueue([
    { id: `${id}:photo`, kind: 'upload', path, label: `Photo ${name}` },
    { id, kind: 'insert', table: 'labourers', label: `New person ${name}`, payload: { id, unit_id: s.unitId, name, contractor_id: contractorId, photo_path: path, status: 'pending' } },
  ])
  const mv = await recordMovement(s, labourer, 'in')
  return { labourer, movement: mv }
}

export interface NewVisitor {
  name: string
  company: string | null
  purpose: VisitorPurpose
  meeting_staff_id: string | null
  meeting_name: string | null
  persons: number
  id_type: IdType
}

export async function createVisitor(s: GuardSession, v: NewVisitor, photo: Blob): Promise<Visitor> {
  const id = crypto.randomUUID()
  const at = nowIso()
  const path = newPhotoPath(s.unitId, 'visitor')
  await storePhotoLocally(path, photo)
  const row: Visitor = {
    id, unit_id: s.unitId, ...v, photo_path: path, in_at: at, in_guard_id: s.guardId, out_at: null, out_guard_id: null,
    device_at: at, voided_at: null, pending: 1, out_pending: 0,
  }
  await db.visitors.put(row)
  await enqueue([
    { id: `${id}:photo`, kind: 'upload', path, label: `Photo ${v.name}` },
    { id, kind: 'insert', table: 'visitors', label: `Visitor IN ${v.name}`, payload: { id, ...v, photo_path: path, device_at: at } },
  ])
  return row
}

export async function markVisitorOut(s: GuardSession, id: string) {
  const at = nowIso()
  await db.visitors.update(id, { out_at: at, out_guard_id: s.guardId, out_pending: 1 })
  const v = await db.visitors.get(id)
  await enqueue([{ id: `${id}:out`, kind: 'rpc', fn: 'mark_visitor_out', payload: { p_id: id }, label: `Visitor OUT ${v?.name ?? ''}` }])
}

export interface NewVehicle {
  plate: string
  vehicle_type: VehicleType
  purpose: VehiclePurpose
  driver_name: string | null
}
export interface VehiclePhotos { plate: Blob; challan?: Blob | null }

/** Number plate as stored: upper case, letters and digits only. */
export const normalizePlate = (p: string) => p.toUpperCase().replace(/[^A-Z0-9]/g, '')

export async function createVehicle(s: GuardSession, v: NewVehicle, photos: VehiclePhotos): Promise<Vehicle> {
  const id = crypto.randomUUID()
  const at = nowIso()
  const plate = normalizePlate(v.plate)
  const paths: Record<string, string | null> = { plate_photo_path: null, challan_photo_path: null, loaded_photo_path: null, gatepass_photo_path: null }
  const uploads: Parameters<typeof enqueue>[0] = []
  for (const [key, blob] of [['plate_photo_path', photos.plate], ['challan_photo_path', photos.challan]] as const) {
    if (!blob) continue
    const path = newPhotoPath(s.unitId, 'vehicle')
    await storePhotoLocally(path, blob)
    paths[key] = path
    uploads.push({ id: `${id}:${key}`, kind: 'upload', path, label: `Photo ${plate}` })
  }
  const row: Vehicle = {
    id, unit_id: s.unitId, plate, vehicle_type: v.vehicle_type, purpose: v.purpose, driver_name: v.driver_name,
    plate_photo_path: paths.plate_photo_path, challan_photo_path: paths.challan_photo_path, loaded_photo_path: paths.loaded_photo_path, gatepass_photo_path: paths.gatepass_photo_path,
    in_at: at, in_guard_id: s.guardId, out_at: null, out_guard_id: null, out_loaded: null, out_loaded_photo_path: null,
    device_at: at, voided_at: null, pending: 1, out_pending: 0,
  }
  await db.vehicles.put(row)
  await enqueue([
    ...uploads,
    { id, kind: 'insert', table: 'vehicles', label: `Vehicle IN ${plate}`, payload: { id, plate, vehicle_type: v.vehicle_type, purpose: v.purpose, driver_name: v.driver_name, ...paths, device_at: at } },
  ])
  return row
}

/** Material OUT / Scrap OUT: the loaded-vehicle photo, taken when the truck is loaded (before OUT). */
export async function attachVehicleLoadedPhoto(s: GuardSession, id: string, blob: Blob) {
  const path = newPhotoPath(s.unitId, 'vehicle')
  await storePhotoLocally(path, blob)
  await db.vehicles.update(id, { loaded_photo_path: path })
  const v = await db.vehicles.get(id)
  await enqueue([
    { id: `${id}:loaded`, kind: 'upload', path, label: `Loaded photo ${v?.plate ?? ''}` },
    { id: `${id}:loadedlink`, kind: 'rpc', fn: 'attach_vehicle_photo', payload: { p_id: id, p_path: path }, label: `Loaded photo link ${v?.plate ?? ''}` },
  ])
}

export async function markVehicleOut(s: GuardSession, id: string, loaded: boolean | null, photo: Blob | null) {
  const at = nowIso()
  let path: string | null = null
  const items: Parameters<typeof enqueue>[0] = []
  if (photo) {
    path = newPhotoPath(s.unitId, 'vehicle')
    await storePhotoLocally(path, photo)
    items.push({ id: `${id}:outphoto`, kind: 'upload', path, label: 'Loaded photo' })
  }
  const cur = await db.vehicles.get(id)
  const materialOut = cur?.purpose === 'material_out' || cur?.purpose === 'scrap_out'
  await db.vehicles.update(id, materialOut
    ? { out_at: at, out_guard_id: s.guardId, out_loaded: true, loaded_photo_path: cur?.loaded_photo_path ?? path, out_pending: 1 }
    : { out_at: at, out_guard_id: s.guardId, out_loaded: loaded, out_loaded_photo_path: path, out_pending: 1 })
  const v = await db.vehicles.get(id)
  items.push({ id: `${id}:out`, kind: 'rpc', fn: 'mark_vehicle_out', payload: { p_id: id, p_loaded: loaded, p_photo: path }, label: `Vehicle OUT ${v?.plate ?? ''}` })
  await enqueue(items)
}

export async function reportMistake(s: GuardSession, register: Register, entryId: string, reason: string) {
  const id = crypto.randomUUID()
  const at = nowIso()
  await db.mistakes.put({ id, entry_id: entryId, register, reason, at })
  await enqueue([{
    id, kind: 'insert', table: 'mistake_reports', label: 'Mistake report',
    payload: { id, unit_id: s.unitId, register, entry_id: entryId, reason, guard_id: s.guardId, device_at: at },
  }])
}
