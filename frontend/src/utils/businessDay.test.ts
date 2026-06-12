/**
 * getBusinessDay / getTodayBusinessDay の単体テスト
 * （テストランナー非依存・スタンドアロン実行。bottleBack.test.ts と同方式）。
 *
 * 営業日境界は朝 5:00 既定（backend BUSINESS_DAY_CUTOFF_HOUR_DEFAULT=5 と一致）。
 * 旧既定 6 のままだと 05:00〜05:59 の打刻・日払い・経費が前営業日に割れて
 * frontend/backend で集計が食い違うため、境界 3 点（04:30 / 05:30 / 06:30）と
 * 真の境界値（04:59 / 05:00）を固定で検証する。
 *
 * getBusinessDay は端末ローカル時刻 (getHours) 基準なので、テストも
 * ローカル時刻コンストラクタ new Date(y, m, d, h, min) で組む（TZ 非依存）。
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/businessDay.ts src/utils/businessDay.test.ts \
 *     --outDir /tmp/bdtest --module commonjs --target es2020 --moduleResolution node --skipLibCheck
 *   node /tmp/bdtest/businessDay.test.js
 */
import {
  BUSINESS_DAY_BOUNDARY_HOUR_DEFAULT,
  getBusinessDay,
  getTodayBusinessDay,
} from './businessDay'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

// ─── 既定境界が 5 時であること（backend と一致） ───

check(
  '既定境界 = 5 時（backend BUSINESS_DAY_CUTOFF_HOUR_DEFAULT と一致）',
  BUSINESS_DAY_BOUNDARY_HOUR_DEFAULT === 5,
  String(BUSINESS_DAY_BOUNDARY_HOUR_DEFAULT),
)

// ─── 指定 3 ケース: 04:30 / 05:30 / 06:30（既定 = 5 時境界） ───

{
  const got = getBusinessDay(new Date(2026, 5, 12, 4, 30)) // 6/12 04:30
  check('04:30 → 前営業日 (2026-06-11)', got === '2026-06-11', got)
}

{
  const got = getBusinessDay(new Date(2026, 5, 12, 5, 30)) // 6/12 05:30
  check(
    '05:30 → 当日 (2026-06-12)（旧既定 6 だと前日に割れていた回帰ポイント）',
    got === '2026-06-12',
    got,
  )
}

{
  const got = getBusinessDay(new Date(2026, 5, 12, 6, 30)) // 6/12 06:30
  check('06:30 → 当日 (2026-06-12)', got === '2026-06-12', got)
}

// ─── 真の境界値: 04:59 は前日 / 05:00 ちょうどは当日 ───

{
  const before = getBusinessDay(new Date(2026, 5, 12, 4, 59))
  const at = getBusinessDay(new Date(2026, 5, 12, 5, 0))
  check(
    '境界値 04:59 → 前日 / 05:00 → 当日',
    before === '2026-06-11' && at === '2026-06-12',
    JSON.stringify({ before, at }),
  )
}

// ─── 月初・年始の繰り下がり ───

{
  const got = getBusinessDay(new Date(2026, 6, 1, 2, 0)) // 7/1 02:00
  check('月初 02:00 → 前月末日 (2026-06-30)', got === '2026-06-30', got)
}

{
  const got = getBusinessDay(new Date(2027, 0, 1, 3, 0)) // 2027-01-01 03:00
  check('年始 03:00 → 前年末日 (2026-12-31)', got === '2026-12-31', got)
}

// ─── boundaryHour 明示指定の上書きは維持 ───

{
  const got = getBusinessDay(new Date(2026, 5, 12, 5, 30), 6)
  check('明示 boundaryHour=6 指定時は 05:30 → 前日（上書き可能なまま）', got === '2026-06-11', got)
}

// ─── getTodayBusinessDay が既定 5 時境界の getBusinessDay(now) と一致 ───

{
  // 実行瞬間の二重取得で日付が変わる稀ケースだけ再試行する
  let ok = false
  for (let i = 0; i < 3 && !ok; i++) {
    ok = getTodayBusinessDay() === getBusinessDay(new Date())
  }
  check('getTodayBusinessDay() = getBusinessDay(now, 既定5)', ok)
}

if (failures > 0) {
  // frontend tsconfig は DOM 型のみで process が無いため、非 0 終了は throw で表現
  // （node 実行では unhandled throw = exit 1。既存 *.test.ts と同じ流儀）。
  throw new Error(`${failures} test(s) failed`)
}
console.log('\nAll businessDay tests passed')
