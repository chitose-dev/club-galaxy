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
 *
 * sampleDailyWork (Record<number, DailyWork[]>) のダミーを置換するための実装。
 */
export function computeDailyWork(
  castId: number,
  castName: string,
  attendanceRecords: AttendanceRecord[],
  billingRecords: BillingRecord[],
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
    //   - att に該当キャストのキーがあればその値（複数本指名の均等按分済み）。
    //   - att はあるがキー無し → このキャストは本指名ではない（assigned だが帰属外） → 0
    //   - att 自体無し（旧形式） → subtotal を全額（按分なしフォールバック）
    const att = (billing as BillingRecord & { salesAttributionByCast?: Record<string, number> }).salesAttributionByCast
    let perCastSales: number
    if (att && Object.keys(att).length > 0) {
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

  // date 昇順にソート
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date))
}
