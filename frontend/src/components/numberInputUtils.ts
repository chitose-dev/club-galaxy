/**
 * NumberInput の数値確定ロジック (React 非依存の純関数)。
 *
 * emit (入力中) と blur (確定) の双方が同じ clamp を通すことで、表示値と
 * onChange に渡る値が確定時にズレないようにする。保証率のような上限付き
 * フィールドで「max=1 に 5 を入れても 5 のまま確定」してしまう事故を防ぐ。
 */

export interface NumberClampOptions {
  min?: number
  max?: number
  /**
   * 整数前提フィールドか。時給/休憩分/バック単価/値引きなど step が整数の
   * フィールドは true (小数入力を整数化する)。保証率など小数刻み (step=0.05) は
   * false で小数を維持する。
   */
  integerOnly: boolean
}

/**
 * 整数化 (整数フィールドのみ) → min/max クランプ。確定処理の単一の真実。
 * 整数化は旧 parseInt 互換の切り捨て (0 方向) で、勝手な四捨五入を避ける
 * (例: 時給 2500.99 → 2500、四捨五入の 2501 にしない)。
 */
export function clampNumber(n: number, { min, max, integerOnly }: NumberClampOptions): number {
  let v = integerOnly ? Math.trunc(n) : n
  if (min !== undefined && v < min) v = min
  if (max !== undefined && v > max) v = max
  return v
}

/**
 * 整数部の先頭ゼロを 1 つに畳む。
 *   "007" → "7" / "00" → "0" / "00.5" → "0.5" / "0.5" → "0.5" / "10" → "10"
 * 小数点直前の単独 0 や符号は保持する。
 */
export function stripLeadingZeros(raw: string): string {
  return raw.replace(/^(-?)0+(\d)/, '$1$2')
}

/**
 * 表示文字列を確定値へ解決する。空文字 / 数値化不能 (NaN・Infinity) は null。
 * 中間入力 ("2500." など) は Number() が解釈できる限り有効値として扱い、
 * 不用意に emptyValue (0) へ落とさない。
 */
export function parseNumberInput(raw: string, opts: NumberClampOptions): number | null {
  if (raw.trim() === '') return null
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  return clampNumber(n, opts)
}
