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
  contractor_id: string | null
  contractor_name?: string | null
  photo_path: string | null
  status: 'approved' | 'pending' | 'rejected' | 'inactive'
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
