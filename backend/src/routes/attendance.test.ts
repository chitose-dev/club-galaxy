/**
 * `buildPatchedAttendance` の単体テスト（テストランナー非依存・スタンドアロン）。
 *
 * PATCH /api/attendance/:id のコアロジック。clockIn / clockOut / breakMinutes
 * のいずれか 1 つ以上を受け付ける partial PATCH の入力検証 + 値再計算を
 * 純関数化したので、ここで全パターンを検証する。
 *
 * 実行（backend ディレクトリで）:
 *   ../frontend/node_modules/.bin/tsc src/routes/attendance.ts \
 *     src/routes/attendance.test.ts src/lib/businessDate.ts src/lib/errors.ts \
 *     src/lib/audit.ts src/firebase.ts src/middleware/auth.ts src/types.ts \
 *     --outDir /tmp/atttest --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck
 *   node /tmp/atttest/routes/attendance.test.js
 *
 * 簡単な代替実行: vitest 等の外部 runner なしで動かすため、依存の少ない
 * `buildPatchedAttendance` を切り出してテストする方針。
 */
import {
  buildPatchedAttendance,
  calcPaidMinutes,
  validateBreakMinutes,
  validateIsoTimestamp,
} from './attendance'
import type { AttendanceRecord } from '../types'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

function expectThrow(name: string, fn: () => unknown, expectedMessage: string): void {
  try {
    fn()
    check(name, false, `expected throw with "${expectedMessage}", got no throw`)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    check(name, msg.includes(expectedMessage), `got "${msg}"`)
  }
}

const baseRecord: AttendanceRecord = {
  id: 100,
  staffId: 1,
  staffName: 'みく',
  staffType: 'cast',
  businessDate: '2026-06-04',
  clockIn: '2026-06-04T19:30:00+09:00',
  clockOut: null,
  breakMinutes: 0,
  workMinutes: 0,
  paidMinutes: 0,
  createdBy: 'tester',
  createdAt: '2026-06-04T19:30:00+09:00',
}

// ─── 1. 何も指定しない PATCH → 400 ───
expectThrow(
  '何も含まない patch → エラー',
  () => buildPatchedAttendance({}, baseRecord),
  'clockIn / clockOut / breakMinutes のいずれか',
)

// ─── 2. breakMinutes のみ patch → 成功、他フィールドは before を継承 ───
{
  const after = buildPatchedAttendance({ breakMinutes: 30 }, baseRecord)
  check(
    'breakMinutes のみ patch → break 更新、他は据置',
    after.breakMinutes === 30 &&
      after.clockIn === baseRecord.clockIn &&
      after.clockOut === baseRecord.clockOut &&
      after.businessDate === baseRecord.businessDate &&
      after.workMinutes === 0 && after.paidMinutes === 0,
    `got ${JSON.stringify(after)}`,
  )
}

// ─── 3. clockIn のみ patch → ISO 化、businessDate 再計算 ───
{
  const after = buildPatchedAttendance(
    { clockIn: '2026-06-04T19:00:00+09:00' },
    baseRecord,
  )
  check(
    'clockIn のみ patch → clockIn 更新 + businessDate 再計算',
    after.clockIn === '2026-06-04T19:00:00+09:00' &&
      after.businessDate === '2026-06-04' &&
      after.clockOut === baseRecord.clockOut,
    `got ${JSON.stringify(after)}`,
  )
}

// ─── 4. clockIn 変更で businessDate が翌日扱いになる ───
{
  // 5 時 cutoff: 02:30 JST は前日扱いになる。clockIn を翌日 02:30 で patch
  // すると businessDate = 前日の '2026-06-04' になることを確認。
  const after = buildPatchedAttendance(
    { clockIn: '2026-06-05T02:30:00+09:00' },
    baseRecord,
  )
  check(
    'clockIn=翌 02:30 → businessDate は cutoff (5 時) 前なので前日 06-04',
    after.businessDate === '2026-06-04',
    `got businessDate=${after.businessDate}`,
  )
}

// ─── 5. clockOut のみ patch → workMinutes / paidMinutes 計算 ───
{
  // clockIn 19:30 + clockOut 22:30 = 180 分、break=0 → work=180、paid=calcPaidMinutes(180)
  const after = buildPatchedAttendance(
    { clockOut: '2026-06-04T22:30:00+09:00' },
    baseRecord,
  )
  check(
    'clockOut のみ patch → workMinutes=180、paidMinutes=calcPaidMinutes(180)',
    after.workMinutes === 180 && after.paidMinutes === calcPaidMinutes(180),
    `got workMinutes=${after.workMinutes}, paidMinutes=${after.paidMinutes}`,
  )
}

// ─── 6. clockIn + clockOut 同時 patch → 新 clockIn 基準で work 計算 ───
{
  // 旧 clockIn 19:30 だが、新 clockIn 19:00 + clockOut 22:30 → 210 分
  const after = buildPatchedAttendance(
    {
      clockIn: '2026-06-04T19:00:00+09:00',
      clockOut: '2026-06-04T22:30:00+09:00',
    },
    baseRecord,
  )
  check(
    'clockIn+clockOut 同時 patch → 新 clockIn 基準で workMinutes=210',
    after.workMinutes === 210 && after.clockIn === '2026-06-04T19:00:00+09:00',
    `got workMinutes=${after.workMinutes}, clockIn=${after.clockIn}`,
  )
}

// ─── 7. 全 3 フィールド patch ───
{
  const after = buildPatchedAttendance(
    {
      clockIn: '2026-06-04T19:00:00+09:00',
      clockOut: '2026-06-04T22:30:00+09:00',
      breakMinutes: 30,
    },
    baseRecord,
  )
  check(
    '全 3 フィールド patch → work=180 (210-30), break=30 で反映',
    after.workMinutes === 180 && after.breakMinutes === 30 &&
      after.clockIn === '2026-06-04T19:00:00+09:00' &&
      after.clockOut === '2026-06-04T22:30:00+09:00',
    `got ${JSON.stringify(after)}`,
  )
}

// ─── 8. 既存 clockOut あり + breakMinutes 変更 → workMinutes 再計算 ───
{
  const recWithOut: AttendanceRecord = {
    ...baseRecord,
    clockOut: '2026-06-04T22:30:00+09:00',
    workMinutes: 180,
    paidMinutes: calcPaidMinutes(180),
  }
  const after = buildPatchedAttendance({ breakMinutes: 45 }, recWithOut)
  check(
    'clockOut 既存 + break のみ patch → 180-45=135 で workMinutes 再計算',
    after.workMinutes === 135 && after.breakMinutes === 45,
    `got workMinutes=${after.workMinutes}`,
  )
}

// ─── 9. clockOut が clockIn より前 → エラー ───
expectThrow(
  'clockOut < clockIn → エラー',
  () => buildPatchedAttendance(
    { clockOut: '2026-06-04T18:00:00+09:00' },
    baseRecord,
  ),
  'clockOut は clockIn より後',
)

// ─── 10. clockIn が malformed → エラー ───
expectThrow(
  'clockIn malformed → エラー',
  () => buildPatchedAttendance({ clockIn: 'not-an-iso' }, baseRecord),
  'clockIn が不正',
)

// ─── 11. clockOut が malformed → エラー ───
expectThrow(
  'clockOut malformed → エラー',
  () => buildPatchedAttendance({ clockOut: 'not-an-iso' }, baseRecord),
  'clockOut が不正',
)

// ─── 12. 24 時間超 shift → エラー ───
expectThrow(
  '勤務時間 24h 超 → エラー',
  () => buildPatchedAttendance(
    {
      clockIn: '2026-06-04T00:00:00+09:00',
      clockOut: '2026-06-05T01:00:00+09:00',
    },
    baseRecord,
  ),
  '勤務時間が 24 時間',
)

// ─── breakMinutes 入力検証 (validateBreakMinutes) ───
expectThrow(
  'breakMinutes: 負値 → エラー (workMinutes を不正に増やす攻撃面)',
  () => validateBreakMinutes(-30),
  '0 以上',
)
expectThrow(
  'breakMinutes: NaN → エラー',
  () => validateBreakMinutes(NaN),
  '整数',
)
expectThrow(
  'breakMinutes: Infinity → エラー',
  () => validateBreakMinutes(Infinity),
  '整数',
)
expectThrow(
  'breakMinutes: 小数 → エラー',
  () => validateBreakMinutes(30.5),
  '整数',
)
expectThrow(
  'breakMinutes: 文字列 → エラー',
  () => validateBreakMinutes('30'),
  '整数',
)
expectThrow(
  'breakMinutes: 24h 超 → エラー',
  () => validateBreakMinutes(24 * 60 + 1),
  '24 時間',
)
check(
  'breakMinutes: 0 → OK',
  validateBreakMinutes(0) === 0,
)
check(
  'breakMinutes: 30 → OK',
  validateBreakMinutes(30) === 30,
)
check(
  'breakMinutes: 24h 境界 (24*60) → OK',
  validateBreakMinutes(24 * 60) === 24 * 60,
)

// ─── PATCH 経路で breakMinutes 統合検証 ───
expectThrow(
  'PATCH: breakMinutes 負値 → エラー (旧仕様で workMinutes が増えていた)',
  () => buildPatchedAttendance({ breakMinutes: -30 }, baseRecord),
  '0 以上',
)
expectThrow(
  'PATCH: breakMinutes が diffMin 超 → エラー',
  () => {
    const recWithOut: AttendanceRecord = {
      ...baseRecord,
      clockOut: '2026-06-04T22:30:00+09:00',
      workMinutes: 180,
      paidMinutes: calcPaidMinutes(180),
    }
    return buildPatchedAttendance({ breakMinutes: 200 }, recWithOut)
  },
  '勤務時間',
)
check(
  'PATCH: breakMinutes = diffMin ちょうど → workMinutes=0',
  (() => {
    const recWithOut: AttendanceRecord = {
      ...baseRecord,
      clockOut: '2026-06-04T22:30:00+09:00',
      workMinutes: 180,
      paidMinutes: calcPaidMinutes(180),
    }
    const after = buildPatchedAttendance({ breakMinutes: 180 }, recWithOut)
    return after.workMinutes === 0 && after.breakMinutes === 180
  })(),
)

// ─── validateIsoTimestamp (POST 入口の clockIn / scheduledClockIn 検証) ───
check(
  'validateIsoTimestamp: 完全な ISO 8601 (JST tz) → OK',
  validateIsoTimestamp('2026-06-04T19:30:00+09:00', 'clockIn') === '2026-06-04T19:30:00+09:00',
)
check(
  'validateIsoTimestamp: UTC Z 付き ISO → OK',
  validateIsoTimestamp('2026-06-04T10:30:00Z', 'clockIn') === '2026-06-04T10:30:00Z',
)
expectThrow(
  'validateIsoTimestamp: HH:MM 文字列 → エラー (旧仕様で NaN-NaN-NaN 保存される入口バグ)',
  () => validateIsoTimestamp('21:30', 'clockIn'),
  '不正',
)
expectThrow(
  'validateIsoTimestamp: 空文字 → エラー',
  () => validateIsoTimestamp('', 'clockIn'),
  '不正',
)
expectThrow(
  'validateIsoTimestamp: garbage 文字列 → エラー',
  () => validateIsoTimestamp('not-a-date', 'clockIn'),
  '不正',
)
expectThrow(
  'validateIsoTimestamp: 数値 → エラー (typeof !== string)',
  () => validateIsoTimestamp(1717490000000, 'clockIn'),
  '文字列',
)
expectThrow(
  'validateIsoTimestamp: null → エラー',
  () => validateIsoTimestamp(null, 'clockIn'),
  '文字列',
)
// label がメッセージに含まれる
expectThrow(
  'validateIsoTimestamp: エラーメッセージに label が含まれる',
  () => validateIsoTimestamp('21:30', 'scheduledClockIn'),
  'scheduledClockIn',
)

// ─── PATCH 経路の ISO 検証統合 (validateIsoTimestamp を内部で呼ぶ) ───
expectThrow(
  'PATCH: clockIn が HH:MM → エラー (validateIsoTimestamp 経由)',
  () => buildPatchedAttendance({ clockIn: '21:30' }, baseRecord),
  '不正',
)
expectThrow(
  'PATCH: clockOut が HH:MM → エラー',
  () => buildPatchedAttendance({ clockOut: '03:30' }, baseRecord),
  '不正',
)

// ─── clockOut=null で「勤務中に戻す」: clockOut クリア + work/paid 0 ───
{
  // 終了確定済みレコードから clockOut=null を patch → 勤務中に戻る。
  const finalized: AttendanceRecord = {
    ...baseRecord,
    clockOut: '2026-06-04T23:30:00+09:00',
    workMinutes: 240, paidMinutes: 240,
  }
  const after = buildPatchedAttendance({ clockOut: null }, finalized)
  check(
    'clockOut=null patch → clockOut クリア + workMinutes/paidMinutes 0',
    after.clockOut === null && after.workMinutes === 0 && after.paidMinutes === 0 &&
      after.clockIn === finalized.clockIn,
    `got ${JSON.stringify(after)}`,
  )
}
{
  // clockOut=null は「キー無し(=据置)」ではなく更新扱い。breakMinutes 単独 patch と
  // 違い、clockOut=null 単独でも 400 にならない。
  let threw = false
  try {
    buildPatchedAttendance({ clockOut: null }, baseRecord)
  } catch {
    threw = true
  }
  check('clockOut=null 単独 patch は 400 にならない（更新扱い）', !threw)
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
  process.exit(1)
} else {
  console.log('\nAll buildPatchedAttendance tests passed')
}
