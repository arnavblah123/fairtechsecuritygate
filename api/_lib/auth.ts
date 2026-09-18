import { SignJWT, jwtVerify } from 'jose'
import type { Context, Next } from 'hono'

export type GuardClaims = { role: 'guard'; unit_id: string; guard_id: string; device_id: string }
export type AdminClaims = { role: 'admin'; admin_id: string; email: string }
export type Claims = GuardClaims | AdminClaims

const GUARD_TTL = 30 * 24 * 3600
const ADMIN_TTL = 7 * 24 * 3600

function secret(): Uint8Array {
  const s = process.env.GATE_JWT_SECRET || process.env.JWT_SECRET
  if (!s || s.length < 16) throw new Error('GATE_JWT_SECRET must be set (16+ characters)')
  return new TextEncoder().encode(s)
}

export async function signToken(claims: Claims): Promise<string> {
  const ttl = claims.role === 'guard' ? GUARD_TTL : ADMIN_TTL
  return new SignJWT({ ...claims }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime(Math.floor(Date.now() / 1000) + ttl).sign(secret())
}

export async function verifyToken(token: string): Promise<(Claims & { exp: number }) | null> {
  try {
    const { payload } = await jwtVerify(token, secret())
    if (payload.role !== 'guard' && payload.role !== 'admin') return null
    return payload as unknown as Claims & { exp: number }
  } catch {
    return null
  }
}

export type Env = { Variables: { auth: Claims & { exp: number } } }

export function requireRole(role: 'guard' | 'admin' | 'any') {
  return async (c: Context<Env>, next: Next) => {
    const h = c.req.header('authorization') || ''
    const token = h.startsWith('Bearer ') ? h.slice(7) : ''
    const claims = token ? await verifyToken(token) : null
    if (!claims || (role !== 'any' && claims.role !== role)) return c.json({ error: 'unauthorized' }, 401)
    c.set('auth', claims)
    await next()
  }
}
