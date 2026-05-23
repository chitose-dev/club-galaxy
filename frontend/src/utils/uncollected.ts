/**
 * 未収判定の共通ヘルパー。
 *
 * 未収の表現は 2 系統あり、両方に対応する必要がある:
 *
 * 1. 旧スキーマ (force checkout 流入)
 *    - `isUncollected: true` がセットされ、`uncollectedStatus` が後付け
 *    - 'recovered' 以外を「未収扱い」とする
 *
 * 2. 新スキーマ (PDF/Word 第2弾「管理画面から明示登録」)
 *    - 「空き卓にする」廃止後、未収は管理画面から明示登録する
 *    - バックエンド patch では `isUncollected` を変更できないため、
 *      `uncollectedStatus: 'pending'` だけで「未収扱い」を表現する
 *    - 'written_off' も「確定未収」= 未収扱い
 *
 * いずれの場合も売上集計 (RegisterPage 締め画面、ProfitPage 等) から
 * 除外する必要がある。
 */

import type { BillingRecord } from '../data/mock'

/** 未収（売上集計から除外すべき状態）かどうか。 */
export function isUncollectedActive(r: BillingRecord): boolean {
  if (r.uncollectedStatus === 'recovered') return false
  if (r.uncollectedStatus === 'pending' || r.uncollectedStatus === 'written_off') return true
  return !!r.isUncollected
}
