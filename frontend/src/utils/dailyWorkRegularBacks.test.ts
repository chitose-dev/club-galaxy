/**
 * computeDailyWork の「通常バック (キャストドリンク / 指名同伴 等)」集計テスト。
 *
 * 2026-06-04 先方報告のバグ: 同卓に複数キャストが居ると、ある 1 名が注文した
 * 通常バック（例: みく の FD 6 件）が同卓の他キャスト（あいり）にも全件加算
 * されてしまい、給与明細・日払いモーダルで同額表示になる。
 *
 * 原因: `dailyWork.ts` の receiptSnapshot.orders ループが `order.castName` を
 *       見ずに `castNamesSnapshot` 全員に同件数を加算していた。
 * 修正: `order.castName` が設定されていればそのキャスト本人のみに加算。
 *       空（legacy）の場合は従来通り castNamesSnapshot 全員に加算（互換）。
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/dailyWorkRegularBacks.test.ts \
 *     src/utils/dailyWork.ts src/utils/bottleBack.ts src/utils/champagneSplit.ts \
 *     --outDir /tmp/dwrb --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck
 *   node /tmp/dwrb/utils/dailyWorkRegularBacks.test.js
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

function makeBilling(opts: {
  id: string
  date: string
  castNamesSnapshot: string[]
  mainNoms: string[]
  orders: {
    name: string
    subcategory: string
    backType?: string
    price: number
    quantity: number
    castName?: string
  }[]
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
    salesAttributionByCast: {},
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
          id: 200 + i,
          name: o.name,
          price: o.price,
          subcategory: o.subcategory,
          ...(o.backType ? { backType: o.backType } : {}),
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

// ─── ふうや報告のバグ再現: みく FD 6 件 (castName=みく) → あいりにも 6 件入る ───
{
  const billing = makeBilling({
    id: 'b1',
    date: '2026-06-04',
    castNamesSnapshot: ['みく', 'あいり'],
    mainNoms: [],
    orders: [
      { name: 'Lドリンク (FD)', subcategory: 'fdrink', backType: 'FD',
        price: 1000, quantity: 6, castName: 'みく' },
    ],
  })
  const dwMiku = computeDailyWork(1, 'みく', [], [billing])
  const dwAiri = computeDailyWork(2, 'あいり', [], [billing])
  check(
    'castName=みく FD 6 件 → みくの backs.FD = 6',
    dwMiku.find((d) => d.date === '2026-06-04')?.backs.FD === 6,
    `got ${JSON.stringify(dwMiku.find((d) => d.date === '2026-06-04'))}`,
  )
  check(
    'castName=みく FD 6 件 → あいりの backs.FD は 0（排他、同額表示にならない）',
    dwAiri.find((d) => d.date === '2026-06-04')?.backs.FD === undefined ||
      dwAiri.find((d) => d.date === '2026-06-04')?.backs.FD === 0,
    `got ${JSON.stringify(dwAiri.find((d) => d.date === '2026-06-04'))}`,
  )
}

// ─── 別キャスト混在: みく FD 6 件 + あいり 本D 2 件 → 各々のみに加算 ───
{
  const billing = makeBilling({
    id: 'b2',
    date: '2026-06-04',
    castNamesSnapshot: ['みく', 'あいり'],
    mainNoms: [],
    orders: [
      { name: 'Lドリンク (FD)', subcategory: 'fdrink', backType: 'FD',
        price: 1000, quantity: 6, castName: 'みく' },
      { name: 'Lドリンク (本D)', subcategory: 'hondrink', backType: '本D',
        price: 2000, quantity: 2, castName: 'あいり' },
    ],
  })
  const dwMiku = computeDailyWork(1, 'みく', [], [billing])
  const dwAiri = computeDailyWork(2, 'あいり', [], [billing])
  const mikuDay = dwMiku.find((d) => d.date === '2026-06-04')
  const airiDay = dwAiri.find((d) => d.date === '2026-06-04')
  check(
    '混在: みく.backs.FD = 6 / みく.backs.本D は 0',
    mikuDay?.backs.FD === 6 && (mikuDay?.backs['本D'] === undefined || mikuDay?.backs['本D'] === 0),
    `got ${JSON.stringify(mikuDay)}`,
  )
  check(
    '混在: あいり.backs.本D = 2 / あいり.backs.FD は 0',
    airiDay?.backs['本D'] === 2 && (airiDay?.backs.FD === undefined || airiDay?.backs.FD === 0),
    `got ${JSON.stringify(airiDay)}`,
  )
}

// ─── castName 空の legacy データは castNamesSnapshot 全員に加算（互換） ───
{
  const billing = makeBilling({
    id: 'b3',
    date: '2026-06-04',
    castNamesSnapshot: ['みく', 'あいり'],
    mainNoms: [],
    orders: [
      // castName を持たない旧データ（OrderPage では現状 castName 必須なので新規発生しない）
      { name: 'Lドリンク (FD)', subcategory: 'fdrink', backType: 'FD',
        price: 1000, quantity: 3 },
    ],
  })
  const dwMiku = computeDailyWork(1, 'みく', [], [billing])
  const dwAiri = computeDailyWork(2, 'あいり', [], [billing])
  check(
    'legacy: castName 空 → みくの backs.FD = 3 (互換)',
    dwMiku.find((d) => d.date === '2026-06-04')?.backs.FD === 3,
    `got ${JSON.stringify(dwMiku.find((d) => d.date === '2026-06-04'))}`,
  )
  check(
    'legacy: castName 空 → あいりの backs.FD = 3 (互換、全員加算)',
    dwAiri.find((d) => d.date === '2026-06-04')?.backs.FD === 3,
    `got ${JSON.stringify(dwAiri.find((d) => d.date === '2026-06-04'))}`,
  )
}

// ─── 同卓に居ないキャスト (castNamesSnapshot に居ない) は影響を受けない ───
{
  const billing = makeBilling({
    id: 'b4',
    date: '2026-06-04',
    castNamesSnapshot: ['みく'],
    mainNoms: [],
    orders: [
      { name: 'Lドリンク (FD)', subcategory: 'fdrink', backType: 'FD',
        price: 1000, quantity: 5, castName: 'みく' },
    ],
  })
  const dwYuna = computeDailyWork(99, 'ゆな', [], [billing])
  check(
    '同卓 (castNamesSnapshot) に居ない別キャストは集計対象外',
    dwYuna.length === 0 || dwYuna.find((d) => d.date === '2026-06-04') === undefined,
    `got ${JSON.stringify(dwYuna)}`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
} else {
  console.log('\nAll dailyWork regular backs tests passed')
}
