/**
 * 営業日（businessDate）の締め状態判定ヘルパー。
 *
 * PDF/Word 要件:
 *   - 「日報を登録、締め処理をしたらその日の売上・キャスト給与が確定」
 *   - 「締め解除した場合、会計・勤怠・給与の修正を可能にし、再締め時に再計算」
 *   - 「締め済み日は会計取消/勤怠時刻修正/給与・日払い修正/経費追加・修正・削除をロック」
 *
 * バックエンドは設計書 §6 で締め後 void を 422 ALREADY_CLOSED で拒否するが、
 * フロントエンド側は UI 側の「ボタン非活性化＋理由ツールチップ」で先に弾く。
 * これにより操作可否がその場で分かり、誤クリック→422 でエラーモーダルという
 * 体験を避ける。
 */

import type { DailyReport } from '../data/mock'

/** YYYY-MM-DD 単位で同日扱いするキーに正規化。 */
function normalizeDateKey(date: string | undefined | null): string {
  if (!date) return ''
  // 既に YYYY-MM-DD ならそのまま、ISO 8601 なら先頭 10 文字を切る
  if (/^\d{4}-\d{2}-\d{2}$/.test(date)) return date
  return date.slice(0, 10)
}

/**
 * 指定営業日に「現在も有効な締め (closedAt あり)」のレポートが存在するか。
 * `reopenedAt` だけがあって `closedAt` が null なら「解除済み」= ロック解除中。
 */
export function isBusinessDateClosed(
  date: string | undefined | null,
  dailyReports: readonly DailyReport[],
): boolean {
  const key = normalizeDateKey(date)
  if (!key) return false
  return dailyReports.some((r) => {
    const bd = normalizeDateKey(r.businessDate ?? r.date)
    return bd === key && !!r.closedAt
  })
}

/**
 * 指定営業日の最新の DailyReport を返す（複数あれば createdAt 降順で最新）。
 * 締め状態の表示や reopen 操作の対象選択に使う。
 */
export function findLatestDailyReport(
  date: string | undefined | null,
  dailyReports: readonly DailyReport[],
): DailyReport | null {
  const key = normalizeDateKey(date)
  if (!key) return null
  const matches = dailyReports
    .filter((r) => normalizeDateKey(r.businessDate ?? r.date) === key)
    .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
  return matches[0] ?? null
}

/** UI バッジ表示用の状態ラベル。
 *  - 'closed':    closedAt あり = 締め済み
 *  - 'reopened':  closedAt なし + reopenedAt あり = 解除済み (再度ロック解除)
 *  - 'open':      該当日のレポート無し = 未締め
 */
export type ClosingState = 'closed' | 'reopened' | 'open'

export function getClosingState(
  date: string | undefined | null,
  dailyReports: readonly DailyReport[],
): ClosingState {
  const r = findLatestDailyReport(date, dailyReports)
  if (!r) return 'open'
  if (r.closedAt) return 'closed'
  if (r.reopenedAt) return 'reopened'
  return 'open'
}

export function getClosingStateLabel(state: ClosingState): string {
  switch (state) {
    case 'closed':   return '締め済み'
    case 'reopened': return '解除済み'
    case 'open':     return '未締め'
  }
}

/** 締め済みのときに UI ボタンに付けるツールチップ文字列。 */
export const LOCKED_TOOLTIP =
  '締め済みのため操作できません。修正が必要な場合は管理画面から締めを解除してください。'
