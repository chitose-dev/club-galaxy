/**
 * backend 側 getBackRate（本DW フォールバック）の単体テスト
 * （テストランナー非依存・スタンドアロン。routes/attendance.test.ts と同方式）。
 *
 * frontend/src/utils/backRate.ts と同じ規則であることを固定する
 * （台帳 CSV export と給与画面で単価がズレない）。
 *
 * 実行（backend ディレクトリで）:
 *   npx tsx src/lib/backRate.test.ts
 */
import { getBackRate } from './backRate'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

check('本DW 設定あり → その値', getBackRate({ '本D': 500, '本DW': 800 }, '本DW') === 800)
check('本DW 未設定 → 本D フォールバック', getBackRate({ '本D': 500 }, '本DW') === 500)
check('本DW 明示 0 → 0 を尊重', getBackRate({ '本D': 500, '本DW': 0 }, '本DW') === 0)
check('両方未設定 → 0', getBackRate({ FD: 200 }, '本DW') === 0)
check('backRates undefined → 0', getBackRate(undefined, '本DW') === 0)
check('本D は自身の値（逆流なし）', getBackRate({ '本D': 500, '本DW': 800 }, '本D') === 500)
check("本DW 以外はフォールバックなし", getBackRate({ '本D': 500 }, 'Fカク') === 0)

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
  process.exit(1)
}
console.log('\nAll backRate tests passed')
