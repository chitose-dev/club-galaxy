import type { Response } from 'express'

export interface ErrorResponse {
  error: string
  message: string
  details?: unknown
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toJSON(): ErrorResponse {
    return {
      error: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

export function throwInvalidCredentials(): never {
  throw new ApiError(401, 'AUTH_INVALID', 'ユーザー名または PIN が違います')
}

export function throwLocked(lockedUntil: string): never {
  throw new ApiError(429, 'PIN_LOCKED', 'PIN ロック中', { lockedUntil })
}

export function throwUnauthenticated(): never {
  throw new ApiError(401, 'AUTH_REQUIRED', '認証が必要です')
}

export function throwForbidden(message = 'アクセス権限がありません'): never {
  throw new ApiError(403, 'FORBIDDEN', message)
}

export function throwNotFound(message = 'リソースが見つかりません'): never {
  throw new ApiError(404, 'NOT_FOUND', message)
}

export function throwLegalWithholdingNotConfigured(): never {
  throw new ApiError(
    503,
    'LEGAL_WITHHOLDING_NOT_CONFIGURED',
    '法定源泉税の税理士確認が完了していません',
  )
}

export function throwBadRequest(message = '不正なリクエストです', details?: unknown): never {
  throw new ApiError(400, 'BAD_REQUEST', message, details)
}

export function sendError(res: Response, err: unknown): void {
  if (err instanceof ApiError) {
    res.status(err.status).json(err.toJSON())
    return
  }
  console.error(err)
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: '内部エラーが発生しました',
  } as ErrorResponse)
}
