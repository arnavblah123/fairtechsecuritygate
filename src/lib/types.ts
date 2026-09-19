export type UnitId = 'dehu' | 'savli'
export type Lang = 'en' | 'hi' | 'mr' | 'gu'
export type Direction = 'in' | 'out'

export interface Unit {
  id: UnitId
  name: string
  default_language: Lang
  unit_head_name: string | null
  unit_head_phone: string | null
}

export interface GuardSession {
  guardId: string
  guardName: string
  unitId: UnitId
  unitName: string
  unitHeadName: string | null
  unitHeadPhone: string | null
  loggedInAt: string
}

export interface Labourer {
  id: string
  unit_id: string
  name: string
  name_hi?: string | null
  contractor_id: string | null
  contractor_name?: string | null
  photo_path: string | null
  status: 'approved' | 'pending' | 'rejected' | 'inactive'
  skill?: string | null
  external_code?: string | null
  updated_at?: string
}

export interface Contractor {
  id: string
  unit_id: string
  name: string
  active: boolean
}

export interface LabourMovement {
  id: string
  unit_id: string
  labourer_id: string
  direction: Direction
  at: string
  device_at: string | null
  guard_id: string | null
  carrying_photo_path: string | null
  voided_at: string | null
  void_reason?: string | null
  // local only
  pending?: number // 1 = still in the outbox
  labourer_name?: string
  labourer_photo?: string | null
  mistake_reported?: number
}

export type VisitorPurpose = 'client' | 'supplier' | 'transporter' | 'government' | 'interview' | 'other'
export type IdType = 'aadhaar' | 'dl' | 'company_id' | 'none'
export const VISITOR_PURPOSES: VisitorPurpose[] = ['client', 'supplier', 'transporter', 'government', 'interview', 'other']
export const ID_TYPES: IdType[] = ['aadhaar', 'dl', 'company_id', 'none']

export interface Visitor {
  id: string
  unit_id: string
  name: string
  company: string | null
  purpose: VisitorPurpose
  meeting_staff_id: string | null
  meeting_name: string | null
  persons: number
  id_type: IdType
  photo_path: string | null
  in_at: string
  in_guard_id: string | null
  out_at: string | null
  out_guard_id: string | null
  device_at: string | null
  voided_at: string | null
  void_reason?: string | null
  // local only
  pending?: number // 1 = IN not sent yet
  out_pending?: number // 1 = OUT not sent yet
}

export type VehicleType = 'truck' | 'tempo' | 'trailer' | 'car' | 'bike' | 'crane_hydra'
export type VehiclePurpose = 'material_in' | 'material_out' | 'scrap_out' | 'empty' | 'visitor'
export const VEHICLE_TYPES: VehicleType[] = ['truck', 'tempo', 'trailer', 'car', 'bike', 'crane_hydra']
export const VEHICLE_PURPOSES: VehiclePurpose[] = ['material_in', 'material_out', 'scrap_out', 'empty', 'visitor']

export interface Vehicle {
  id: string
  unit_id: string
  plate: string
  vehicle_type: VehicleType
  purpose: VehiclePurpose
  driver_name: string | null
  plate_photo_path: string | null
  challan_photo_path: string | null
  loaded_photo_path: string | null
  gatepass_photo_path: string | null
  in_at: string
  in_guard_id: string | null
  out_at: string | null
  out_guard_id: string | null
  out_loaded: boolean | null
  out_loaded_photo_path: string | null
  device_at: string | null
  voided_at: string | null
  void_reason?: string | null
  // local only
  pending?: number
  out_pending?: number
}

export interface Staff {
  id: string
  unit_id: string
  name: string
  phone: string | null
  sort_order: number
}

export interface Company {
  id: string
  unit_id: string | null
  name: string
  category: string
}

export interface BlacklistEntry {
  id: string
  kind: 'person' | 'plate'
  labourer_id: string | null
  name: string | null
  plate: string | null
  reason: string | null
}

export type Register = 'labour' | 'visitor' | 'vehicle'

export type OutboxKind = 'upload' | 'insert' | 'rpc'

export interface OutboxItem {
  seq?: number
  id: string
  kind: OutboxKind
  table?: string
  fn?: string
  path?: string
  payload?: Record<string, unknown>
  status: 'pending' | 'error'
  attempts: number
  lastError?: string
  createdAt: string
  // human-readable, for the sync screen
  label: string
}
