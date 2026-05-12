import type {
  DailyWork,
  AttendanceRecord,
  BillingRecord,
  BackType,
} from '../data/mock'

/**
 * キャストの実データから DailyWork[] を日別に集計する。
 *
 * - hours: attendanceRecords を castId + date でフィルタして workHours を合算
 * - sales: billingRecords の castNamesSnapshot に castName が含まれるレコードを
 *          completedAt の YYYY-MM-DD で日別にまとめて subtotalBeforeTax を合算
 * - backs: receiptSnapshot.orders がある場合、orders[].menuItem.backType の出現数を
 *          BackType 別に集計。orders が無いレコードはスキップ
 * - extensionBackAmount: billingRecords の extensionHistorySnapshot を走査し、
 *          各 ExtensionEntry の nominatedCastNames に castName が含まれていれば
 *          shimeiBackRate を nominatedCastNames.length で均等割り（端数切り捨て）
 *          した金額を加算。nominatedCastNames が空（フリー延長）の entry は対象外。
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

  // date 昇順にソート
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
