import type { BackType, Cast } from '../data/mock'

/**
 * キャストのバック単価を引く共通ヘルパー（本DW 互換フォールバック付き）。
 *
 * 本DW は本D と独立した BackType だが、正式単価が店舗確認待ちのため、既存
 * キャストの backRates に '本DW' が未設定でも給与・CSV・台帳が 0 円に落ちない
 * よう、**未設定（undefined）の時だけ** 本D の単価へフォールバックする。
 * 管理画面で明示的に 0 を設定した場合は 0 を尊重する（0 はフォールバック
 * しない）。本DW 以外の種別は従来どおり未設定 = 0 円。
 *
 * 給与計算・明細表示・税理士 CSV・キャスト台帳が同じ単価を見るよう、
 * `backRates[type] ?? 0` の直読みではなく必ずこのヘルパーを通すこと
 * （backend 側は backend/src/lib/backRate.ts に同じ規則の実装がある）。
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
