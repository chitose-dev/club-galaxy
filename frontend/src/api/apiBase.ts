// API 接続先（バックエンド URL）の解決を 1 か所に集約する。
//
// 以前は各所で `VITE_API_BASE_URL ?? '<本番 Cloud Run URL>'` と本番へ
// フォールバックしていた。この既定値のせいで、ローカル開発でも env を
// 設定し忘れるとブラウザが本番へ書き込んでしまう事故が起きた。再発防止の
// ため、本番 URL への暗黙フォールバックは廃止し、次のルールに一本化する:
//
//  - `VITE_API_BASE_URL` が明示されていればそれを使う（末尾スラッシュ除去）。
//    本番デプロイはビルド時にこれを必ず設定する。
//  - 未設定 かつ dev（`import.meta.env.DEV`）: 空文字（相対 URL）を返す。
//    リクエストは `/api/...` の相対パスとなり、vite の proxy 設定
//    （`/api` → `http://localhost:3001`）経由でローカル backend に届く。
//    ローカルから本番へは決して飛ばさない。
//  - 未設定 かつ 本番ビルド: 接続先不明のまま動かすと誤接続事故になるため、
//    使用時に明示的なエラーにする（サイレントに本番等へ繋がない）。

let devNoticeShown = false

/**
 * 現在の環境に応じた API ベース URL を返す。
 * 呼び出しは fetch の直前（モジュール初期化時ではなく使用時）に行うこと。
 * 本番ビルドで未設定の場合はここで throw する（アプリ全体の白画面化を避け、
 * 各 API 呼び出しのエラーとして表面化させるため）。
 */
export function resolveApiBase(): string {
  const explicit = (import.meta.env.VITE_API_BASE_URL ?? '').trim()
  if (explicit) return explicit.replace(/\/+$/, '')

  if (import.meta.env.DEV) {
    if (!devNoticeShown) {
      // 未設定時にどこへ繋いでいるか分かるようにする（本番でないことの明示）。
      console.info(
        '[api] VITE_API_BASE_URL 未設定: dev proxy（/api → http://localhost:3001）を使用します。' +
        '本番 URL へのフォールバックは行いません。',
      )
      devNoticeShown = true
    }
    return ''
  }

  throw new Error(
    'VITE_API_BASE_URL が未設定です。本番ビルドでは接続先バックエンド URL を明示してください' +
    '（誤接続防止のため、既定の本番フォールバックは廃止されています）。',
  )
}
