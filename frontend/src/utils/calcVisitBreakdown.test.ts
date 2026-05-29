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
  type BreakdownOrderInput,
  type BreakdownSetInput,
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

function main(): number {
  testUseExtendTablePath()
  testExtensionConfirmPath()
  testBaseOnly()
  testResetExtensionNoNomination()
  testBanaiDouhan()
  testExclusionStrictness()
  console.log(failures === 0 ? '\nAll calcVisitBreakdown tests passed.' : `\n${failures} test(s) FAILED.`)
  return failures
}

const failed = main()
if (failed > 0) {
  throw new Error(`${failed} calcVisitBreakdown test(s) failed`)
}
