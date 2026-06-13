/**
 * getBackRate（本DW フォールバック付きバック単価ヘルパー）の単体テスト
 * （テストランナー非依存・スタンドアロン。bottleBack.test.ts と同方式）。
 *
 * 本DW は給与・CSV・台帳に直結する単価なので、フォールバック規則を全分岐で固定する:
 *   - 本DW 設定あり → その値（本D とは独立）
 *   - 本DW 未設定   → 本D の値にフォールバック（0 円落ち防止）
 *   - 本DW に明示 0 → 0 を尊重（フォールバックしない）
 *   - 本DW 以外     → 従来どおり未設定 = 0（フォールバックは本DW 限定）
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/backRate.ts src/utils/backRate.test.ts src/data/mock.ts \
 *     --outDir /tmp/brtest --module commonjs --target es2020 --moduleResolution node --skipLibCheck --jsx react-jsx
 *   node /tmp/brtest/utils/backRate.test.js
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

// 本DW 設定あり → 本D と独立した値を返す
check(
  '本DW 設定あり → その値（本D と独立）',
  getBackRate({ '本D': 500, '本DW': 800 }, '本DW') === 800,
  String(getBackRate({ '本D': 500, '本DW': 800 }, '本DW')),
)

// 本DW 未設定 → 本D にフォールバック（0 円落ち防止の核心）
check(
  '本DW 未設定 → 本D の単価にフォールバック',
  getBackRate({ '本D': 500 }, '本DW') === 500,
  String(getBackRate({ '本D': 500 }, '本DW')),
)

// 本DW 明示 0 → 0 を尊重（管理画面で 0 に設定した意図を上書きしない）
check(
  '本DW 明示 0 → 0（フォールバックしない）',
  getBackRate({ '本D': 500, '本DW': 0 }, '本DW') === 0,
  String(getBackRate({ '本D': 500, '本DW': 0 }, '本DW')),
)

// 本DW も本D も未設定 → 0
check(
  '本DW・本D とも未設定 → 0',
  getBackRate({ FD: 200 }, '本DW') === 0,
)

// backRates 自体が undefined → 0
check('backRates undefined → 0', getBackRate(undefined, '本DW') === 0)

// 本D は従来どおり（本DW の値に引っ張られない）
check(
  '本D は従来どおり自身の値（本DW から逆流しない）',
  getBackRate({ '本D': 500, '本DW': 800 }, '本D') === 500,
)

// 本DW 以外の未設定種別はフォールバックなしで 0
check(
  "本DW 以外（'Fカク' 未設定）→ 0（フォールバックは本DW 限定）",
  getBackRate({ '本D': 500 }, 'Fカク') === 0,
)

if (failures > 0) {
  throw new Error(`${failures} test(s) failed`)
}
console.log('\nAll backRate tests passed')
