import crypto from 'crypto'
import type { Transaction } from 'firebase-admin/firestore'
import { db, STORE_ID } from '../firebase'
import { nowJstIso, todayBusinessDate } from './businessDate'

export type AuditAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILED' | 'LOGOUT' | 'PIN_LOCKED'
  | 'BILLING_CREATE' | 'BILLING_VOID' | 'BILLING_REISSUE' | 'BILLING_DISCOUNT'
  | 'BILLING_MERGE' | 'BILLING_SPLIT'
  | 'PAYROLL_FINALIZE' | 'LEGAL_WITHHOLDING_CONFIRMED'
  | 'ARCHIVE_SET' | 'ARCHIVE_UNSET'
  | 'USER_CREATE' | 'USER_UPDATE' | 'USER_DELETE'
  | 'SETTINGS_UPDATE' | 'PIN_CHANGE'
  | 'CHAMPAGNE_REDISTRIBUTE' | 'EXTENSION_CANCEL'
  | 'CASH_DRAWER_OPEN' | 'CASH_DRAWER_CLOSE'
  | 'OTHER'

export interface AuditLogEntry {
  id: string
  storeId: string
  action: AuditAction
  performedBy: string
  performedAt: string
  businessDate: string
  targetType?: string
  targetId?: string
  payload?: unknown
}

export function buildEntry(input: {
  action: AuditAction
  performedBy: string
  targetType?: string
  targetId?: string
  payload?: unknown
  storeId?: string
  businessDate?: string
  cutoffHour?: number
}): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    storeId: input.storeId ?? STORE_ID,
    action: input.action,
    performedBy: input.performedBy,
    performedAt: nowJstIso(),
    businessDate: input.businessDate ?? todayBusinessDate(input.cutoffHour),
    ...(input.targetType ? { targetType: input.targetType } : {}),
    ...(input.targetId ? { targetId: input.targetId } : {}),
    ...(input.payload !== undefined ? { payload: input.payload } : {}),
  }
}

function logRef(storeId: string, id: string) {
  return db.collection('stores').doc(storeId).collection('auditLogs').doc(id)
}

export async function append(entry: AuditLogEntry): Promise<void> {
  await logRef(entry.storeId, entry.id).set(entry)
}

export function appendInTx(tx: Transaction, entry: AuditLogEntry): void {
  tx.set(logRef(entry.storeId, entry.id), entry)
}
