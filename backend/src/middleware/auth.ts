import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { touchSession, type Role } from '../lib/sessions'
import { ApiError, sendError } from '../lib/errors'

const JWT_SECRET = process.env.JWT_SECRET || 'club-galaxy-dev-secret'
const TOKEN_EXPIRY_SECONDS = 12 * 60 * 60

export interface TokenPayload {
  jti: string
  username: string
  role: Role
  displayName: string
  castId?: number
}

type AuthedRequest = Request & { user: TokenPayload }

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: TOKEN_EXPIRY_SECONDS })
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, JWT_SECRET) as TokenPayload
}

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    sendError(res, new ApiError(401, 'AUTH_REQUIRED', '認証が必要です'))
    return
  }
  let payload: TokenPayload
  try {
    payload = verifyToken(header.slice(7))
  } catch {
    sendError(res, new ApiError(401, 'AUTH_INVALID_TOKEN', 'トークンが無効です'))
    return
  }
  if (!payload.jti) {
    sendError(res, new ApiError(401, 'AUTH_INVALID_TOKEN', 'jti が欠落しています'))
    return
  }
  const session = await touchSession(payload.jti)
  if (!session) {
    sendError(res, new ApiError(401, 'SESSION_EXPIRED', 'セッションが期限切れです'))
    return
  }
  ;(req as AuthedRequest).user = payload
  next()
}

export function requireRole(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = (req as Partial<AuthedRequest>).user
    if (!user) {
      sendError(res, new ApiError(401, 'AUTH_REQUIRED', '認証が必要です'))
      return
    }
    if (!roles.includes(user.role)) {
      sendError(
        res,
        new ApiError(403, 'FORBIDDEN', `アクセス権限がありません（要 role: ${roles.join('/')})`),
      )
      return
    }
    next()
  }
}

export const requireOwner = requireRole('owner')

export function getAuthedUser(req: Request): TokenPayload {
  return (req as AuthedRequest).user
}
