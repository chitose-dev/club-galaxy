import type { BackType, Cast } from '../types'

/**
 * キャストのバック単価を引く共通ヘルパー（本DW 互換フォールバック付き）。
 *
 * 本DW は本D と独立した BackType だが、正式単価が店舗確認待ちのため、既存
 * データの backRates に '本DW' が未設定でも台帳 CSV 等が 0 円に落ちないよう、
 * **未設定（undefined）の時だけ** 本D の単価へフォールバックする。明示的な 0
 * は尊重する。本DW 以外の種別は従来どおり未設定 = 0 円。
 *
 * frontend 側 (frontend/src/utils/backRate.ts) と同じ規則。給与・CSV・台帳の
 * 単価がズレないよう、backRates の直読みではなくこのヘルパーを通すこと。
 */
export function getBackRate(
  backRates: Cast['backRates'] | undefined,
  type: BackType,
): number {
  const direct = backRates?.[type]
  if (direct !== undefined) return direct
  if (type === '本DW') return backRates?.['本D'] ?? 0
  return 0
}
