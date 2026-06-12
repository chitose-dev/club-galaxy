/**
 * ワンショット: 勤怠レコードの businessDate "NaN-NaN-NaN" 破損を修復する。
 *
 * 背景:
 *   旧 POST /api/attendance が `clockIn: "21:30"` のような HH:MM 文字列を
 *   受理していたため、`getBusinessDate(clockIn)` が Invalid Date 経由で
 *   businessDate に "NaN-NaN-NaN" を保存していた。businessDate は保存値を
 *   Firestore の where で引くため、破損レコードは日付絞り込みの全画面から
 *   不可視になり給与集計から漏れる。入口側の検証
 *   (routes/attendance.ts validateIsoTimestamp) で新規発生は止まっているが、
 *   既存の破損レコードはこのスクリプトで棚卸し・修復する。
 *
 * 実行方法（必ず --dry-run で棚卸し → 内容確認後に --apply）:
 *   cd backend
 *   npx tsx scripts/repair-attendance-businessdate.ts --dry-run
 *   FIREBASE_SERVICE_ACCOUNT=... npx tsx scripts/repair-attendance-businessdate.ts --apply
 *   （npm run script:repair-attendance-businessdate でも dry-run 実行可）
 *
 * 認証:
 *   - FIREBASE_SERVICE_ACCOUNT 環境変数 (JSON 文字列) があればそれを使用
 *   - なければ ADC (`gcloud auth application-default login`) を使用
 *
 * 動作:
 *   - businessDate === "NaN-NaN-NaN" の勤怠レコードだけを対象に列挙する
 *   - clockIn が厳密な ISO 8601（API と同じ validateIsoTimestamp）なら
 *     getBusinessDate(clockIn) で businessDate を再計算して更新
 *   - clockIn が "HH:MM" のみ等で日付復元不能なものは自動更新せず、
 *     「要手動修正」として一覧出力するだけ（データは触らない）
 *   - 更新時は updatedAt / updatedBy を刻み、auditLogs にも before/after を
 *     含むエントリを残す
 *   - 冪等: 対象クエリは破損レコードしか拾わず、修復済みレコードは二度と
 *     マッチしない。レコード単位でも businessDate を再確認してから更新する
 */
import { storeCollection } from '../src/firebase'
import { getBusinessDate, nowJstIso } from '../src/lib/businessDate'
import { append, buildEntry } from '../src/lib/audit'
import { validateIsoTimestamp } from '../src/routes/attendance'
import type { AttendanceRecord } from '../src/types'

export const CORRUPT_BUSINESS_DATE = 'NaN-NaN-NaN'
const PERFORMER = 'repair-attendance-businessdate-2026-06-12'

export type RepairPlan =
  | { kind: 'repair'; newBusinessDate: string }
  | { kind: 'manual'; reason: string }
  | { kind: 'skip'; reason: string }

/**
 * 1 レコードに対する修復判断の純関数（Firestore 非依存・テストはここを呼ぶ）。
 *
 * - businessDate が破損値でなければ skip（冪等性: 二重実行・並行修正に安全）
 * - clockIn が API と同じ厳密 ISO 検証を通る場合のみ再計算（修復後のレコードが
 *   現行 API の検証も必ず通る状態になることを保証する）
 * - 再計算結果に NaN が残る場合は防御的に manual へ倒す（自動では触らない）
 */
export function planRepair(
  record: Pick<AttendanceRecord, 'businessDate' | 'clockIn'>,
): RepairPlan {
  if (record.businessDate !== CORRUPT_BUSINESS_DATE) {
    return { kind: 'skip', reason: `businessDate は破損していません (${record.businessDate})` }
  }
  try {
    validateIsoTimestamp(record.clockIn, 'clockIn')
  } catch (e) {
    const raw = typeof record.clockIn === 'string' ? `"${record.clockIn}"` : String(record.clockIn)
    return {
      kind: 'manual',
      reason: `clockIn ${raw} から日付を復元できません（${(e as Error).message}）`,
    }
  }
  const newBusinessDate = getBusinessDate(record.clockIn)
  if (newBusinessDate.includes('NaN')) {
    return { kind: 'manual', reason: `再計算結果が不正です (${newBusinessDate})` }
  }
  return { kind: 'repair', newBusinessDate }
}

/**
 * 要手動修正レコード向けの参考情報（自動修復には使わない）。
 *
 * 勤怠レコードの id は作成時の epoch ms。破損レコードは打刻時に作成されている
 * ため、id から「打刻が行われた瞬間の営業日」を推定できる。clockIn "HH:MM"
 * 当時の営業日と一致する可能性が高いが、後日入力・代理入力の可能性を排除
 * できないので、dry-run の一覧に手掛かりとして出すだけに留める。
 * epoch ms として妥当な範囲（2020〜2100年）以外は null。
 */
export function businessDateHintFromId(id: unknown): string | null {
  if (typeof id !== 'number' || !Number.isFinite(id)) return null
  if (id < 1577836800000 || id > 4102444800000) return null
  const hint = getBusinessDate(new Date(id))
  return hint.includes('NaN') ? null : hint
}

async function main() {
  const args = new Set(process.argv.slice(2))
  const apply = args.has('--apply')
  const dryRun = args.has('--dry-run') || !apply

  console.log(`[repair-businessdate] mode=${dryRun ? 'DRY-RUN' : 'APPLY'}`)
  console.log(`[repair-businessdate] target: businessDate === "${CORRUPT_BUSINESS_DATE}"`)
  console.log(`[repair-businessdate] performer=${PERFORMER}`)

  const col = storeCollection('attendanceRecords')
  const snap = await col.where('businessDate', '==', CORRUPT_BUSINESS_DATE).get()
  console.log(`[repair-businessdate] 破損レコード: ${snap.size} 件`)

  let repaired = 0
  let skipped = 0
  const manual: string[] = []

  for (const doc of snap.docs) {
    const data = doc.data() as AttendanceRecord
    const label =
      `doc=${doc.id} id=${data.id} staffId=${data.staffId} ` +
      `staffName=${data.staffName} clockIn=${JSON.stringify(data.clockIn)} ` +
      `clockOut=${JSON.stringify(data.clockOut)}`
    const plan = planRepair(data)

    if (plan.kind === 'skip') {
      // クエリ後に他経路で直っていた等。冪等性の防御枝。
      console.log(`  - ${label}: SKIP (${plan.reason})`)
      skipped++
      continue
    }
    if (plan.kind === 'manual') {
      const hint = businessDateHintFromId(data.id)
      const hintLabel = `推定businessDate(参考: 作成時刻=id由来)=${hint ?? '不明'}`
      console.log(`  - ${label}: 要手動修正 (${plan.reason}) ${hintLabel}`)
      manual.push(`${label} 理由=${plan.reason} ${hintLabel}`)
      continue
    }

    console.log(
      `  - ${label}: businessDate "${CORRUPT_BUSINESS_DATE}" → "${plan.newBusinessDate}"` +
      `${dryRun ? ' (DRY-RUN)' : ''}`,
    )
    if (apply) {
      const now = nowJstIso()
      await doc.ref.update({
        businessDate: plan.newBusinessDate,
        updatedAt: now,
        updatedBy: PERFORMER,
      })
      await append(
        buildEntry({
          action: 'update',
          performedBy: PERFORMER,
          targetType: 'attendanceRecord',
          targetId: String(data.id),
          payload: {
            script: 'repair-attendance-businessdate',
            field: 'businessDate',
            before: CORRUPT_BUSINESS_DATE,
            after: plan.newBusinessDate,
            clockIn: data.clockIn,
          },
        }),
      )
    }
    repaired++
  }

  console.log(
    `[repair-businessdate] summary: ${apply ? 'repaired' : 'will-repair'}=${repaired} ` +
    `manual=${manual.length} skipped=${skipped} total=${snap.size}`,
  )
  if (manual.length > 0) {
    console.log('[repair-businessdate] ── 要手動修正一覧（日付復元不能・データは未変更）──')
    for (const line of manual) console.log(`  * ${line}`)
    console.log(
      '[repair-businessdate] 上記は clockIn に日付情報が無く自動修復できません。' +
      '本人/店舗に出勤日を確認のうえ、管理画面の勤怠編集（PATCH）で修正してください。',
    )
  }
  if (dryRun) {
    console.log('[repair-businessdate] DRY-RUN — 内容確認後、--apply で実際に更新してください。')
  }
}

// テストから planRepair を import できるよう、本体を直接実行した時だけ main を走らせる。
if (process.argv[1]?.endsWith('repair-attendance-businessdate.ts')) {
  main().catch((e) => {
    console.error('[repair-businessdate] FAILED:', e)
    process.exit(1)
  })
}
