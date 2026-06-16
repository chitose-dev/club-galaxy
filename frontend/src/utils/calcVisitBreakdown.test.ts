/**
 * calcVisitBreakdown の単体テスト（テストランナー非依存・スタンドアロン実行）。
 *
 * 旧 `useExtendTable` 経路（延長料金・本指名料を注文行で積む）と
 * `ExtensionConfirmPage` 経路（ExtensionEntry のみ・延長料金は未計上だった）の
 * 両方で、二重計上 / 未計上が起きないことを検証する。
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/calcVisitBreakdown.ts src/utils/calcVisitBreakdown.test.ts \
 *     --outDir /tmp/cvbtest --module commonjs --target es2020 --moduleResolution node --skipLibCheck
 *   node /tmp/cvbtest/calcVisitBreakdown.test.js
 */
import {
  calcVisitBreakdown,
  isSeparatelyBilledRow,
  buildVisitBreakdownInput,
  allocatePerSetTax,
  buildSalesAttribution,
  type BreakdownOrderInput,
  type BreakdownSetInput,
  type VisitTableLike,
  type VisitBreakdownRates,
} from './calcVisitBreakdown'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}
function eq(name: string, actual: number, expected: number): void {
  check(name, actual === expected, `actual=${actual} expected=${expected}`)
}

const UNITS = { honShimeiUnit: 1500, banaiUnit: 500, douhanUnit: 4000, taxRate: 0.2 }
const NOM_NAMES = ['本指名', '場内指名', '同伴']

// ── Scenario A: 旧 useExtendTable 経路（延長料金 6000 + 本指名 1500 を注文行で積む） ──
// 1Set目(setFee 8000, 本指名1) + EX1(setFee 6000, 本指名1継承)。商品はゲストショット2000のみ。
// 延長注文(EX(1), id 2001) と 本指名 charge 行は除外され、二重計上されないこと。
function testUseExtendTablePath(): void {
  const sets: BreakdownSetInput[] = [
    { kind: 'base', label: '1Set目', minutes: 60, setFee: 8000, honShimeiCount: 1, banaiCount: 0, douhanCount: 0 },
    { kind: 'extension', label: 'EX(1)', minutes: 60, setFee: 6000, honShimeiCount: 1, banaiCount: 0, douhanCount: 0 },
  ]
  const orders: BreakdownOrderInput[] = [
    { menuItemId: 105, name: 'ゲストショット', price: 2000, quantity: 1, setSequence: 0 },
    // useExtendTable が積む延長注文（除外対象: orderMenuItemId 一致）
    { menuItemId: 2001, name: 'EX(1)', price: 6000, quantity: 1 },
    // useExtendTable が積む本指名料（除外対象: 指名 charge 名一致）
    { menuItemId: 3001, name: '本指名', price: 1500, quantity: 1, castName: 'あいり' },
  ]
  const r = calcVisitBreakdown({
    ...UNITS, sets, orders,
    excludedExtensionOrderIds: [2001],
    nominationChargeNames: NOM_NAMES,
  })
  eq('A: orderTotal は実商品のみ(2000)・延長/本指名行を除外', r.orderTotal, 2000)
  eq('A: setFeeTotal = 8000+6000', r.setFeeTotal, 14000)
  eq('A: nominationTotal = 1500+1500', r.nominationTotal, 3000)
  eq('A: 税前小計 = 14000+3000+2000', r.subtotalBeforeTax, 19000)
  eq('A: tax = floor(19000*0.2)', r.tax, 3800)
  eq('A: total = 22800', r.total, 22800)
  eq('A: EX1 セット小計 = 6000+1500', r.sets[1].subtotal, 7500)
}

// ── Scenario B: ExtensionConfirmPage 経路（延長注文を積まない＝延長料金が未計上だった） ──
// 1Set目(setFee 8000, 本指名1) + EX1(setFee 6000, 本指名1)。商品は base にゲストショット2000、
// EX1 に割り物600。延長料金 6000 が正しく乗り、注文が setSequence でセット振り分けされること。
function testExtensionConfirmPath(): void {
  const sets: BreakdownSetInput[] = [
    { kind: 'base', label: '1Set目', minutes: 60, setFee: 8000, honShimeiCount: 1, banaiCount: 0, douhanCount: 0 },
    { kind: 'extension', label: 'EX(1)', minutes: 60, setFee: 6000, honShimeiCount: 1, banaiCount: 0, douhanCount: 0 },
  ]
  const orders: BreakdownOrderInput[] = [
    { menuItemId: 105, name: 'ゲストショット', price: 2000, quantity: 1, setSequence: 0 },
    { menuItemId: 108, name: '割り物各種', price: 600, quantity: 1, setSequence: 1 },
  ]
  const r = calcVisitBreakdown({ ...UNITS, sets, orders, nominationChargeNames: NOM_NAMES })
  eq('B: base 注文小計 = 2000', r.sets[0].orderSubtotal, 2000)
  eq('B: EX1 注文小計 = 600 (setSequence で振り分け)', r.sets[1].orderSubtotal, 600)
  eq('B: 延長料金 6000 が計上される(setFeeTotal=14000)', r.setFeeTotal, 14000)
  eq('B: 税前小計 = 14000+3000+2600', r.subtotalBeforeTax, 19600)
  eq('B: tax = floor(19600*0.2)', r.tax, 3920)
  eq('B: total = 23520', r.total, 23520)
}

// ── Scenario C: 延長なし(0EX)は従来モデルと一致 ──
function testBaseOnly(): void {
  const sets: BreakdownSetInput[] = [
    { kind: 'base', label: '1Set目', minutes: 60, setFee: 8000, honShimeiCount: 1, banaiCount: 0, douhanCount: 0 },
  ]
  const orders: BreakdownOrderInput[] = [
    { menuItemId: 105, name: 'ゲストショット', price: 2000, quantity: 1, setSequence: 0 },
  ]
  const r = calcVisitBreakdown({ ...UNITS, sets, orders, nominationChargeNames: NOM_NAMES })
  eq('C: 税前小計 = 8000+1500+2000', r.subtotalBeforeTax, 11500)
  eq('C: total = 13800', r.total, 13800)
}

// ── Scenario D: EX で指名リセット → そのEXは指名料0 ──
function testResetExtensionNoNomination(): void {
  const sets: BreakdownSetInput[] = [
    { kind: 'base', label: '1Set目', minutes: 60, setFee: 8000, honShimeiCount: 1, banaiCount: 0, douhanCount: 0 },
    { kind: 'extension', label: 'EX(1)', minutes: 60, setFee: 6000, honShimeiCount: 0, banaiCount: 0, douhanCount: 0 },
  ]
  const r = calcVisitBreakdown({ ...UNITS, sets, orders: [], nominationChargeNames: NOM_NAMES })
  eq('D: EX1 指名料 = 0 (リセット)', r.sets[1].nominationFee, 0)
  eq('D: nominationTotal = 1500 (baseのみ)', r.nominationTotal, 1500)
  eq('D: EX1 セット小計 = 6000', r.sets[1].subtotal, 6000)
}

// ── Scenario E: base に場内2名 + 同伴1名 ──
function testBanaiDouhan(): void {
  const sets: BreakdownSetInput[] = [
    { kind: 'base', label: '1Set目', minutes: 60, setFee: 8000, honShimeiCount: 0, banaiCount: 2, douhanCount: 1 },
  ]
  const r = calcVisitBreakdown({ ...UNITS, sets, orders: [], nominationChargeNames: NOM_NAMES })
  eq('E: base 指名料 = 2*500 + 1*4000', r.sets[0].nominationFee, 5000)
}

// ── isSeparatelyBilledRow の厳しめ判定 ──
function testExclusionStrictness(): void {
  const excl = new Set<number>([2001])
  const nom = new Set<string>(NOM_NAMES)
  const row = (o: Partial<BreakdownOrderInput>): BreakdownOrderInput =>
    ({ name: 'x', price: 0, quantity: 1, ...o })
  check('除外: isExtension=true', isSeparatelyBilledRow(row({ isExtension: true }), excl, nom) === true)
  check('除外: menuItemId が延長注文ID集合に一致', isSeparatelyBilledRow(row({ menuItemId: 2001 }), excl, nom) === true)
  // 旧EX命名は「原価0・バック0」の複合でのみ除外（延長 fee 行の構造）。
  check('除外: 旧EX命名 EX(2)半 + 原価0/バック0', isSeparatelyBilledRow(row({ name: 'EX(2)半', cost: 0, castBack: 0 }), excl, nom) === true)
  check('除外: 旧延長命名 延長 +60分 + 原価0/バック0', isSeparatelyBilledRow(row({ name: '延長 +60分', cost: 0, castBack: 0 }), excl, nom) === true)
  check('除外: 指名 charge 名 本指名', isSeparatelyBilledRow(row({ name: '本指名' }), excl, nom) === true)
  // Crow指摘: 通常商品が偶然 EX(1) 等の名前でも、原価>0 なら除外しない。
  check('非除外: 通常商品名が EX(1) でも原価>0なら残す', isSeparatelyBilledRow(row({ name: 'EX(1)', price: 800, cost: 300, castBack: 0, menuItemId: 555 }), excl, nom) === false)
  check('非除外: 通常商品名が 延長 +60分 でも原価>0なら残す', isSeparatelyBilledRow(row({ name: '延長 +60分', price: 1200, cost: 400 }), excl, nom) === false)
  check('非除外: 通常商品 ゲストショット', isSeparatelyBilledRow(row({ name: 'ゲストショット', menuItemId: 105, cost: 500 }), excl, nom) === false)
  check('非除外: 通常商品 割り物各種', isSeparatelyBilledRow(row({ name: '割り物各種', menuItemId: 108, cost: 100 }), excl, nom) === false)
}

// ── buildVisitBreakdownInput アダプタ（両経路の Table 形から正しく組むか） ──
const RATES: VisitBreakdownRates = {
  baseSetUnit: 4000, extPrice30: 1000, extPrice60: 3000,
  honShimeiUnit: 1500, banaiUnit: 500, douhanUnit: 4000, taxRate: 0.2,
}

// 旧 useExtendTable 経路の Table 形: 延長確定で orders をクリア&延長/本指名を注文行で積む。
// extensionHistory に orderMenuItemId / nominatedCastNames、現フラグは継続本指名。
function testAdapterUseExtendTablePath(): void {
  const table: VisitTableLike = {
    guestCount: 2, setCount: 1, startTime: '20:30',
    mainNominationCastNames: ['あいり'], isBanaiShimei: false, isDouhan: false,
    assignedCasts: ['あいり'],
    baseNominationSnapshot: { mainNominationCastNames: ['あいり'], banaiCastNames: [], douhanCount: 0 },
    extensionHistory: [{ minutes: 60, nominatedCastNames: ['あいり'], banaiCastNames: [], orderMenuItemId: 2001 }],
    orders: [
      { menuItem: { id: 105, name: 'ゲストショット', price: 2000, cost: 500, castBack: 0 }, quantity: 1, setSequence: 0 },
      { menuItem: { id: 2001, name: 'EX(1)', price: 6000, cost: 0, castBack: 0 }, quantity: 1 }, // 延長注文(除外)
      { menuItem: { id: 3001, name: '本指名', price: 1500, cost: 300, castBack: 0 }, quantity: 1, castName: 'あいり' }, // 本指名料(除外)
    ],
  }
  const r = calcVisitBreakdown(buildVisitBreakdownInput(table, RATES))
  eq('Adapter-旧経路: orderTotal=実商品のみ(2000)', r.orderTotal, 2000)
  eq('Adapter-旧経路: setFeeTotal=8000+6000', r.setFeeTotal, 14000)
  eq('Adapter-旧経路: nominationTotal=1500(base)+1500(EX)', r.nominationTotal, 3000)
  eq('Adapter-旧経路: 税前小計=19000(二重計上なし)', r.subtotalBeforeTax, 19000)
}

// ExtensionConfirmPage 経路: 延長注文を積まない。base は入店時スナップショット(場内=全員)。
// EX1 で本指名みく/場内なし。注文は base/EX1 に setSequence で振り分け。
function testAdapterExtensionConfirmPath(): void {
  const table: VisitTableLike = {
    guestCount: 2, setCount: 1, startTime: '20:30',
    mainNominationCastNames: ['みく'], isBanaiShimei: false, isDouhan: false,
    assignedCasts: ['みく'],
    baseNominationSnapshot: { mainNominationCastNames: ['あいり'], banaiCastNames: ['あいり', 'ゆい'], douhanCount: 0 },
    extensionHistory: [{ minutes: 60, nominatedCastNames: ['みく'], banaiCastNames: [] }],
    orders: [
      { menuItem: { id: 105, name: 'ゲストショット', price: 2000, cost: 500, castBack: 0 }, quantity: 1, setSequence: 0 },
      { menuItem: { id: 108, name: '割り物各種', price: 600, cost: 100, castBack: 0 }, quantity: 1, setSequence: 1 },
    ],
  }
  const r = calcVisitBreakdown(buildVisitBreakdownInput(table, RATES))
  eq('Adapter-新経路: base場内=スナップショット2名×500', r.sets[0].banaiFee, 1000)
  eq('Adapter-新経路: 延長料金6000が計上(setFeeTotal=14000)', r.setFeeTotal, 14000)
  eq('Adapter-新経路: base注文=2000', r.sets[0].orderSubtotal, 2000)
  eq('Adapter-新経路: EX1注文=600(setSequence振り分け)', r.sets[1].orderSubtotal, 600)
  eq('Adapter-新経路: nominationTotal=base(1500+1000)+EX(1500)', r.nominationTotal, 4000)
  eq('Adapter-新経路: 税前小計=14000+4000+2600', r.subtotalBeforeTax, 20600)
}

// 0EX は現フラグ由来（既存 billing と一致）。
function testAdapterBaseOnly(): void {
  const table: VisitTableLike = {
    guestCount: 3, setCount: 1, startTime: '22:30',
    mainNominationCastNames: ['あいり'], isBanaiShimei: true, isDouhan: false,
    assignedCasts: ['あいり', 'みく'],
    orders: [],
  }
  // baseSetUnit を 22時台 5000 として渡す
  const r = calcVisitBreakdown(buildVisitBreakdownInput(table, { ...RATES, baseSetUnit: 5000 }))
  eq('Adapter-0EX: base setFee=5000×3', r.sets[0].setFee, 15000)
  eq('Adapter-0EX: 本指名1×1500', r.sets[0].honShimeiFee, 1500)
  eq('Adapter-0EX: 場内=assignedCasts全員2×500(現行踏襲)', r.sets[0].banaiFee, 1000)
}

// 場内指名のキャスト単位化: 在席4名でも banaiCastNames に入れた1名だけ場内料。
function testAdapterBanaiPerCast(): void {
  const table: VisitTableLike = {
    guestCount: 4, setCount: 1, startTime: '22:30',
    mainNominationCastNames: [], isDouhan: false,
    banaiCastNames: ['まい'],
    assignedCasts: ['まい', 'ゆい', 'あい', 'みく'],
    orders: [],
  }
  const r = calcVisitBreakdown(buildVisitBreakdownInput(table, { ...RATES, baseSetUnit: 5000 }))
  eq('Adapter-場内キャスト単位: 4名中1名のみ場内→1×500', r.sets[0].banaiFee, 500)
}

// 後方互換: banaiCastNames 未設定の旧データは isBanaiShimei ? assignedCasts : [] と同額。
function testAdapterBanaiLegacyFallback(): void {
  const legacy: VisitTableLike = {
    guestCount: 3, setCount: 1, startTime: '22:30',
    mainNominationCastNames: [], isBanaiShimei: true, isDouhan: false,
    assignedCasts: ['あ', 'い', 'う'],
    orders: [],
  }
  const explicit: VisitTableLike = {
    ...legacy, isBanaiShimei: undefined, banaiCastNames: ['あ', 'い', 'う'],
  }
  const rL = calcVisitBreakdown(buildVisitBreakdownInput(legacy, { ...RATES, baseSetUnit: 5000 }))
  const rE = calcVisitBreakdown(buildVisitBreakdownInput(explicit, { ...RATES, baseSetUnit: 5000 }))
  eq('Adapter-後方互換: 旧フラグ卓は全員場内3×500', rL.sets[0].banaiFee, 1500)
  eq('Adapter-後方互換: 明示banaiCastNamesと同額', rE.sets[0].banaiFee, rL.sets[0].banaiFee)
}

// 回帰: 1セット目途中で場内を付けた場合、baseNominationSnapshot.banaiCastNames へ
// 同期されていれば延長後も 1セット目の場内料が残る（OrderPage applyBanaiCastNames が
// currentSetSequence 0 のときスナップショットを更新する前提）。同期漏れ=base 0 だと露見。
function testAdapterBanaiBaseSnapshotAfterExtension(): void {
  const table: VisitTableLike = {
    guestCount: 4, setCount: 1, startTime: '22:30',
    mainNominationCastNames: [], isDouhan: false,
    banaiCastNames: ['まい'],
    assignedCasts: ['まい', 'ゆい', 'あい', 'みく'],
    baseNominationSnapshot: { mainNominationCastNames: [], banaiCastNames: ['まい'], douhanCount: 0 },
    extensionHistory: [{ minutes: 60, nominatedCastNames: [], banaiCastNames: [] }],
    orders: [],
  }
  const r = calcVisitBreakdown(buildVisitBreakdownInput(table, { ...RATES, baseSetUnit: 5000 }))
  eq('Adapter-回帰: 延長後も1セット目場内=snapshot1名×500', r.sets[0].banaiFee, 500)
  eq('Adapter-回帰: EX1の場内は継承なしで0', r.sets[1].banaiFee, 0)
}

// TAX のセット按分（利用明細 / 延長確認のセット別 TAX・合計表示）。
function testAllocatePerSetTax(): void {
  // 2セット・小計按分。端数は最終セットが吸収し、Σ=visit TAX を保証する。
  const r = calcVisitBreakdown({
    sets: [
      { kind: 'base', label: '1Set目', minutes: 60, setFee: 333, honShimeiCount: 0, banaiCount: 0, douhanCount: 0 },
      { kind: 'extension', label: 'EX(1)', minutes: 60, setFee: 667, honShimeiCount: 0, banaiCount: 0, douhanCount: 0 },
    ],
    orders: [],
    ...UNITS,
  })
  eq('allocate: visit tax=floor(1000×0.2)=200', r.tax, 200)
  const t = allocatePerSetTax(r)
  eq('allocate: set0 tax=floor(200×333/1000)=66', t[0], 66)
  eq('allocate: set1(last) 端数吸収=200-66=134', t[1], 134)
  eq('allocate: Σ per-set tax = visit tax', t[0] + t[1], r.tax)
  check(
    'allocate: per-set 合計の総和 = visit 合計',
    (r.sets[0].subtotal + t[0]) + (r.sets[1].subtotal + t[1]) === r.total,
    `sum=${(r.sets[0].subtotal + t[0]) + (r.sets[1].subtotal + t[1])} total=${r.total}`,
  )
  // 小計0なら全セット tax 0。
  const z = calcVisitBreakdown({
    sets: [{ kind: 'base', label: '1Set目', minutes: 60, setFee: 0, honShimeiCount: 0, banaiCount: 0, douhanCount: 0 }],
    orders: [],
    ...UNITS,
  })
  eq('allocate: 小計0なら tax0', allocatePerSetTax(z)[0], 0)
}

// ── buildSalesAttribution（合算で代表卓=代表卓分のみ・対象卓=対象卓分のみ） ──
function testSalesAttributionDistribution(): void {
  const a = buildSalesAttribution(10000, ['A', 'B', 'C'])
  eq('帰属: A', a['A'], 3333)
  eq('帰属: B', a['B'], 3333)
  eq('帰属: C(端数寄せ)', a['C'], 3334)
  eq('帰属: 合計=渡した小計', a['A'] + a['B'] + a['C'], 10000)
  check('帰属: 本指名なしは空', Object.keys(buildSalesAttribution(5000, [])).length === 0)
  eq('帰属: 単独は全額', buildSalesAttribution(5000, ['X'])['X'], 5000)
}

// 合算会計: 代表卓レコードは代表卓分のみ、合算対象卓 shadow は対象卓分のみを按分し、
// 合算全体が代表卓キャストに二重で乗らないこと。
function testSalesAttributionMergedNoDoubleCount(): void {
  const mainSub = 19000 // 代表卓（あいり）
  const shadowSub = 8000 // 合算対象卓（みく）
  const mainAttr = buildSalesAttribution(mainSub, ['あいり'])
  const shadowAttr = buildSalesAttribution(shadowSub, ['みく'])
  eq('合算: 代表卓キャスト=代表卓分のみ', mainAttr['あいり'], 19000)
  eq('合算: 対象卓キャスト=対象卓分のみ', shadowAttr['みく'], 8000)
  check('合算: 代表卓に合算対象卓キャストは乗らない', mainAttr['みく'] === undefined)
  check('合算: 対象卓に代表卓キャストは乗らない', shadowAttr['あいり'] === undefined)
  // 全体合計 = 代表卓分 + 対象卓分（合算総額の二重計上なし）
  eq('合算: 帰属総額=各卓小計の和', mainAttr['あいり'] + shadowAttr['みく'], mainSub + shadowSub)
}

function main(): number {
  testSalesAttributionDistribution()
  testSalesAttributionMergedNoDoubleCount()
  testUseExtendTablePath()
  testExtensionConfirmPath()
  testBaseOnly()
  testResetExtensionNoNomination()
  testBanaiDouhan()
  testExclusionStrictness()
  testAdapterUseExtendTablePath()
  testAdapterExtensionConfirmPath()
  testAdapterBaseOnly()
  testAdapterBanaiPerCast()
  testAdapterBanaiLegacyFallback()
  testAdapterBanaiBaseSnapshotAfterExtension()
  testAllocatePerSetTax()
  console.log(failures === 0 ? '\nAll calcVisitBreakdown tests passed.' : `\n${failures} test(s) FAILED.`)
  return failures
}

const failed = main()
if (failed > 0) {
  throw new Error(`${failed} calcVisitBreakdown test(s) failed`)
}
