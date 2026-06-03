/**
 * calcBottleBackPerOrder の単体テスト（テストランナー非依存・スタンドアロン実行）。
 *
 * ボトル系商品のキャストバック計算は給与・売上に直結するため、優先順位
 *   (1) 商品個別バック金額 → (2) キャスト給与設定率 → (3) なし
 * と、特に 0 と null/undefined の区別を全パターンでカバーする。
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/bottleBack.ts src/utils/bottleBack.test.ts \
 *     --outDir /tmp/bbtest --module commonjs --target es2020 --moduleResolution node --skipLibCheck
 *   node /tmp/bbtest/bottleBack.test.js
 */
import { calcBottleBackPerOrder } from './bottleBack'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

// ─── 優先順位 1: 商品個別バック金額（productBackPerUnit が設定済み） ───

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 3000,
    castBottleRatePercent: 25,
    basePerUnit: 23000,
    quantity: 1,
  })
  check('product 正数 → 商品単価バック × 本数', r.amount === 3000 && r.source === 'product',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 3000,
    castBottleRatePercent: 25,
    basePerUnit: 23000,
    quantity: 3,
  })
  check('product 正数 + 3 本 → 単価 × 3', r.amount === 9000 && r.source === 'product',
    `got ${JSON.stringify(r)}`)
}

// 中核要件: 0 を「未設定」に潰してはいけない
{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 0,
    castBottleRatePercent: 25,
    basePerUnit: 23000,
    quantity: 1,
  })
  check('product=0 → 明示的バックなし（フォールバックしない）', r.amount === 0 && r.source === 'product',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 0,
    castBottleRatePercent: null,
    basePerUnit: 23000,
    quantity: 1,
  })
  check('product=0 + キャスト率も未設定 → 0', r.amount === 0 && r.source === 'product',
    `got ${JSON.stringify(r)}`)
}

// ─── 優先順位 2: キャスト給与設定のボトルバック率（productBack=null/undefined） ───

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: null,
    castBottleRatePercent: 25,
    basePerUnit: 20000,
    quantity: 1,
  })
  check('null + rate=25% → basePerUnit × 25%', r.amount === 5000 && r.source === 'rate',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: undefined,
    castBottleRatePercent: 25,
    basePerUnit: 20000,
    quantity: 1,
  })
  check('undefined + rate=25% → 同じく rate 経路', r.amount === 5000 && r.source === 'rate',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: null,
    castBottleRatePercent: 10,
    basePerUnit: 28000,
    quantity: 2,
  })
  check('null + rate=10% + 2 本 → base × 10% × 2', r.amount === 5600 && r.source === 'rate',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: null,
    castBottleRatePercent: 7,
    basePerUnit: 23000,
    quantity: 1,
  })
  // 23000 * 7 / 100 = 1610.0 → 1610
  check('rate 端数 → floor で整数化', r.amount === 1610 && r.source === 'rate',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: null,
    castBottleRatePercent: 0,
    basePerUnit: 20000,
    quantity: 1,
  })
  check('rate=0% → バックなし（source=none）', r.amount === 0 && r.source === 'none',
    `got ${JSON.stringify(r)}`)
}

// ─── 優先順位 3: どちらもなければバックなし ───

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: null,
    castBottleRatePercent: null,
    basePerUnit: 20000,
    quantity: 1,
  })
  check('product=null + rate=null → 0', r.amount === 0 && r.source === 'none',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: undefined,
    castBottleRatePercent: undefined,
    basePerUnit: 20000,
    quantity: 1,
  })
  check('product=undefined + rate=undefined → 0', r.amount === 0 && r.source === 'none',
    `got ${JSON.stringify(r)}`)
}

// ─── エッジケース ───

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 3000,
    castBottleRatePercent: 25,
    basePerUnit: 20000,
    quantity: 0,
  })
  check('quantity=0 → 0（source=none）', r.amount === 0 && r.source === 'none',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 3000,
    castBottleRatePercent: 25,
    basePerUnit: 20000,
    quantity: -1,
  })
  check('quantity=負値 → 0 扱い', r.amount === 0 && r.source === 'none',
    `got ${JSON.stringify(r)}`)
}

{
  const r = calcBottleBackPerOrder({
    productBackPerUnit: 3000,
    castBottleRatePercent: 25,
    basePerUnit: 20000,
    quantity: 2.9,
  })
  // floor(2.9) = 2 → 3000 * 2 = 6000
  check('quantity 小数 → floor', r.amount === 6000 && r.source === 'product',
    `got ${JSON.stringify(r)}`)
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
} else {
  console.log('\nAll bottleBack tests passed')
}
