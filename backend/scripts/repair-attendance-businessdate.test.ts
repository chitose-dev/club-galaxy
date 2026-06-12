/**
 * repair-attendance-businessdate.ts の planRepair 単体テスト
 * （テストランナー非依存・スタンドアロン。src/routes/attendance.test.ts と同方式）。
 *
 * 修復判断の全分岐を検証する:
 *   - ISO clockIn → businessDate 再計算（5時カットオフ・タイムゾーン変換込み）
 *   - HH:MM / 不正文字列 / 非文字列 → 要手動修正
 *   - businessDate 健全 → skip（冪等性）
 *
 * 実行（backend ディレクトリで）:
 *   npx tsx scripts/repair-attendance-businessdate.test.ts
 */
import {
  CORRUPT_BUSINESS_DATE,
  businessDateHintFromId,
  planRepair,
} from './repair-attendance-businessdate'

let failures = 0

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures++
  }
}

function corrupt(clockIn: unknown) {
  return { businessDate: CORRUPT_BUSINESS_DATE, clockIn: clockIn as string }
}

// ── ISO clockIn → repair（businessDate 再計算） ──────────────────

{
  const plan = planRepair(corrupt('2026-04-12T21:30:00+09:00'))
  check(
    'ISO(+09:00 夜) → repair で当日の businessDate',
    plan.kind === 'repair' && plan.newBusinessDate === '2026-04-12',
    JSON.stringify(plan),
  )
}

{
  // 翌日 2:00 (JST) は 5 時カットオフ前 → 前日の営業日に帰属
  const plan = planRepair(corrupt('2026-04-13T02:00:00+09:00'))
  check(
    'ISO(+09:00 深夜2時) → 前営業日に帰属',
    plan.kind === 'repair' && plan.newBusinessDate === '2026-04-12',
    JSON.stringify(plan),
  )
}

{
  // カットオフ境界: 04:59 は前日 / 05:00 は当日
  const before = planRepair(corrupt('2026-04-13T04:59:59+09:00'))
  const after = planRepair(corrupt('2026-04-13T05:00:00+09:00'))
  check(
    'カットオフ境界 04:59→前日 / 05:00→当日',
    before.kind === 'repair' && before.newBusinessDate === '2026-04-12' &&
    after.kind === 'repair' && after.newBusinessDate === '2026-04-13',
    JSON.stringify({ before, after }),
  )
}

{
  // UTC 表記でも JST に直して営業日を出す（15:00Z = JST 翌 0:00 → 前営業日）
  const plan = planRepair(corrupt('2026-04-12T15:00:00Z'))
  check(
    'ISO(Z/UTC) → JST 換算で businessDate 算出',
    plan.kind === 'repair' && plan.newBusinessDate === '2026-04-12',
    JSON.stringify(plan),
  )
}

// ── 復元不能 → manual（データは触らない） ───────────────────────

{
  const plan = planRepair(corrupt('21:30'))
  check(
    'HH:MM のみ → 要手動修正（自動更新しない）',
    plan.kind === 'manual' && plan.reason.includes('21:30'),
    JSON.stringify(plan),
  )
}

{
  const plan = planRepair(corrupt('そのうち'))
  check('日付に解釈できない文字列 → 要手動修正', plan.kind === 'manual', JSON.stringify(plan))
}

{
  const plan = planRepair(corrupt(undefined))
  check('clockIn 欠落（undefined） → 要手動修正', plan.kind === 'manual', JSON.stringify(plan))
}

{
  const plan = planRepair(corrupt(null))
  check('clockIn null → 要手動修正', plan.kind === 'manual', JSON.stringify(plan))
}

// ── 冪等性: 健全レコードは絶対に触らない ────────────────────────

{
  const plan = planRepair({ businessDate: '2026-04-12', clockIn: '2026-04-12T21:30:00+09:00' })
  check('businessDate 健全 → skip（二重実行に安全）', plan.kind === 'skip', JSON.stringify(plan))
}

{
  // 破損値の別表記（前後空白等）は対象外 = 「NaN-NaN-NaN」完全一致のみ修復対象
  const plan = planRepair({ businessDate: ' NaN-NaN-NaN', clockIn: '2026-04-12T21:30:00+09:00' })
  check('完全一致しない businessDate → skip（対象を広げない）', plan.kind === 'skip', JSON.stringify(plan))
}

// ── businessDateHintFromId（手動修正の参考情報・自動修復には不使用） ──

{
  // 2026-05-07T18:11:56.892+09:00 ≒ epoch 1778151116892 → 営業日 2026-05-07
  const hint = businessDateHintFromId(1778151116892)
  check('id(epoch ms) → 推定businessDate', hint === '2026-05-07', String(hint))
}

{
  // JST 深夜（5時カットオフ前）は前営業日に推定される
  // 2026-05-08T02:00:00+09:00 = epoch 1778180400000 → 営業日 2026-05-07
  const hint = businessDateHintFromId(1778180400000)
  check('id が深夜帯 → 前営業日に推定', hint === '2026-05-07', String(hint))
}

{
  check(
    'epoch として不正な id → null（範囲外/非数値）',
    businessDateHintFromId(123) === null &&
    businessDateHintFromId(Number.NaN) === null &&
    businessDateHintFromId('1778151116892' as unknown) === null,
  )
}

if (failures > 0) {
  console.log(`\n${failures} test(s) failed`)
  process.exit(1)
}
console.log('\nAll repair-attendance-businessdate tests passed')
