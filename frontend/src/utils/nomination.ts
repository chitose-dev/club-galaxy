import type { Table } from '../data/mock'

/**
 * 追補02 R1 / R9 準拠の指名ラベル生成。
 *
 * 旧実装では `Table.nomination` (排他 4 択) で単一ラベルを出力していたが、
 * 追補02 で「本指名担当 (固定) + 同伴 + 場内指名」の組み合わせ表示が必要になった。
 *
 * 優先順:
 *   1. 本指名 + 同伴 → 「本指名 あいり + 同伴」
 *   2. 場内指名 + 同伴 → 「場内指名 + 同伴」
 *   3. 本指名のみ → 「本指名 あいり」
 *   4. 場内指名のみ → 「場内指名」
 *   5. 同伴のみ → 「同伴」
 *   6. どれも該当しない (担当なしも含む) → 「フリー」
 */
export function getNominationLabel(
  table: Pick<Table, 'mainNominationCastName' | 'isDouhan' | 'isBanaiShimei'>,
): string {
  const parts: string[] = []
  if (table.mainNominationCastName) {
    parts.push(`本指名 ${table.mainNominationCastName}`)
  } else if (table.isBanaiShimei) {
    parts.push('場内指名')
  }
  if (table.isDouhan) parts.push('同伴')
  if (parts.length === 0) parts.push('フリー')
  return parts.join(' + ')
}

/**
 * 画面下部のバッジ等、省略形が必要な場所用の短縮ラベル。
 * 例: 「本指名」「場内」「同伴」「フリー」
 */
export function getNominationBadge(
  table: Pick<Table, 'mainNominationCastName' | 'isDouhan' | 'isBanaiShimei'>,
): string {
  if (table.mainNominationCastName && table.isDouhan) return '本指名+同伴'
  if (table.mainNominationCastName) return '本指名'
  if (table.isBanaiShimei && table.isDouhan) return '場内+同伴'
  if (table.isBanaiShimei) return '場内指名'
  if (table.isDouhan) return '同伴'
  return 'フリー'
}

/**
 * 本指名担当が設定されているかどうか。
 * 売上・バック帰属の判定に使う。
 */
export function hasMainNomination(
  table: Pick<Table, 'mainNominationCastName'>,
): boolean {
  return !!table.mainNominationCastName
}
