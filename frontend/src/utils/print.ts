/**
 * レシート/帳票印刷用の共通ラッパー
 *
 * 現状は window.open + document.write + print() のブラウザ印刷だが、
 * 本番で EPSON TM-m30III-H に切り替える際は、この関数1つを
 * ePOS Print SDK 経由の送信に差し替えれば全レシートが対応できる。
 */

export interface PrintOptions {
  width?: number
  height?: number
  /** Additional inline CSS to inject before the body content */
  extraStyles?: string
}

const DEFAULT_STYLES = `
  body { font-family: sans-serif; padding: 8px; font-size: 11px; margin: 0; }
  h2 { text-align: center; margin: 0 0 10px; }
  table { width: 100%; border-collapse: collapse; margin: 10px 0; }
  td, th { border: 1px solid #ccc; padding: 2px 4px; text-align: right; }
  th { background: #f5f5f5; text-align: left; }
  .sign {
    margin-top: 40px;
    border-top: 1px solid #000;
    width: 200px;
    text-align: center;
    padding-top: 5px;
  }
  .center { text-align: center; }
  .right { text-align: right; }
  .muted { color: #666; font-size: 10px; }
  .bold { font-weight: bold; }
  @media print {
    @page { size: 80mm auto; margin: 0; }
    body { padding: 8px; }
  }
`

/**
 * 印刷用の新規ウィンドウを開いて HTML をレンダリング、印刷ダイアログを自動表示する。
 * @param bodyHtml <body> 内に挿入される HTML。<html>/<head>/<body> タグは不要
 * @param title ウィンドウタイトル（印刷時のドキュメント名にもなる）
 * @param options ウィンドウサイズと追加スタイル
 */
export function openPrintWindow(
  bodyHtml: string,
  title: string,
  options: PrintOptions = {},
): void {
  const { width = 300, height = 600, extraStyles = '' } = options
  const w = window.open('', '_blank', `width=${width},height=${height}`)
  if (!w) {
    // ポップアップブロックされた場合
    alert('ポップアップがブロックされました。ブラウザの設定で許可してください。')
    return
  }
  w.document.write(`<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<title>${escapeHtml(title)}</title>
<style>${DEFAULT_STYLES}${extraStyles}</style>
</head>
<body>
${bodyHtml}
</body>
</html>`)
  w.document.close()
  // 少し待ってから print() を呼ぶとレンダリングが安定する
  setTimeout(() => {
    w.focus()
    w.print()
  }, 50)
}

export function escapeHtml(s: string): string {
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
