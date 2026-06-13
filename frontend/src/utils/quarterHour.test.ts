/**
 * quarterHour（勤務時間計算・15分丸め・リアルタイム枠）の単体テスト
 * （テストランナー非依存・スタンドアロン。bottleBack.test.ts と同方式）。
 *
 * 勤怠UX改善の受け入れ条件に直結:
 *   - 20:30開始 / 24:00(=翌00:00)終了 → 3.5h
 *   - 20:00開始 / 04:00終了 の日跨ぎ → 8.0h
 * 給与に効く計算なので、日跨ぎ・休憩控除・丸めを固定する。
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/quarterHour.ts src/utils/quarterHour.test.ts \
 *     --outDir /tmp/qhtest --module commonjs --target es2020 --moduleResolution node --skipLibCheck
 *   node /tmp/qhtest/quarterHour.test.js
 */
import {
  calcWorkHours,
  roundClockInHHMM,
  roundClockOutHHMM,
  formatRealtimeWorkRange,
} from './quarterHour'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

// ── 受け入れ条件: 通常勤務 ──
check('20:30〜24:00(翌00:00) 休憩0 → 3.5h',
  calcWorkHours('20:30', '00:00', 0) === 3.5,
  String(calcWorkHours('20:30', '00:00', 0)))

check('20:00〜24:00 休憩0 → 4.0h',
  calcWorkHours('20:00', '00:00', 0) === 4.0,
  String(calcWorkHours('20:00', '00:00', 0)))

// ── 受け入れ条件: 日跨ぎ ──
check('20:00〜04:00 日跨ぎ 休憩0 → 8.0h',
  calcWorkHours('20:00', '04:00', 0) === 8.0,
  String(calcWorkHours('20:00', '04:00', 0)))

check('22:00〜02:30 日跨ぎ 休憩0 → 4.5h',
  calcWorkHours('22:00', '02:30', 0) === 4.5,
  String(calcWorkHours('22:00', '02:30', 0)))

// ── 休憩控除 ──
check('20:00〜04:00 休憩60分 → 7.0h',
  calcWorkHours('20:00', '04:00', 60) === 7.0,
  String(calcWorkHours('20:00', '04:00', 60)))

check('休憩が勤務超過でも 0h 下限（負にならない）',
  calcWorkHours('20:00', '21:00', 120) === 0,
  String(calcWorkHours('20:00', '21:00', 120)))

// ── 不正入力 ──
check('clockOut 不正 → 0h', calcWorkHours('20:00', '', 0) === 0)
check('clockIn 不正 → 0h', calcWorkHours('', '04:00', 0) === 0)

// ── 15分丸め（開始=切り上げ / 終了=切り捨て）──
check('開始 20:07 → 切り上げ 20:15', roundClockInHHMM('20:07') === '20:15')
check('開始 20:00 ちょうど → 20:00', roundClockInHHMM('20:00') === '20:00')
check('終了 23:52 → 切り捨て 23:45', roundClockOutHHMM('23:52') === '23:45')
check('終了 00:14 → 切り捨て 00:00', roundClockOutHHMM('00:14') === '00:00')

// ── リアルタイム枠（現在枠目安・確定時間ではない）──
{
  // now=20:07 → 含む枠の終端 20:15
  const now = new Date(2026, 5, 13, 20, 7)
  check('現在枠 clockIn=20:00 now=20:07 → "20:00〜20:15"',
    formatRealtimeWorkRange('20:00', now) === '20:00〜20:15',
    formatRealtimeWorkRange('20:00', now))
}
{
  // 深夜跨ぎ: clockIn=23:45 now=00:05 → "23:45〜00:15"
  const now = new Date(2026, 5, 14, 0, 5)
  check('現在枠 深夜跨ぎ clockIn=23:45 now=00:05 → "23:45〜00:15"',
    formatRealtimeWorkRange('23:45', now) === '23:45〜00:15',
    formatRealtimeWorkRange('23:45', now))
}
check('clockIn 未設定 → 空文字', formatRealtimeWorkRange(null) === '')

if (failures > 0) {
  throw new Error(`${failures} test(s) failed`)
}
console.log('\nAll quarterHour tests passed')
