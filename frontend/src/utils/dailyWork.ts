import type {
  DailyWork,
  AttendanceRecord,
  BillingRecord,
  BackType,
} from '../data/mock'
import { calcChampagneSplit, getBackTypeForCategory } from './champagneSplit'

/**
 * キャストの実データから DailyWork[] を日別に集計する。
 *
 * - hours: attendanceRecords を castId + date でフィルタして workHours を合算
 * - sales: billingRecords の castNamesSnapshot に castName が含まれるレコードを
 *          completedAt の YYYY-MM-DD で日別にまとめて subtotalBeforeTax を合算
 * - backs: receiptSnapshot.orders がある場合、orders[].menuItem.backType の出現数を
 *          BackType 別に集計。orders が無いレコードはスキップ。
 *          ボトルバックの件数も従来通り計上するが、金額の正本は
 *          `bottleBackAmount`（A2 で導入）なので、給与計算では
 *          backs['ボトルバック'] × rate の旧路線は使わないこと。
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

  // 本指名ボトルバック按分: receiptSnapshot.mainNominationCastNamesSnapshot に
  // 当該キャストが含まれるレシートを抽出し、bottle 系 orders の小計に対して
  // calcChampagneSplit を適用。当該キャストの取り分を bottleBackAmount に加算。
  for (const billing of billingRecords) {
    if (billing.voidedAt) continue
    const snap = billing.receiptSnapshot
    if (!snap?.orders) continue
    const mainNoms = snap.mainNominationCastNamesSnapshot ?? []
    if (mainNoms.length === 0) continue
    if (!mainNoms.includes(castName)) continue
    const date =
      billing.date ??
      (billing.completedAt ? billing.completedAt.slice(0, 10) : null)
    if (!date) continue
    // bottle 系の小計を集計（subcategory ベースの判定。古い snapshot で
    // subcategory が無い orders はスキップ）。
    let bottleSubtotal = 0
    for (const order of snap.orders) {
      const mi = order.menuItem
      const sc = mi.subcategory
      // bottle 判定: subcategory が getBackTypeForCategory で 'ボトルバック' を返す
      // か、明示的に backType='ボトルバック' のいずれか（G PR の 0 円ボトルでも
      // backType 経由で対象に入れられるようにしておく）。
      const isBottle = (sc && getBackTypeForCategory(sc) === 'ボトルバック')
        || mi.backType === 'ボトルバック'
      if (!isBottle) continue
      // G PR の 0 円ボトル用 hook: bottleBackBasePerUnit が指定されていれば
      // それを単価として使う（price=0 でも任意金額のバック対象にできる）。
      const perUnit = mi.bottleBackBasePerUnit ?? mi.price
      bottleSubtotal += perUnit * order.quantity
    }
    if (bottleSubtotal <= 0) continue
    const split = calcChampagneSplit({
      subtotal: bottleSubtotal,
      nominationCastNames: mainNoms,
      castBackRateMap: bottleBackRateByCast,
    })
    const share = split.perCastBackAmount[castName] ?? 0
    if (share === 0) continue
    const dw = ensure(date)
    dw.bottleBackAmount = (dw.bottleBackAmount ?? 0) + share
  }

  // date 昇順にソート
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
