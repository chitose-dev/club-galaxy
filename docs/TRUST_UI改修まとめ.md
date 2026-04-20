# TRUST POS 風 UI/UX 改修まとめ

ナイトレジャー特化 POS「TRUST」(`admin.trust-dk.com`)の動画・UI 分析を踏まえ、
CLUB GALAXY フロントエンドのレイアウト・導線を TRUST 準拠に刷新した。

- **配色**: 既存の黒 (#1a1a2e) + ゴールド (#d4af37) + 赤 (#e94560) を維持
- **端末想定**: Galaxy Tab S10 FE+ / 横持ち推奨・縦持ち許容
- **業務ロジック**: `store.tsx` および各種計算 (FL / TAX 20% / 消費税 10% / カード手数料 / 値引き監査ログ) は**完全に非改変**

---

## 1. 基盤整備

| 対象 | 変更内容 |
|---|---|
| `vite.config.ts` | PWA `orientation: 'portrait'` → `'any'` |
| `index.css` | デザイントークン追加 (`--color-gold-grad-from/to`, `--shadow-bevel`, `--radius-lg/xl`) |
| `index.css` | ユーティリティクラス追加 (`.btn-gold` / `.btn-danger` / `.btn-dark` / `.btn-ghost` / `.panel` / `.panel-gold` / `.nav-badge` / `.cast-chip`) |
| `index.css` | `@media print` に `body.print-summary-mode .print-detail-lines { display: none }` を追加 (明細なし印刷) |
| `Layout.tsx` | 下部 7 タブ Bottom Nav を撤廃し、右上 5 アイコンの `<GlobalNavBar />` に置換。`<Clock />` 常時表示。各ページが `<BottomActionBar />` を自前で差し込む構造に |

## 2. 共通コンポーネント新規作成 (`src/components/`)

| ファイル | 役割 |
|---|---|
| `Clock.tsx` | `HH:MM` を 1 秒更新で表示 |
| `BackButton.tsx` | ゴールド角丸の「戻る」ボタン |
| `Buttons.tsx` | `GoldButton` / `DangerButton` / `DarkButton` / `GhostButton` — デバウンス内蔵でダブルクリック防止 |
| `GlobalNavBar.tsx` | 右上 5 アイコン (ホール/注文/待機/設定/トップ)。権限フィルタ + バッジ (超過卓数・待機キャスト数) |
| `BottomActionBar.tsx` | 左=金額、中央=主アクション、右=補助アクションの下部固定バー |
| `ContextualHeader.tsx` | 「← 戻る / タイトル / 右スロット」の下層画面用サブヘッダ |
| `CastChip.tsx` | キャスト名チップ (選択状態ゴールド枠) |
| `NumberPad.tsx` | 会計・値引き用テンキー |
| `PrintMethodModal.tsx` | 「明細あり / 明細なし / キャンセル」印刷選択モーダル |

## 3. 画面別リファクタ

### 3.1 `TopPage.tsx` (新規 `/top`)

- ログイン後のデフォルト遷移先 (owner/staff は `/top`、cast は `/salary`)
- 本日売上の赤帯 + 中央に「会計管理をはじめる」大ボタン + クイックアクショングリッド

### 3.2 `FloorPage.tsx` リファクタ

- 既存のアラート色 (超過=赤 / 10 分前=黄) を維持
- 下部に `BottomActionBar` を追加 (本日売上 / 使用中卓数 / 利用明細・待機キャストへの遷移)
- 既存の入店モーダル / 延長モーダル / 付け回し支援を温存 (分割せず統合のまま運用)

### 3.3 `WaitingCastPage.tsx` (新規 `/waiting`)

- 縦リスト: アバター(イニシャル)/ 出勤トグル / 編集・削除 / 源氏名 / 待機時間
- 並び替え: カスタム順 ⇔ 待機時間順
- `CastEditModal` で追加・編集

### 3.4 `UsageDetailPage.tsx` (新規 `/table/:id`)

- 卓の指名状況・セット料金・注文明細を一覧表示
- 注文行の削除が可能
- 下部アクション: 注文追加 / 会計へ

### 3.5 `OrderPage.tsx` 全面刷新 (4 カラム)

- カテゴリー列 (全商品/キャストドリンク/ショット・ピッチャー/シャンパン/ウイスキー/焼酎/ブランデー/ワイン/チャージ/ボトル)
- メニュー列 (注文中数量バッジ付きタイル)
- 「誰に」列 (お客さま/スタッフタブ + `<CastChip>`)
- 注文明細列 (+/-/削除 + 小計・合計)
- ダブルクリック防止内蔵、キャストメニューは担当未選択時アラート
- 下部: 合計帯 / 利用明細へ (赤) / 注文印刷 (ダーク)

### 3.6 `BillingPage.tsx` 全面刷新 (2 カラム)

- 上部に中央ゴールド帯で **合計 (お支払い額)** を表示
- 左列: 明細内訳 / 支払方法 (現金・カード・現金+カード) / 値引き
- 右列: カード手数料注記 / 割り勘アシスト / 合算会計 / 領収書情報
- 値引き理由プリセット: **端数カット / VIP値引 / 店長承認 / クーポン / その他** + 自由記入
- **値引き額 > 0 で理由空欄時は「会計確定」ボタンが無効化** (CLAUDE.md 監査要件)
- 完了後は `<PrintMethodModal>` で明細あり/なしを選択 → `body.print-summary-mode` クラスで切替

### 3.7 `SalaryPage.tsx` / `ProfitPage.tsx` / `RegisterPage.tsx` / `AdminPage.tsx`

- 共通の `<ContextualHeader>` を付与してレイアウトを統一
- Profit はヘッダー右にウィジェット (本日利益 + FL%) を常時表示 (md 以上)
- 機能・計算ロジックはそのまま維持

## 4. ルーティング (`App.tsx`)

新規ルート:

- `/top` (owner/staff/cast)
- `/waiting` (owner/staff)
- `/table/:id` (owner/staff)

`defaultRoute` を owner/staff は `/top`、cast は `/salary` に変更。

## 5. 非改変領域

- `src/store.tsx` (Zustand・FL 計算・売上集計・監査ログ)
- `src/utils/print.ts`, `src/utils/castLedger.ts`, `src/utils/paymentDate.ts`
- レジ締め / 給与計算 (時給+バック vs 売上保証率) / 税理士出力 (CSV/Excel) / キャスト日経表
- `src/data/mock.ts` の型・サンプルデータ
- レシートテンプレ (カード手数料を客用領収書に印字しない CLAUDE.md 要件は維持)

## 6. 検証

| 項目 | 結果 |
|---|---|
| `tsc --noEmit` | ✅ エラー無し |
| `vite build` | ✅ 成功 (CSS 42.33 kB / JS 491.49 kB gzip 127 kB) |
| ESLint | 既存ルール踏襲 (新規警告なし) |
| ブラウザ手動テスト | 実機ブラウザ検証は運用担当側で要実施 (`cd frontend && npm run dev`) |

## 7. スコープ外

- Claude API「AI司令塔」(Phase 2 構想)
- EPSON TM-m30III-H 実機連携 (現状 `window.print()` のまま)
- TRUST の Web 管理画面完全再現 (Admin はヘッダー統一のみ)
- マルチ店舗切替 (Heaven's Garden 単店舗のまま)
