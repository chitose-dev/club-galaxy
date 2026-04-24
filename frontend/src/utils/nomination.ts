import type { Table } from '../data/mock'

type NominationFields = Pick<Table, 'mainNominationCastNames' | 'isDouhan' | 'isBanaiShimei'>

/**
 * 追補02 R1 / R9 + 追補03 R24 (本指名複数対応) 準拠の指名ラベル生成。
 *
 * 本指名担当が複数の場合は「本指名 あいり, みく」のようにカンマ区切りで結合。
 *
 * 優先順:
 *   1. 本指名 + 同伴 → 「本指名 あいり, みく + 同伴」
 *   2. 場内指名 + 同伴 → 「場内指名 + 同伴」
 *   3. 本指名のみ → 「本指名 あいり, みく」
 *   4. 場内指名のみ → 「場内指名」
 *   5. 同伴のみ → 「同伴」
 *   6. どれも該当しない (担当なしも含む) → 「フリー」
 */
export function getNominationLabel(table: NominationFields): string {
  const parts: string[] = []
  const names = table.mainNominationCastNames ?? []
  if (names.length > 0) {
    parts.push(`本指名 ${names.join(', ')}`)
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
export function getNominationBadge(table: NominationFields): string {
  const hasMain = (table.mainNominationCastNames ?? []).length > 0
  if (hasMain && table.isDouhan) return '本指名+同伴'
  if (hasMain) return '本指名'
  if (table.isBanaiShimei && table.isDouhan) return '場内+同伴'
  if (table.isBanaiShimei) return '場内指名'
  if (table.isDouhan) return '同伴'
  return 'フリー'
}

/**
 * 本指名担当が 1 名以上設定されているか。
 */
export function hasMainNomination(
  table: Pick<Table, 'mainNominationCastNames'>,
): boolean {
  return (table.mainNominationCastNames ?? []).length > 0
}

/**
 * 本指名担当の先頭 1 名を返す (単一値が必要な箇所用の後方互換ヘルパ)。
 * 複数いる場合は最初に登録された 1 名のみ。
 */
export function getPrimaryNominationName(
  table: Pick<Table, 'mainNominationCastNames'>,
): string | undefined {
  return table.mainNominationCastNames?.[0]
}
