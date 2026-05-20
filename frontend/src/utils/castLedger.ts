/**
 * キャスト日経表 (月次明細) 出力
 *
 * 既存フォーマット cast1.2025.6.PDF に準拠。
 * 現状は HTML をブラウザの印刷ダイアログで「PDFに保存」することで
 * PDF 化する方式（Noto Sans JP フォント埋め込みの 1-5MB バンドル追加を回避）。
 * 将来 jspdf + Noto Sans JP に置き換える場合は、この関数1つを差し替えれば済む。
 */

import type { Cast, DailyWork, StoreSettings } from '../data/mock'
import { openPrintWindow } from './print'
import { calcHourlyPay } from './payroll'

const BACK_COLUMNS: { key: keyof DailyWork['backs']; label: string }[] = [
  { key: 'FD', label: 'Fドリンク' },
  { key: '本D', label: '本ドリンク' },
  { key: 'Fカク', label: 'Fカクテル' },
  { key: '本カク', label: '本カクテル' },
  { key: '本カクW', label: '本カクW' },
  { key: '同伴', label: '同伴' },
  { key: '本指名', label: '本指' },
  { key: '場内指名', label: '場内' },
  { key: 'ボトルバック', label: 'ボトルバック' },
  { key: 'その他', label: 'その他' },
]

export interface CastLedgerParams {
  cast: Cast
  year: number
  month: number
  dailyWork: DailyWork[]
  storeSettings: StoreSettings
  /** 先月売上 */
  previousMonthSales?: number
  /** 本名 */
  realName?: string
  /** 住所 */
  address?: string
}

export function printCastLedger(params: CastLedgerParams): void {
  const { cast, year, month, dailyWork, storeSettings, previousMonthSales = 0, realName = '', address = '' } = params

  const yyyymm = `${year}/${String(month).padStart(2, '0')}`
  const monthWork = dailyWork.filter((w) => {
    // w.date は '3/5' or '2026-03-05' いずれも想定
    if (w.date.includes('-')) return w.date.startsWith(`${year}-${String(month).padStart(2, '0')}`)
    const [m] = w.date.split('/')
    return parseInt(m, 10) === month
  })

  // 日ごとの単価計算 (給与明細と同じロジック)
  const rowsHtml = monthWork
    .map((w) => {
      // 追補03 R25: 時給は 15 分単位 + ルーズタイム 15 分
      const hourly = calcHourlyPay(cast.hourlyRate, w.hours)
      // A2: ボトルバックは bottleBackAmount を正本として扱うため、
      // 通常の backs[type] × rate 集計からは 'ボトルバック' を除外する
      // （旧 `count × %値` 計算は誤算出になるため）。
      const backTotal = (Object.keys(w.backs) as Array<keyof typeof w.backs>).reduce(
        (sum, k) => k === 'ボトルバック' ? sum : sum + (w.backs[k] ?? 0) * (cast.backRates?.[k] ?? 0),
        0,
      )
      // 延長指名バック按分（PR #63 で computeDailyWork が均等割りした金額）。
      // 日経表 P 合計に含めないと延長分が給与計算に反映されない。
      const extensionBack = w.extensionBackAmount ?? 0
      // A2: 本指名ボトルバック（小計÷本指名人数×個別率）
      const bottleBack = w.bottleBackAmount ?? 0
      const pTotal = backTotal + extensionBack + bottleBack
      const dailyGross = hourly + pTotal
      const tax = Math.floor(dailyGross * 0.1)
      const total = dailyGross - tax

      const backCells = BACK_COLUMNS.map(({ key }) => {
        if (key === 'ボトルバック') {
          // A2: backs から件数は除外しているため、bottleBackAmount のみを表示。
          // count 件表示は専用カウントを追加した後続 PR で復活させる想定。
          return bottleBack > 0 ? `¥${bottleBack.toLocaleString()}` : '-'
        }
        const count = w.backs[key] ?? 0
        const unit = cast.backRates?.[key] ?? 0
        return count > 0 ? `${count}(¥${(count * unit).toLocaleString()})` : '-'
      }).join('</td><td>')

      return `<tr>
        <td>${escapeHtml(w.date)}</td>
        <td>${w.hours}h</td>
        <td>¥${hourly.toLocaleString()}</td>
        <td>${backCells}</td>
        <td>¥${pTotal.toLocaleString()}</td>
        <td>¥${dailyGross.toLocaleString()}</td>
        <td>-¥${tax.toLocaleString()}</td>
        <td>¥${total.toLocaleString()}</td>
      </tr>`
    })
    .join('')

  const totalHours = monthWork.reduce((s, w) => s + w.hours, 0)
  const totalSales = monthWork.reduce((s, w) => s + w.sales, 0)
  const totalGross = monthWork.reduce((s, w) => {
    const hourly = Math.floor(cast.hourlyRate * w.hours)
    // A2: 月次集計でも 'ボトルバック' を旧路線（count × %）から除外し、
    // bottleBackAmount を直接加算する。
    const backTotal = (Object.keys(w.backs) as Array<keyof typeof w.backs>).reduce(
      (sum, k) => k === 'ボトルバック' ? sum : sum + (w.backs[k] ?? 0) * (cast.backRates?.[k] ?? 0),
      0,
    )
    // 月計にも延長指名バック + 本指名ボトルバックを加算（日次の pTotal と整合させる）。
    const extensionBack = w.extensionBackAmount ?? 0
    const bottleBack = w.bottleBackAmount ?? 0
    return s + hourly + backTotal + extensionBack + bottleBack
  }, 0)
  const totalTax = Math.floor(totalGross * 0.1)
  const totalNet = totalGross - totalTax

  const backHeaderCells = BACK_COLUMNS.map((c) => `<th>${c.label}</th>`).join('')

  const body = `
    <div class="ledger-header">
      <div class="store-name">${escapeHtml(storeSettings.storeName || "CLUB GALAXY")}</div>
      <div class="title">月次日経表 ${year}年${month}月分</div>
      <div class="info-grid">
        <div><span class="label">源氏名:</span> <span class="value">${escapeHtml(cast.name)}</span></div>
        <div><span class="label">時給:</span> <span class="value">¥${cast.hourlyRate.toLocaleString()}</span></div>
        <div><span class="label">先月売上:</span> <span class="value">¥${previousMonthSales.toLocaleString()}</span></div>
        <div><span class="label">当月売上:</span> <span class="value">¥${totalSales.toLocaleString()}</span></div>
      </div>
    </div>

    <table class="ledger">
      <thead>
        <tr>
          <th>日</th><th>時間</th><th>日給</th>
          ${backHeaderCells}
          <th>P合計</th><th>日給合計</th><th>ホステス税(-10%)</th><th>総支給額</th>
        </tr>
      </thead>
      <tbody>
        ${rowsHtml || '<tr><td colspan="16" class="center muted">該当月のデータなし</td></tr>'}
      </tbody>
      <tfoot>
        <tr class="total">
          <td>合計</td>
          <td>${totalHours}h</td>
          <td>-</td>
          <td colspan="${BACK_COLUMNS.length}">-</td>
          <td>-</td>
          <td>¥${totalGross.toLocaleString()}</td>
          <td>-¥${totalTax.toLocaleString()}</td>
          <td class="bold">¥${totalNet.toLocaleString()}</td>
        </tr>
      </tfoot>
    </table>

    <div class="footer">
      <div class="cast-info">
        <div><span class="label">本名:</span> ${escapeHtml(realName || '________________')}</div>
        <div><span class="label">住所:</span> ${escapeHtml(address || '________________')}</div>
      </div>
      <div class="company">
        <div>株式会社CATSWINGS</div>
        <div>代表取締役 鄭 憲一</div>
      </div>
    </div>

    <div class="muted center" style="margin-top: 10px;">出力: ${yyyymm} / ${new Date().toLocaleDateString('ja-JP')}</div>
  `

  const extraStyles = `
    @page { size: A4 landscape; margin: 10mm; }
    body { padding: 10px; font-size: 10px; }
    .ledger-header { margin-bottom: 10px; }
    .store-name { text-align: center; font-size: 16px; font-weight: bold; letter-spacing: 2px; }
    .title { text-align: center; font-size: 14px; margin: 4px 0 8px; }
    .info-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 6px; font-size: 11px; padding: 6px; border: 1px solid #333; }
    .info-grid .label { color: #555; margin-right: 4px; }
    .info-grid .value { font-weight: bold; }
    table.ledger { width: 100%; border-collapse: collapse; font-size: 9px; }
    table.ledger th, table.ledger td { border: 1px solid #333; padding: 2px 3px; text-align: right; }
    table.ledger th { background: #eee; text-align: center; font-weight: bold; }
    table.ledger tfoot .total td { background: #f8f8f8; font-weight: bold; }
    .footer { display: flex; justify-content: space-between; margin-top: 20px; font-size: 11px; }
    .footer .cast-info div { margin-bottom: 6px; }
    .footer .cast-info .label { color: #555; margin-right: 6px; }
    .footer .company { text-align: right; }
    .footer .company div { margin-bottom: 2px; }
  `

  openPrintWindow(body, `${cast.name}_${year}年${month}月_日経表`, {
    width: 1000,
    height: 700,
    extraStyles,
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;'
      case '<': return '&lt;'
      case '>': return '&gt;'
      case '"': return '&quot;'
      case "'": return '&#39;'
      default: return c
    }
  })
}
