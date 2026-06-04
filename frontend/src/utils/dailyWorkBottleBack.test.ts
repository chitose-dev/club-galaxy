/**
 * computeDailyWork のボトルバック計算経路（PR #117 後の追加修正）テスト。
 *
 * 帰属モデル 4 段階を確認:
 *   1. order.castName 設定 → そのキャストに直接帰属（純関数の priority 計算）
 *   2. castName 空 + 本指名あり → 本指名 split
 *   3. castName 空 + 本指名なし + 担当あり → 担当 split（今回追加）
 *   4. どこにも該当しない → 0
 *
 * テストランナー非依存・スタンドアロン実行（既存 calcVisitBreakdown.test.ts と同じ流儀）:
 *   node_modules/.bin/tsc src/utils/dailyWorkBottleBack.test.ts \
 *     src/utils/dailyWork.ts src/utils/bottleBack.ts src/utils/champagneSplit.ts \
 *     --outDir /tmp/dwbb --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck
 *   node /tmp/dwbb/utils/dailyWorkBottleBack.test.js
 */
import { computeDailyWork } from './dailyWork'
import type { BillingRecord } from '../data/mock'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

// レコード組み立てヘルパ。computeDailyWork が触る最低限のフィールドだけ持つ
// BillingRecord を作って Partial<BillingRecord> as BillingRecord でキャスト。
function makeBilling(opts: {
  id: string
  date: string
  castNamesSnapshot: string[]
  mainNoms: string[]
  orders: {
    name: string
    subcategory: string
    price: number
    quantity: number
    castName?: string
    bottleBackPerUnit?: number | null
  }[]
  salesAttribution?: Record<string, number>
}): BillingRecord {
  return {
    id: opts.id,
    storeId: 's1',
    receiptNumber: 1,
    tableNumber: 'A1',
    subtotalBeforeTax: 0,
    serviceChargeAmount: 0,
    consumptionTaxAmount: 0,
    total: 0,
    setFee: 0,
    drinkSubtotal: 0,
    tableDiscountAmount: 0,
    specialDiscountAmount: 0,
    paymentMethod: 'cash',
    completedAt: opts.date + 'T20:00:00+09:00',
    businessDate: opts.date,
    date: opts.date,
    nominatedCastIds: [],
    castSnapshot: [],
    receiptIssued: true,
    castNamesSnapshot: opts.castNamesSnapshot,
    salesAttributionByCast: opts.salesAttribution ?? {},
    receiptSnapshot: {
      receiptNumber: 1,
      receiptName: '',
      receiptPurpose: '',
      subtotal: 0,
      setFee: 0,
      tax: 0,
      consumptionTax: 0,
      discount: 0,
      orders: opts.orders.map((o, i) => ({
        menuItem: {
          id: 1000 + i,
          name: o.name,
          price: o.price,
          subcategory: o.subcategory,
          ...(o.bottleBackPerUnit !== undefined ? { bottleBackPerUnit: o.bottleBackPerUnit } : {}),
        },
        quantity: o.quantity,
        ...(o.castName ? { castName: o.castName } : {}),
      })),
      startTime: opts.date + 'T19:00:00+09:00',
      nominationLabel: '',
      completedAt: opts.date + ' 20:00',
      mainNominationCastNamesSnapshot: opts.mainNoms,
    },
    extensionHistorySnapshot: [],
  } as unknown as BillingRecord
}

// ─── ふうや報告バグ再現: 担当 みく 1 名 / シャンパン 25,000 / 本指名なし ───
{
  const billing = makeBilling({
    id: 'b1',
    date: '2026-06-04',
    castNamesSnapshot: ['みく'],
    mainNoms: [],
    orders: [
      { name: 'モエ・エ・シャンドン 白', subcategory: 'champagne', price: 25000, quantity: 1 },
    ],
  })
  const dw = computeDailyWork(
    /*castId*/ 1, 'みく', [], [billing], /*shimeiRate*/ 0,
    { 'みく': 25 }, // ボトルバック 25%
  )
  const day = dw.find((d) => d.date === '2026-06-04')
  check(
    '担当 1 名 + 本指名なし + シャンパン → 担当に率フォールバックで帰属（¥6,250）',
    day?.bottleBackAmount === 6250,
    `got ${JSON.stringify(day)}`,
  )
}

// ─── 担当 2 名 + 本指名なし → 均等按分（各々の率を適用） ───
{
  const billing = makeBilling({
    id: 'b2',
    date: '2026-06-04',
    castNamesSnapshot: ['みく', 'あいり'],
    mainNoms: [],
    orders: [
      { name: 'モエ', subcategory: 'champagne', price: 20000, quantity: 1 },
    ],
  })
  // 20000 / 2 = 10000 ベース、みく 25% → 2500、あいり 30% → 3000
  const dwMiku = computeDailyWork(1, 'みく', [], [billing], 0, { 'みく': 25, 'あいり': 30 })
  const dwAiri = computeDailyWork(2, 'あいり', [], [billing], 0, { 'みく': 25, 'あいり': 30 })
  check(
    '担当 2 名 split: みく 10000 × 25% = 2500',
    dwMiku.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 2500,
    `got ${JSON.stringify(dwMiku.find((d) => d.date === '2026-06-04'))}`,
  )
  check(
    '担当 2 名 split: あいり 10000 × 30% = 3000',
    dwAiri.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 3000,
    `got ${JSON.stringify(dwAiri.find((d) => d.date === '2026-06-04'))}`,
  )
}

// ─── castName 明示時: 担当 fallback は適用しない、純関数の priority のみ ───
{
  const billing = makeBilling({
    id: 'b3',
    date: '2026-06-04',
    castNamesSnapshot: ['みく', 'あいり'],
    mainNoms: [],
    orders: [
      // モエがあいりに明示帰属、productBackPerUnit=3000
      {
        name: 'モエ', subcategory: 'champagne', price: 20000, quantity: 1,
        castName: 'あいり', bottleBackPerUnit: 3000,
      },
    ],
  })
  const dwAiri = computeDailyWork(2, 'あいり', [], [billing], 0, { 'みく': 25, 'あいり': 30 })
  const dwMiku = computeDailyWork(1, 'みく', [], [billing], 0, { 'みく': 25, 'あいり': 30 })
  check(
    'castName=あいり 明示 + productBackPerUnit=3000 → あいり 3000（率より優先）',
    dwAiri.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 3000,
    `got ${JSON.stringify(dwAiri.find((d) => d.date === '2026-06-04'))}`,
  )
  check(
    'castName=あいり 明示時、みくは担当でも 0（明示帰属が排他）',
    dwMiku.find((d) => d.date === '2026-06-04')?.bottleBackAmount === undefined ||
      dwMiku.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 0,
    `got ${JSON.stringify(dwMiku.find((d) => d.date === '2026-06-04'))}`,
  )
}

// ─── 本指名あり: legacy 本指名 split を維持（regression check） ───
{
  const billing = makeBilling({
    id: 'b4',
    date: '2026-06-04',
    castNamesSnapshot: ['みく', 'あいり'],
    mainNoms: ['みく'],
    orders: [
      { name: 'モエ', subcategory: 'champagne', price: 20000, quantity: 1 },
    ],
  })
  // 本指名 みく 1 名 → 20000 × 25% = 5000
  const dwMiku = computeDailyWork(1, 'みく', [], [billing], 0, { 'みく': 25, 'あいり': 30 })
  const dwAiri = computeDailyWork(2, 'あいり', [], [billing], 0, { 'みく': 25, 'あいり': 30 })
  check(
    '本指名 みく 1 名 → みく 20000 × 25% = 5000（本指名 split）',
    dwMiku.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 5000,
    `got ${JSON.stringify(dwMiku.find((d) => d.date === '2026-06-04'))}`,
  )
  check(
    '本指名 あり時、担当 split は走らない: あいりは 0',
    dwAiri.find((d) => d.date === '2026-06-04')?.bottleBackAmount === undefined ||
      dwAiri.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 0,
    `got ${JSON.stringify(dwAiri.find((d) => d.date === '2026-06-04'))}`,
  )
}

// ─── productBackPerUnit === 0 は明示「バックなし」、castName 設定時に尊重 ───
{
  const billing = makeBilling({
    id: 'b5',
    date: '2026-06-04',
    castNamesSnapshot: ['みく'],
    mainNoms: [],
    orders: [
      { name: 'ノービス', subcategory: 'champagne', price: 25000, quantity: 1,
        castName: 'みく', bottleBackPerUnit: 0 },
    ],
  })
  const dw = computeDailyWork(1, 'みく', [], [billing], 0, { 'みく': 25 })
  check(
    'productBackPerUnit=0 + castName=みく → 明示バックなしで 0',
    dw.find((d) => d.date === '2026-06-04')?.bottleBackAmount === undefined ||
      dw.find((d) => d.date === '2026-06-04')?.bottleBackAmount === 0,
    `got ${JSON.stringify(dw.find((d) => d.date === '2026-06-04'))}`,
  )
}

// ─── フリー卓 (担当も本指名も空) → 0（4 段階目） ───
{
  const billing = makeBilling({
    id: 'b6',
    date: '2026-06-04',
    castNamesSnapshot: [],
    mainNoms: [],
    orders: [
      { name: 'モエ', subcategory: 'champagne', price: 25000, quantity: 1 },
    ],
  })
  const dw = computeDailyWork(1, 'みく', [], [billing], 0, { 'みく': 25 })
  check(
    '担当も本指名も空 → どこにも帰属させない (0)',
    dw.length === 0 || dw.find((d) => d.date === '2026-06-04')?.bottleBackAmount === undefined,
    `got ${JSON.stringify(dw)}`,
  )
}

// ─── 異 subcategory (例: 'shot') はボトル判定されない（regression check） ───
{
  const billing = makeBilling({
    id: 'b7',
    date: '2026-06-04',
    castNamesSnapshot: ['みく'],
    mainNoms: [],
    orders: [
      { name: 'ゲストショット', subcategory: 'shot', price: 25000, quantity: 1 },
    ],
  })
  const dw = computeDailyWork(1, 'みく', [], [billing], 0, { 'みく': 25 })
  check(
    'subcategory=shot はボトル判定されず bottleBackAmount に加算されない',
    dw.length === 0 || dw.find((d) => d.date === '2026-06-04')?.bottleBackAmount === undefined,
    `got ${JSON.stringify(dw)}`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
} else {
  console.log('\nAll dailyWork bottle-back tests passed')
}
