import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 各ページの render 例外を捕捉してアプリ全体のアンマウントを防ぐ。
 * 本番ビルドだと console error が出ても画面は真っ白になるため、フォールバック UI で
 * ユーザーが操作不能にならないようにする。
 *
 * 使い方: <ErrorBoundary><Layout /> ... </ErrorBoundary> のように Routes 全体をラップする。
 * onReset で「ホールへ戻る」等の遷移を渡すと、ボタン押下時に state をリセット + 任意処理。
 */
interface Props {
  children: ReactNode
  /** リセット時に追加で実行する callback (例: ホール画面に navigate) */
  onReset?: () => void
}

interface State {
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 本番でも握り潰さず console には出す。Sentry 等の連携はここで追加する想定。
    console.error('[ErrorBoundary] render crashed:', error, info)
  }

  handleReset = () => {
    this.setState({ error: null })
    this.props.onReset?.()
  }

  render() {
    if (this.state.error) {
      return (
        <div className="fixed inset-0 bg-gray-900 flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            <h1 className="text-xl font-bold text-red-400 mb-3">エラーが発生しました</h1>
            <p className="text-gray-400 text-sm mb-6">
              画面の表示中に問題が発生しました。<br />
              続く場合は管理者へ連絡してください。
            </p>
            <button
              onClick={this.handleReset}
              className="px-6 py-3 bg-white text-black rounded-lg font-bold"
            >
              ホールへ戻る
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
