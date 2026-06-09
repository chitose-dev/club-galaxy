/**
 * ボーイ (staff role) はキャストと違って Cast マスタ ID を持たない。
 * 給与計算ストア (deductions / dailyPayRequests / attendanceRecords) を
 * キャストと同じスキーマで再利用するため、username から **安定した負数 ID** を
 * ハッシュ生成する。
 *
 * 安定 = 同じ username で何度呼んでも同じ ID を返す（Date.now() 等の不安定な値は使わない）。
 * 負数 = Cast.id（正数）と衝突しないことを保証するため。
 *
 * `SalaryPage.tsx` の `boyStaffId` と同一実装。AttendanceManager 等で再利用する。
 */
export function boyStaffId(username: string): number {
  let hash = 0
  for (let i = 0; i < username.length; i++) {
    hash = ((hash << 5) - hash + username.charCodeAt(i)) | 0
  }
  return -Math.abs(hash || 1)
}
