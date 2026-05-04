import { Router } from 'express'
import bcrypt from 'bcrypt'
import { z } from 'zod'
import { db, storeCollection } from '../firebase'
import {
  signToken,
  requireAuth,
  requireRole,
  getAuthedUser,
  type TokenPayload,
} from '../middleware/auth'
import { newJti, createSession, revokeSession } from '../lib/sessions'
import {
  ApiError,
  sendError,
  throwInvalidCredentials,
  throwLocked,
  throwBadRequest,
  throwNotFound,
  throwForbidden,
} from '../lib/errors'
import { append, buildEntry } from '../lib/audit'
import { nowJstIso } from '../lib/businessDate'
import { UserAccountSchema, type UserAccount, type Role, type Cast } from '../types'

export const authRouter = Router()
const col = () => storeCollection('userAccounts')
const castsCol = () => storeCollection('casts')

const BCRYPT_ROUNDS = 10
const FAIL_LIMIT = 5
const LOCK_DURATION_MS = 5 * 60 * 1000
const VALID_ROLES: ReadonlyArray<Role> = ['owner', 'staff', 'cast']

type PublicUser = Omit<UserAccount, 'pinHash' | 'failedAttempts' | 'lockedUntil'>

function publicUser(u: UserAccount): PublicUser {
  const { pinHash: _ph, failedAttempts: _fa, lockedUntil: _lu, ...safe } = u
  return safe as PublicUser
}

authRouter.post('/login', async (req, res) => {
  try {
    const { username, pin } = req.body ?? {}
    if (typeof username !== 'string' || typeof pin !== 'string') {
      throwBadRequest('username / pin が必要です')
    }
    const ref = col().doc(username)
    const snap = await ref.get()
    if (!snap.exists) throwInvalidCredentials()
    const user = snap.data() as UserAccount
    if (user.deletedAt) throwInvalidCredentials()

    if (user.lockedUntil) {
      const lockedUntilMs = new Date(user.lockedUntil).getTime()
      if (Date.now() < lockedUntilMs) throwLocked(user.lockedUntil)
    }

    const ok = user.pinHash ? await bcrypt.compare(pin, user.pinHash) : false
    if (!ok) {
      const fail = (user.failedAttempts ?? 0) + 1
      if (fail >= FAIL_LIMIT) {
        const lockedUntil = new Date(Date.now() + LOCK_DURATION_MS).toISOString()
        await ref.update({ failedAttempts: fail, lockedUntil })
        await append(
          buildEntry({
            action: 'PIN_LOCKED',
            performedBy: username,
            targetType: 'user',
            targetId: username,
            payload: { lockedUntil, failedAttempts: fail },
          }),
        )
        throwLocked(lockedUntil)
      }
      await ref.update({ failedAttempts: fail })
      await append(
        buildEntry({
          action: 'LOGIN_FAILED',
          performedBy: username,
          targetType: 'user',
          targetId: username,
          payload: { failedAttempts: fail },
        }),
      )
      throwInvalidCredentials()
    }

    const jti = newJti()
    const castId = user.role === 'cast' ? user.castId : undefined
    const payload: TokenPayload = {
      jti,
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      ...(castId !== undefined ? { castId } : {}),
    }
    const token = signToken(payload)
    await createSession({
      jti,
      username: user.username,
      role: user.role,
      ...(castId !== undefined ? { castId } : {}),
    })
    await ref.update({ failedAttempts: 0, lockedUntil: null })
    await append(
      buildEntry({
        action: 'LOGIN_SUCCESS',
        performedBy: username,
        targetType: 'user',
        targetId: username,
      }),
    )
    res.json({ ...publicUser(user), token })
  } catch (e) {
    sendError(res, e)
  }
})

authRouter.post('/heartbeat', requireAuth, (req, res) => {
  const user = getAuthedUser(req)
  res.json({
    ok: true,
    jti: user.jti,
    username: user.username,
    refreshedAt: nowJstIso(),
  })
})

authRouter.post('/logout', requireAuth, async (req, res) => {
  try {
    const user = getAuthedUser(req)
    await revokeSession(user.jti)
    await append(
      buildEntry({
        action: 'LOGOUT',
        performedBy: user.username,
        targetType: 'user',
        targetId: user.username,
      }),
    )
    res.json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
})

authRouter.get('/users', requireAuth, requireRole('owner'), async (_req, res) => {
  try {
    const snap = await col().get()
    const data = snap.docs
      .map((d) => d.data() as UserAccount)
      .filter((u) => !u.deletedAt)
    res.json(data.map(publicUser))
  } catch (e) {
    sendError(res, e)
  }
})

authRouter.post('/users', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const body = req.body ?? {}
    if (typeof body.username !== 'string' || typeof body.pin !== 'string') {
      throwBadRequest('username / pin が必要です')
    }
    if (typeof body.role !== 'string' || typeof body.displayName !== 'string') {
      throwBadRequest('role / displayName が必要です')
    }
    const existing = await col().doc(body.username).get()
    if (existing.exists) {
      throw new ApiError(409, 'USER_EXISTS', 'ユーザーが既に存在します')
    }
    const pinHash = await bcrypt.hash(body.pin, BCRYPT_ROUNDS)
    const performer = getAuthedUser(req).username
    const now = nowJstIso()

    // role=cast かつ castId 未指定 → casts に新規キャスト作成して同時 batch コミット
    let castId: number | undefined = body.castId
    let newCast: Cast | null = null
    if (body.role === 'cast' && body.castId === undefined) {
      if (typeof body.castName !== 'string' || !body.castName) {
        throwBadRequest('castName が必要です')
      }
      if (typeof body.hourlyRate !== 'number' || body.hourlyRate <= 0) {
        throwBadRequest('hourlyRate (cast) は正の数値で指定してください')
      }
      if (
        typeof body.guaranteeRate !== 'number' ||
        body.guaranteeRate < 0 ||
        body.guaranteeRate > 1
      ) {
        throwBadRequest('guaranteeRate は 0.0〜1.0 で指定してください')
      }
      // 採番: 既存 cast の最大 id + 1（オーナー1名運用前提でレースは許容）
      const castsSnap = await castsCol().get()
      const maxId = castsSnap.docs.reduce(
        (m, d) => Math.max(m, (d.data() as Cast).id ?? 0),
        0,
      )
      castId = maxId + 1
      newCast = {
        id: castId,
        name: body.castName,
        hourlyRate: body.hourlyRate,
        backRates: {},
        guaranteeRate: body.guaranteeRate,
        active: true,
        createdBy: performer,
        createdAt: now,
      }
    }

    let user: UserAccount
    try {
      user = UserAccountSchema.parse({
        username: body.username,
        pinHash,
        displayName: body.displayName,
        role: body.role,
        ...(castId !== undefined ? { castId } : {}),
        ...(body.role === 'staff' && typeof body.hourlyRate === 'number'
          ? { hourlyRate: body.hourlyRate }
          : {}),
        failedAttempts: 0,
        createdBy: performer,
        createdAt: now,
      })
    } catch (e) {
      if (e instanceof z.ZodError) {
        throw new ApiError(400, 'VALIDATION_FAILED', 'バリデーション失敗', e.issues)
      }
      throw e
    }

    const batch = db.batch()
    if (newCast) {
      batch.set(castsCol().doc(String(newCast.id)), newCast)
    }
    batch.set(col().doc(user.username), user)
    await batch.commit()

    res.status(201).json({ user: publicUser(user), cast: newCast })
  } catch (e) {
    sendError(res, e)
  }
})

authRouter.patch('/users/:username', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const ref = col().doc(String(req.params.username))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('ユーザーが見つかりません')
    const update: Record<string, unknown> = { ...req.body }
    if (update.role !== undefined && !VALID_ROLES.includes(update.role as Role)) {
      throwBadRequest('role は owner / staff / cast のいずれか')
    }
    if (typeof update.pin === 'string') {
      update.pinHash = await bcrypt.hash(update.pin, BCRYPT_ROUNDS)
      delete update.pin
      update.failedAttempts = 0
      update.lockedUntil = null
      update.pinUpdatedAt = nowJstIso()
    }
    delete update.username
    update.updatedBy = getAuthedUser(req).username
    update.updatedAt = nowJstIso()
    await ref.update(update)
    const updated = await ref.get()
    res.json(publicUser(updated.data() as UserAccount))
  } catch (e) {
    sendError(res, e)
  }
})

// DELETE /users/:username — soft-delete (UserAccount に deletedAt/deletedBy 持つ)
authRouter.delete('/users/:username', requireAuth, requireRole('owner'), async (req, res) => {
  try {
    const ref = col().doc(String(req.params.username))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('ユーザーが見つかりません')
    const target = doc.data() as UserAccount
    // owner は削除不可（PIN 変更等の運用に必要なため AdminPage には表示しつつ削除のみガード）
    if (target.role === 'owner') {
      throwForbidden('オーナーアカウントは削除できません')
    }
    const performer = getAuthedUser(req).username
    await ref.update({
      deletedAt: nowJstIso(),
      deletedBy: performer,
    })
    res.json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
})
