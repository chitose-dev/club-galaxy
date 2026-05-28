import crypto from 'crypto'
import { db, STORE_ID } from '../firebase'
import { nowJstIso } from './businessDate'

export type Role = 'owner' | 'staff' | 'cast'

export interface SessionDoc {
  jti: string
  username: string
  role: Role
  castId?: number
  storeId: string
  createdAt: string
  lastActivityAt: string
  expiresAt: string
  revoked?: boolean
}

export const SESSION_TTL_MS = 12 * 60 * 60 * 1000
export const IDLE_TTL_MS = 30 * 60 * 1000

export function newJti(): string {
  return crypto.randomUUID()
}

function sessionCol(storeId: string) {
  return db.collection('stores').doc(storeId).collection('sessions')
}

export async function createSession(input: {
  jti: string
  username: string
  role: Role
  castId?: number
  storeId?: string
}): Promise<SessionDoc> {
  const storeId = input.storeId ?? STORE_ID
  const now = Date.now()
  const doc: SessionDoc = {
    jti: input.jti,
    username: input.username,
    role: input.role,
    storeId,
    createdAt: nowJstIso(),
    lastActivityAt: nowJstIso(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString(),
    ...(input.castId !== undefined ? { castId: input.castId } : {}),
  }
  await sessionCol(storeId).doc(input.jti).set(doc)
  return doc
}

export async function touchSession(jti: string, storeId: string = STORE_ID): Promise<SessionDoc | null> {
  const ref = sessionCol(storeId).doc(jti)
  const snap = await ref.get()
  if (!snap.exists) return null
  const session = snap.data() as SessionDoc
  if (session.revoked) return null

  const now = Date.now()
  const expiresAt = new Date(session.expiresAt).getTime()
  if (now > expiresAt) {
    await ref.update({ revoked: true })
    return null
  }

  const lastActivity = new Date(session.lastActivityAt).getTime()
  if (now - lastActivity > IDLE_TTL_MS) {
    await ref.update({ revoked: true })
    return null
  }

  const lastActivityAt = nowJstIso()
  await ref.update({ lastActivityAt })
  return { ...session, lastActivityAt }
}

export async function revokeSession(jti: string, storeId: string = STORE_ID): Promise<void> {
  await sessionCol(storeId).doc(jti).update({ revoked: true })
}
