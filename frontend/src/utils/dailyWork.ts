import type {
  DailyWork,
  AttendanceRecord,
  BillingRecord,
  BackType,
} from '../data/mock'
import { calcChampagneSplit, getBackTypeForCategory } from './champagneSplit'
import { calcBottleBackPerOrder } from './bottleBack'

/**
 * キャストの実データから DailyWork[] を日別に集計する。
 *
 * - hours: attendanceRecords を castId + date でフィルタして workHours を合算
 * - sales: billingRecords の castNamesSnapshot に castName が含まれるレコードを
 *          completedAt の YYYY-MM-DD で日別にまとめて subtotalBeforeTax を合算
 * - backs: receiptSnapshot.orders がある場合、orders[].menuItem.backType の出現数を
 *          BackType 別に集計。orders が無いレコードはスキップ。
 *          ただし 'ボトルバック' は件数加算自体を行わない。金額の正本は
 *          `bottleBackAmount` のみで、件数を持たせると同卓のフリー/場内/
 *          ヘルプに「ボトルバック: 1件 (¥0)」が残る不整合表示が出るため、
 *          本ループでは bottle 行を完全に除外する。
 * - extensionBackAmount: billingRecords の extensionHistorySnapshot を走査し、
 *          各 ExtensionEntry の nominatedCastNames に castName が含まれていれば
 *          shimeiBackRate を nominatedCastNames.length で均等割り（端数切り捨て）
 *          した金額を加算。nominatedCastNames が空（フリー延長）の entry は対象外。
 * - bottleBackAmount: receiptSnapshot.orders の bottle 系（subcategory が
 *          champagne/whisky/shochu/brandy/wine、または backType='ボトルバック'）
 *          を抽出し、receiptSnapshot.mainNominationCastNamesSnapshot を本指名
 *          リストとして `calcChampagneSplit` に渡し、当該キャストの取り分を
 *          加算する。当該キャストが本指名スナップショットに含まれないレシート
 *          はスキップ（フリー/場内/ヘルプには付かない）。
 *
 * sampleDailyWork (Record<number, DailyWork[]>) のダミーを置換するための実装。
 */
export function computeDailyWork(
  castId: number,
  castName: string,
  attendanceRecords: AttendanceRecord[],
  billingRecords: BillingRecord[],
  /** cast.backRates['本指名'] の値。延長指名バック按分の単価として使う。
   *  未指定（旧 caller）の場合は 0 扱いで延長バックは加算されない。 */
  shimeiBackRate: number = 0,
  /** 全キャストの「ボトルバック」率（% 単位、25=25%）。
   *  キーはキャスト名、値は `Cast.backRates['ボトルバック']`。
   *  bottle 系レシートで本指名 N 名分の按分計算に必要なため、
   *  当該キャスト 1 人分ではなく**全キャスト分**を渡す（同じレシートに
   *  別の本指名キャストが居る場合、彼/彼女の率を参照して `calcChampagneSplit`
   *  が小計を消費するため）。未指定（旧 caller）の場合は bottleBackAmount は
   *  計上されない。 */
  bottleBackRateByCast: Record<string, number> = {},
): DailyWork[] {
  // date をキーにマップで集計
  const byDate = new Map<string, DailyWork>()

  const ensure = (date: string): DailyWork => {
    const existing = byDate.get(date)
    if (existing) return existing
    const fresh: DailyWork = { date, hours: 0, sales: 0, backs: {} }
    byDate.set(date, fresh)
    return fresh
  }

  // hours: 勤怠
  for (const rec of attendanceRecords) {
    if (rec.staffId !== castId) continue
    if (!rec.date) continue
    const dw = ensure(rec.date)
    dw.hours += rec.workHours ?? 0
  }

  // sales + backs: 会計レコード
  for (const billing of billingRecords) {
    // 取消済みレコード（BillingRecord 型コメント §3.1.1: voidedAt が立つ記録は
    // 売上集計から除外）は最初から飛ばす。extension / bottleBack ループでも同様。
    if (billing.voidedAt) continue
    const cs = (billing as BillingRecord & { castNamesSnapshot?: string[] }).castNamesSnapshot
    if (!Array.isArray(cs) || !cs.includes(castName)) continue

    const date =
      billing.date ??
      (billing.completedAt ? billing.completedAt.slice(0, 10) : null)
    if (!date) continue

    const dw = ensure(date)

    // spec.md §5.5: 売上帰属は salesAttributionByCast を優先参照（会計時スナップショット）。
    //   - att !== undefined（新形式、フリー卓含む）→ att[castName] ?? 0
    //     フリー卓は att = {} で保存されるため att[castName] が undefined → 0 加算（誰にも帰属しない）。
    //   - att === undefined（旧形式レコード）→ subtotalBeforeTax を全額計上（按分なしフォールバック）。
    //     注意: Object.keys(att).length > 0 で判定するとフリー卓 ({}) が旧形式扱いになり
    //     subtotal が castNamesSnapshot 全員に重複加算されるバグになる。
    const att = (billing as BillingRecord & { salesAttributionByCast?: Record<string, number> }).salesAttributionByCast
    let perCastSales: number
    if (att !== undefined) {
      perCastSales = att[castName] ?? 0
    } else {
      perCastSales =
        (billing as BillingRecord & { subtotalBeforeTax?: number }).subtotalBeforeTax ??
        billing.total ??
        0
    }
    dw.sales += perCastSales

    // receiptSnapshot.orders から backs 集計（orders が無ければスキップ）
    const snap = (billing as BillingRecord & {
      receiptSnapshot?: {
        orders?: Array<{
          menuItem: { backType?: BackType }
          quantity: number
        }>
      }
    }).receiptSnapshot
    if (!snap?.orders) continue
    for (const order of snap.orders) {
      const bt = order.menuItem.backType
      if (!bt) continue
      // A2: 'ボトルバック' は bottleBackAmount を正本として扱うため、
      // ここでは件数自体も加算しない。同卓だが本指名でないキャストに
      // 「ボトルバック: 1件 (¥0)」のような不整合表示が出るのを防ぐ
      // （Word 仕様「本指名ではないキャストには付けない」と表示も整合）。
      if (bt === 'ボトルバック') continue
      // 2026-06-04 先方確定: 通常バック (キャストドリンク / 指名同伴 等) は
      // `order.castName` が設定されていれば**そのキャスト本人だけに加算**する
      // （castNamesSnapshot 全員に加算すると同卓の他キャストにも同件数が
      //  二重計上されるバグになる。例: みく castName=みく FD 6 件 →
      //  あいり側にも FD 6 件分が入って 同額表示になる）。
      // castName 空の order は legacy 互換で従来通り castNamesSnapshot 全員に
      //  加算（キャストドリンク・指名同伴は OrderPage 側で castName 必須なため、
      //  新規データでは実質発生しない経路）。
      if (typeof order.castName === 'string' && order.castName !== castName) continue
      dw.backs[bt] = (dw.backs[bt] ?? 0) + (order.quantity ?? 1)
    }
  }

  // 延長指名バック按分: billing.extensionHistorySnapshot を走査して
  // 当該キャストが nominatedCastNames に含まれている entry の本指名バックを
  // キャスト人数で均等割り（端数切り捨て）して加算する。
  // castNamesSnapshot ベースでは判定しない（万一 mainNomination が assigned から
  // 外れているレコードでも、nominatedCastNames に居れば帰属対象）。
  for (const billing of billingRecords) {
    if (billing.voidedAt) continue
    const snapshot = billing.extensionHistorySnapshot
    if (!snapshot || snapshot.length === 0) continue
    const date =
      billing.date ??
      (billing.completedAt ? billing.completedAt.slice(0, 10) : null)
    if (!date) continue
    let share = 0
    for (const entry of snapshot) {
      const names = entry.nominatedCastNames ?? []
      if (names.length === 0) continue // フリー延長は誰にも付与しない
      if (!names.includes(castName)) continue
      share += Math.floor(shimeiBackRate / names.length)
    }
    if (share === 0) continue
    const dw = ensure(date)
    dw.extensionBackAmount = (dw.extensionBackAmount ?? 0) + share
  }

  // ボトルバック計算（2026-06-03 先方確定: 商品個別バック金額 > 給与設定率 > なし）
  //
  // 帰属モデル（優先順位順に並べる）:
  //   1. order.castName が設定されている → そのキャストに直接帰属し、
  //      `calcBottleBackPerOrder` で priority 計算（null/0/正数 区別）。
  //   2. order.castName 空 + 本指名 (mainNominationCastNamesSnapshot) あり →
  //      本指名キャストで `calcChampagneSplit` 按分（既存レシート互換）。
  //   3. order.castName 空 + 本指名なし + 担当キャスト (castNamesSnapshot) あり →
  //      担当キャストで按分（PR #117 後の追加修正: 本指名なし運用でも
  //      担当に紐付けば率フォールバックでバックを計上する）。
  //   4. いずれにも該当しない → バック付与なし（フリー卓・担当未確定）。
  //
  // ※ 2 と 3 のフォールバックは率のみ（productBackPerUnit は適用しない）。
  //   理由: productBackPerUnit は「1 本あたりの円固定金額」で、N 名按分時の
  //   分割ルールが未定義。明示帰属（castName 設定）の場合のみ尊重する。
  // ※「同卓フリー/場内/ヘルプには付与しない」「集計の正本は bottleBackAmount」
  //   の従来不変条件は維持する（dw.backs['ボトルバック'] には件数を加算しない）。
  for (const billing of billingRecords) {
    if (billing.voidedAt) continue
    const snap = billing.receiptSnapshot
    if (!snap?.orders) continue
    const date =
      billing.date ??
      (billing.completedAt ? billing.completedAt.slice(0, 10) : null)
    if (!date) continue
    const mainNoms = snap.mainNominationCastNamesSnapshot ?? []
    // 担当キャストスナップショット（フリー卓では空、本指名 0 + 担当 N のときに使う）
    const assignedCasts =
      (billing as BillingRecord & { castNamesSnapshot?: string[] }).castNamesSnapshot ?? []

    // 当該キャストへの直接帰属分（castName === castName のボトル order）
    let directBack = 0
    // 本指名 split 用、castName 未設定 + 本指名あり のボトル order 小計
    let mainNomBottleSubtotal = 0
    // 担当 split 用、castName 未設定 + 本指名なし + 担当あり のボトル order 小計
    let assignedBottleSubtotal = 0

    for (const order of snap.orders) {
      const mi = order.menuItem
      const sc = mi.subcategory
      const isBottle = (sc && getBackTypeForCategory(sc) === 'ボトルバック')
        || mi.backType === 'ボトルバック'
      if (!isBottle) continue
      const basePerUnit = mi.bottleBackBasePerUnit ?? mi.price

      if (order.castName) {
        // 1. 明示帰属
        if (order.castName !== castName) continue
        const { amount } = calcBottleBackPerOrder({
          productBackPerUnit: mi.bottleBackPerUnit,
          castBottleRatePercent: bottleBackRateByCast[castName],
          basePerUnit,
          quantity: order.quantity,
        })
        directBack += amount
      } else if (mainNoms.length > 0) {
        // 2. 本指名按分（legacy 互換）
        mainNomBottleSubtotal += basePerUnit * order.quantity
      } else if (assignedCasts.length === 1) {
        // 3. 担当キャスト fallback（**1 名のときだけ**発火）。
        //    本指名運用していない店舗でも、担当が 1 名に確定していれば率で計上。
        //    2 名以上のときは「誰のバックか曖昧」なので自動付与しない（先方確定:
        //    店舗運用未確定のため、明示帰属 or 本指名設定を促す）。
        assignedBottleSubtotal += basePerUnit * order.quantity
      }
      // 4. else: 担当 0 名 / 2 名以上 → どこにも帰属させない（自動付与しない）
    }

    let amount = directBack
    if (mainNomBottleSubtotal > 0 && mainNoms.includes(castName)) {
      const split = calcChampagneSplit({
        subtotal: mainNomBottleSubtotal,
        nominationCastNames: mainNoms,
        castBackRateMap: bottleBackRateByCast,
      })
      amount += split.perCastBackAmount[castName] ?? 0
    }
    if (assignedBottleSubtotal > 0 && assignedCasts.includes(castName)) {
      // 担当 N 名で均等按分。calcChampagneSplit は引数名が「本指名」だが、
      // 実体は「対象 N 名で割って各キャストの率を掛ける」純関数なので流用可。
      const split = calcChampagneSplit({
        subtotal: assignedBottleSubtotal,
        nominationCastNames: assignedCasts,
        castBackRateMap: bottleBackRateByCast,
      })
      amount += split.perCastBackAmount[castName] ?? 0
    }

    if (amount === 0) continue
    const dw = ensure(date)
    dw.bottleBackAmount = (dw.bottleBackAmount ?? 0) + amount
  }

  // date 昇順にソート
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
