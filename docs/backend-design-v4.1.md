# CLUB GALAXY バックエンド設計書（Rev.4.1 — ハク版/ホーク版マージ + クロウレビュー反映版）

> 作成: 2026-04-30 ホーク (Claude Opus 4.7)
> 改訂対象: Rev.4 ハク版 (`backend-design.md` 79KB / 1627 行) + Rev.4 ホーク版 (`backend-design-v4.md` 65KB / 1456 行) の並行下書き 2 本
> 改訂主旨: 両版マージ統合 + クロウレビュー 6 件反映 + Rev.3.1 → Rev.4.1 の差分明示
> 位置付け: Rev.4 系の最終確定版。Rev.4 ハク版 / ホーク版は比較用に残置。

---

## §0. 変更履歴 (Rev.4 → Rev.4.1)

### 0.1 マージ統合事項（Rev.4 並行下書きの統合）

| # | 取込元 | 内容 |
|---|---|---|
| M1 | ハク版 §3.2.5 | `BillingRecord` フィールド命名統一 — `subtotalBeforeTax` / `serviceChargeAmount`（旧 `taxAmount`、UI 表記は「TAX」維持）/ `consumptionTaxAmount` / `total` |
| M2 | ハク版 §3.2.5 | `nominatedCastIds: number[]`（複数本指名対応の射影フィールド）+ `castSnapshot: {id,name,realName?}[]` 二段持ち |
| M3 | ハク版 §3.2.5 | 領収書再発行 — `reissueParentId` + `reissueIndex` 形式（上限 20 で打ち切り）+ `'000123-2'` 表示 |
| M4 | ハク版 §3.2.5 | 合算会計の shadow レコード方式 — `primaryBillingId` + `mergedBillingIds[]` で各構成卓に shadow を作り、売上帰属を保つ |
| M5 | ハク版 §3.2.1 | `OrderEmbedded.splitCastIds[]` をシャンパンセッパン用スナップショットとして注文確定 transaction 内で焼く（**会計時起点ではない**） |
| M6 | ハク版 §4.x | シャンパンセッパン適用条件: `subcategory='champagne'` AND `StoreSettings.champagneSplitThreshold = 20000` 以上 AND `mainNominationCastNames.length >= 2`（焼酎は除外、クロウ④指摘反映） |
| M7 | ハク版 §3.2.x | `OrderItem.bonusCastName` / `bonusAmount` 採用 + `StoreSettings.maxBonusRatePerOrder = 0.3`（既定 30%）で上限ガード |
| M8 | ハク版 §4.x | Help料は卓全体売上扱い（本指名キャストの個人売上には加算しない）。`backType==='ヘルプ'` は売上加算スキップ・バック額のみ加算 |
| M9 | ハク版 §4.x | 本指名複数時の売上分配 = **均等割**で確定（重み付けは将来用にスキーマ余地のみ残す、YAGNI 原則） |
| M10 | ハク版 §3.2.x | `MenuCategory.allowsBottleKeep: boolean` 追加（シャンパン系既定 false。ボトルキープ可否を明示制御） |
| M11 | ハク版 §3.2.7 + §x | `AttendanceSchedule` + Cloud Function `processSchedules`（1 分 cron）で自動打刻 |
| M12 | ハク版 §3.2.3 | `UserAccount` を判別ユニオン型 + Zod バリデーションで定義（role='cast' で castId 必須、staff で hourlyRate 必須、owner はどちらも未許可） |
| M13 | ホーク版 §3.5 | `TableStatus.settled` = 単独/合算問わず会計完了後の終了処理状態 |
| M14 | ハク版 §x | `DailyWork` (id: `${castId}_${businessDate}`) は集計キャッシュ。再出勤時は当該 businessDate 全件を**再計算で上書き保存**（差分加算ではない） |
| M15 | ハク版 §x | `dailyAggregates` は **transaction 同梱で更新**（Cloud Functions の eventually consistent は給与計算根拠には致命的） |
| M16 | ハク版 §x | `POST /billings/:id/void` 時に `dailyAggregates` を decrement、`reissueParentId` チェーン遡及で親 billing の影響も相殺（税務調査対策） |
| M17 | ハク版 §x | `metadata/billing` (singleton) で `nextReceiptNumber` アトミック採番 |
| M18 | ハク版 §x | `/api/billing/merge` / `/api/billing/split-bill` を独立エンドポイント化 |
| M19 | ハク版 §x | `/api/auth/heartbeat`（5 分間隔）で idle 更新 |
| M20 | ハク版 §x | キャスト本人閲覧で `?castId=X` クエリは無視（**横移動防止**） |
| M21 | ハク版 §x | アーカイブ後は **read-only 表示 + CSV/PDF 出力のみ**（再アクティブ化 = `archivedAt` を null に戻す機能はやらない、不正温床） |
| M22 | ハク版 §x | 延長料金 = **人数連動** (`fullSetCharge × 人数`)。旧固定額（30 分=1000 円 / 60 分=3000 円）は破棄 |
| M23 | ハク版 §x | 延長中も本指名バック継続（時間延長であって指名再開ではない） |
| M24 | ハク版 §x | エラーハンドラ擬似コード明記 — `throwInvalidCredentials()` / `throwLocked(lockedUntil ISO 8601)` 等 |
| M25 | ハク版 §x | `StoreSettings.legalWithholdingConfirmed` フラグ + `LEGAL_WITHHOLDING_NOT_CONFIGURED` 例外で物理ガード。フリップは owner のみ、`/admin/payroll-settings` 経由、監査ログ `LEGAL_WITHHOLDING_CONFIRMED` に「税理士名 / 確認日 / 確認内容スナップショット PDF」必須添付 |
| M26 | 構成 | §14 = コードタスク優先順位 / §15 = 外部依頼事項（税理士確認 8 項目 + サービス料課税ベース論点）の分離（クロウ⑧反映） |

### 0.2 クロウレビュー 6 件の反映（適用箇所付き）

| # | 重大度 | 指摘内容 | 適用箇所 |
|---|---|---|---|
| 🔴 R1 | 致命 | `OrderItem` に `id` がなく `orderKey` が未定義 → 配列インデックスは不安定。`OrderEmbedded.items[].id: number` を追加し注文確定 transaction 内で連番採番 | §3.2.1 OrderEmbedded、§4.x 注文 tx |
| 🔴 R2 | 致命 | JWT payload に `jti` が含まれていない → idle 管理の `sessions/{jti}` 参照が機能しない。`crypto.randomUUID()` で発行、ログイン時に Firestore へ書込 | §3.2.x sessions、§6.1 PIN 認証、§6.3 idle 失効 |
| 🟡 R3 | 重要 | レート制限の文言矛盾 — 「5 回/分」と「5 回失敗で 5 分ロック」の説明が衝突 | §1.2 / §6.1 / §7 から「5 回/分」表記を削除し、「PIN 失敗 5 回で 5 分ロック、10 回で 30 分、15 回で 24 時間」を真として統一 |
| 🟡 R4 | 重要 | `boundaryHour` 6→5 の修正は FE / BE 同時デプロイが必要（順序ミスで営業日ズレ） | §14 P0 タスクに「FE・BE 順序付きデプロイ手順」を追記。`StoreSettings.businessDayCutoffHour` を FE 側でも一時的に読ませて移行期間を持たせる案を併記 |
| 🔵 R5 | 改善 | `GET /api/billing/records` に `?includeVoided=true` が未定義（export-csv には存在）— 通常一覧で void 済みを除外するかどうかのデフォルト動作が不明 | §5.6 / §6 で正式定義。デフォルト除外で `?includeVoided=true` 追加 |
| 🔵 R6 | 改善 | Cloud Functions の 1 分精度リスク — Cold Start で数十秒遅延の可能性、自動打刻の精度劣化 | §18.2 に「許容誤差±数分、cron 発火は表示ヒント、`clockIn` はサーバ算出を真とする」と明記 |

### 0.3 Rev.3.1 → Rev.4 → Rev.4.1 ハイレベル差分

| 区分 | Rev.3.1 → Rev.4 (両下書き共通) | Rev.4 → Rev.4.1 (本版) |
|---|---|---|
| Table 指名モデル | `castNames[]` + `nomination` 単数 enum 廃止 → `assignedCasts[]` (動的) + `mainNominationCastNames[]` (固定・複数) + `isDouhan/isBanaiShimei` フラグ | 変更なし（両下書き合意） |
| BackType | 11 種 → 17 種拡張 | 変更なし |
| OrderItem | `bonusCastName`/`bonusAmount` 追加 | **`id: number` 必須化**（クロウ R1） |
| 給与計算式 | `(時給+バック)×0.9 − 日払 − 天引` 確定、深夜割増・独自10%控除廃止 | `legalWithholdingConfirmed` ガードで物理阻止（M25） |
| 時給 | ルーズタイム 15 分 + 15 分単位切上 | 変更なし |
| businessDate cutoff | 5 時に統一（FE 6 時はバグ） | **同時デプロイ手順を §14 P0 に明記**（クロウ R4） |
| AttendanceRecord | ISO 8601 + workMinutes 化 | 変更なし |
| AttendanceSchedule | 新設 | サーバ自動打刻の許容誤差を §18.2 明記（クロウ R6） |
| MenuCategory | 新設 | `allowsBottleKeep` 追加（M10） |
| ReceiptSnapshot | フロント詳細形へ再定義 | `storeNameSnapshot` 等のスナップ拡張（M2 派生） |
| BillingRecord | `voidedAt` 系追加 | フィールド命名統一（M1）+ `nominatedCastIds[]`（M2）+ 再発行 `reissueIndex` 上限20（M3）+ shadow 合算（M4）+ `archivedAt`（M21） |
| 監査ログ | 全 mutation 必須 | エラーハンドラ擬似コード明記（M24） |
| JWT | 12h 有効 + idle 30 分 | **`jti` 必須化**（クロウ R2）+ `sessions/{jti}` Firestore 書込 + `/api/auth/heartbeat` 5 分（M19） |
| PIN | bcrypt | 段階ロック 5/30/24（5 回 5 分 / 10 回 30 分 / 15 回 24 時間）— クロウ R3 で文言統一 |
| アーカイブ | 物理削除禁止 / `archivedAt` フラグ | **再アクティブ化なし、read-only + CSV/PDF 出力のみ**（M21） |
| シャンパンセッパン | 本指名複数時 | **注文時起点**で確定（M5）+ `champagneSplitThreshold=20000` + `subcategory='champagne'` 限定（M6） |
| 延長料金 | 30/60 分固定額 | **人数連動 `fullSetCharge × 人数`**（M22）+ 本指名バック継続（M23） |

### 0.4 残置・棄却された Rev.4 案

- ハク版「JWT 15 分 + リフレッシュトークン 7 日」案 → **棄却**。共有端末の運用上 12 時間有効 + idle 30 分 + heartbeat 5 分（ホーク版採用）の方が実運用に合致
- ホーク版「フロント `getBusinessDay` cutoffHour=6 を 5 に修正してから API 化」 → **採用**（クロウ R4 で同時デプロイ手順を併記）
- ハク版「Phase 2 で Firebase Auth カスタムトークン経由」案 → **将来検討**として §13.2 に残置、Phase 1 では Express 経由のみ

---

## §1. 設計方針

### 1.1 原則

1. **フロントが真**: `frontend/src/data/mock.ts` の型 + `utils/*` の計算ロジックを仕様の最終確定状態として扱い、バックエンドはこれに合わせる
2. **計算は段階的にサーバー移行**: フロント `utils/*` を「同等関数」としてサーバーに移植、API レスポンスでサーバー算出値を返し、フロント差し替え時に整合性確認
3. **金銭関連は不変・追跡可能**: 監査フィールド + soft-delete + 監査ログ。物理削除禁止、`archivedAt` フラグのみ
4. **日付またぎは `businessDate`** で正規化、**サーバー側で焼く**（クライアント送信値は信用しない）
5. **エラーフォーマット統一**:
   ```ts
   interface ErrorResponse { error: string; message: string; details?: unknown }
   ```
6. **mutation は監査ログと同一 transaction**: `auditLogs` への書き込み失敗時は本体操作も rollback。fire-and-forget は禁止
7. **税理士確認前のデプロイ阻止**: 給与計算の係数群（深夜割増・独自10%控除等）は廃止。法定源泉税は `StoreSettings.legalWithholdingConfirmed` フラグ off 既定 + `LEGAL_WITHHOLDING_NOT_CONFIGURED` 例外で物理阻止
8. **マルチ店舗**: `stores/{storeId}/...` で切る。MVP は `default` 店舗（Heaven's Garden）のみ稼働、API は最初から `storeId` を受ける形

### 1.2 技術スタック

- Express 5 + TypeScript 5.9
- Firebase Admin SDK (Firestore Native mode)
- 自前 JWT (HS256, 12h 有効、`jti` 必須) + 共有端末向け **30 分無操作で失効** (idle expiry) + heartbeat 5 分間隔
- PIN は **bcrypt ハッシュ (cost=10)**
- **PIN ロック方針（クロウ R3 反映で文言統一）**:
  - 連続失敗 **5 回で 5 分ロック**
  - 連続失敗 **10 回で 30 分ロック**
  - 連続失敗 **15 回で 24 時間ロック**（オーナーリセット必須）
  - username ベース（店舗 LAN で共有 IP のため、IP 単位ではなく account 単位）
  - ※ Rev.4 までの「5 回/分」レート制限表記は誤りとして全削除
- Sensitive 操作（会計確定 / void / 給与閲覧 / archive 操作 / 法定源泉確認フラグ）はステップアップ認証で PIN 再入力強制
- Node.js 20 LTS

### 1.3 Firestore 採用根拠（Rev.4 ハク版・ホーク版両者で合意）

集計・JOIN・税務 CSV 出力が要件の柱だが、本店舗の規模（卓 10 / 同時同接 3-4 / 月次会計レコード〜数千件）であれば **Firestore で十分**:

- 月次集計は `dailyAggregates` キャッシュ（transaction 同梱で更新、M15）で Firestore の弱点を回避
- CSV 出力は月次バッチで全量読みすればよい（数千件レベル）
- マルチ店舗展開時もコレクション分割でスケール可能
- リアルタイム同期（`onSnapshot`）でタブレット間状態共有 — Phase 2 で解禁

**結論**: Firestore 継続。`payroll/calculate` と `metrics/fl/monthly` で限界を感じたら Cloud SQL（Postgres ETL）または BigQuery 連携を Phase 3 で再評価。

---

## §2. 技術スタック詳細

| レイヤ | 技術 | 備考 |
|---|---|---|
| ランタイム | Node.js 20 LTS | Dockerfile 既定 |
| フレームワーク | Express 5 + TypeScript 5.9 | 既存 `backend/` を流用 |
| DB | Firestore (Native mode) | `stores/{storeId}` 配下 |
| 認証 | 自前 JWT (HS256, 12h, `jti` 必須) + idle 30 分 + heartbeat 5 分 | bcrypt(10) |
| バリデーション | Zod | 全 mutation 入力 + UserAccount 判別ユニオン |
| 印刷 | EPSON ePOS Print SDK (フロント側で直接呼ぶ) | バックエンドは印刷データ JSON のみ返す |
| デプロイ | Cloud Run (バックエンド) / Cloud Run (フロント PWA) | gcloud CLI |
| 集計補助 | Cloud Functions (Firestore Trigger) | `processSchedules` 自動打刻 (1 分 cron、§18.2 で精度許容誤差明記) |
| Phase 2 AI 連携 | Anthropic SDK (Claude Sonnet) | `aiAdvisorLogs` / `aiShiftRecommendations` 履歴保存 |

### 2.1 ディレクトリ構成（バックエンド）

```
backend/
├── src/
│   ├── index.ts                        # Express bootstrap + ルーター登録
│   ├── firebase.ts                     # Firebase Admin 初期化
│   ├── types.ts                        # Rev.4.1 型定義（domain）
│   ├── seed.ts                         # フロント mock.ts 互換初期データ
│   ├── middleware/
│   │   ├── auth.ts                     # JWT 検証 + jti session lookup + requireRole + idle 失効
│   │   └── error.ts                    # ErrorResponse 統一フォーマット
│   ├── lib/
│   │   ├── businessDate.ts             # toBusinessDate (cutoffHour=5) + nowJstIso
│   │   ├── errors.ts                   # ApiError + throw helpers (throwInvalidCredentials/throwLocked/...)
│   │   ├── audit.ts                    # appendAuditLog (transaction 内呼び出し)
│   │   ├── sessions.ts                 # createSession/touchSession/revokeSession + newJti
│   │   ├── pagination.ts               # cursor encode/decode
│   │   ├── receipt.ts                  # receiptNumber アトミック採番 (transaction)
│   │   ├── pricing.ts                  # set price / TAX / カード手数料 / 値引き計算
│   │   ├── payroll.ts                  # 給与計算 (15分単位 + ルーズタイム + 0.9 係数)
│   │   ├── champagneSplit.ts           # シャンパンセッパン
│   │   └── salesAttribution.ts         # 売上帰属 (本指名複数の均等割含む)
│   ├── routes/
│   │   ├── auth.ts                     # login/logout/heartbeat/users CRUD
│   │   ├── tables.ts                   # Table CRUD + orders + extensions + move-cast
│   │   ├── casts.ts                    # Cast CRUD
│   │   ├── menu.ts                     # MenuCategory + Guest/Cast/Set/Charge
│   │   ├── billing.ts                  # records + void + reissue + merge + split-bill + discounts
│   │   ├── bottles.ts                  # BottleKeep CRUD
│   │   ├── payroll.ts                  # calculate + payment-dates + daily-payments + deductions + daily-work
│   │   ├── salary.ts                   # /me 自己給与
│   │   ├── attendance.ts               # records + schedules
│   │   ├── expenses.ts                 # Expense CRUD
│   │   ├── advances.ts                 # AdvancePayment CRUD
│   │   ├── daily-reports.ts            # 締め tx + reopen
│   │   ├── metrics.ts                  # FL + sales/calendar + cast/monthly
│   │   ├── settings.ts                 # StoreSettings
│   │   ├── export.ts                   # CSV + 日経表 PDF
│   │   ├── archive.ts                  # archivedAt フラグ操作 (read-only + 出力のみ)
│   │   └── audit.ts                    # AdminPage 監査ログビューア用
│   └── jobs/
│       └── processSchedules.ts         # Cloud Function (1 分 cron) 自動打刻
├── tests/
│   ├── unit/                           # pricing / payroll / businessDate
│   └── integration/                    # Firestore Emulator + supertest
├── firestore.indexes.json
├── firestore.rules
└── package.json
```

---
## §3. データモデル（Firestore コレクション）

### 3.1 コレクション全体図（15 コレクション + サブ）

```
firestore
└── stores/{storeId}                            # マルチ店舗対応 (default = Heaven's Garden)
    ├── tables/{id}                             # 卓状態 (即時)
    ├── casts/{id}                              # キャスト
    ├── userAccounts/{username}                 # ログインアカウント
    ├── sessions/{jti}                          # JWT セッション (idle 管理) ★ Rev.4.1 追加
    ├── menuCategories/{id}                     # メニューカテゴリ
    ├── guestMenuItems/{id}
    ├── castMenuItems/{id}
    ├── setPrices/{id}
    ├── chargeItems/{id}
    ├── billingRecords/{id}                     # void/refund/reissue/合算 + receiptSnapshot
    ├── discountLogs/{id}                       # append-only
    ├── dailyPayments/{id}
    ├── deductions/{id}
    ├── advancePayments/{id}
    ├── expenses/{id}
    ├── attendanceRecords/{id}
    ├── attendanceSchedules/{id}                # 事前出勤予定
    ├── castMoveLogs/{id}                       # キャスト移動履歴
    ├── bottleKeeps/{id}
    ├── dailyWork/{castId}_{businessDate}       # 集計キャッシュ (上書き保存、M14)
    ├── dailyReports/{businessDate}
    ├── dailyAggregates/{businessDate}          # FL 指標キャッシュ (tx 同梱更新、M15)
    ├── auditLogs/{id}                          # 全 mutation
    ├── archivedRefs/{id}                       # アーカイブ履歴メタ
    ├── settings/main                           # StoreSettings (singleton)
    └── metadata/billing                        # nextReceiptNumber アトミックカウンタ (M17)
```

### 3.2 共通インターフェース

```ts
interface AuditFields {
  createdBy: string         // username
  createdAt: string         // ISO 8601 + +09:00
  updatedBy?: string
  updatedAt?: string
}

interface SoftDeletable {
  deletedAt?: string
  deletedBy?: string
  deleteReason?: string
}

// 17 種 — フロント mock.ts と完全一致
type BackType =
  | 'FD' | '本D'
  | 'Fカク' | '本カク' | '本カクW'
  | 'Fショ' | '本ショ'
  | 'FP' | '本P'
  | 'FB' | '本B'
  | '同伴' | '本指名' | '場内指名'
  | 'ボトルバック' | 'ヘルプ' | 'その他'

// ボトルバックのみ % 単位で格納 (0-100 整数)
const PERCENT_BACK_TYPES: readonly BackType[] = ['ボトルバック'] as const
```

### 3.3 UserAccount（判別ユニオン + Zod、M12）

```ts
import { z } from 'zod'

const UserBaseSchema = z.object({
  username: z.string().min(1),
  pinHash: z.string(),
  displayName: z.string().min(1),
  loginAttempts: z.number().int().min(0).default(0),
  lockedUntil: z.string().nullable().optional(),
  pinUpdatedAt: z.string().optional(),
  createdBy: z.string(),
  createdAt: z.string(),
  updatedBy: z.string().optional(),
  updatedAt: z.string().optional(),
  deletedAt: z.string().optional(),
  deletedBy: z.string().optional(),
})

export const UserAccountSchema = z.discriminatedUnion('role', [
  UserBaseSchema.extend({
    role: z.literal('owner'),
  }),
  UserBaseSchema.extend({
    role: z.literal('staff'),
    hourlyRate: z.number().int().positive(),
  }),
  UserBaseSchema.extend({
    role: z.literal('cast'),
    castId: z.number().int().positive(),
  }),
])

export type UserAccount = z.infer<typeof UserAccountSchema>
```

PIN は `pinHash` のみサーバー保存、API では一切返さない。

### 3.4 Session（M19、クロウ R2）

```ts
interface SessionDoc {
  jti: string                         // Doc ID = JWT の jti claim (crypto.randomUUID)
  username: string
  role: 'owner' | 'staff' | 'cast'
  castId?: number
  storeId: string
  createdAt: string                   // ISO 8601 JST
  lastActivityAt: string              // heartbeat / 認証経由で更新
  expiresAt: string                   // hard expiry (12h from create)
  revoked?: boolean                   // logout / idle out / hard expiry で立てる
}
```

### 3.5 Cast

```ts
interface Cast extends AuditFields, SoftDeletable {
  id: number
  name: string                        // 源氏名
  realName?: string                   // 本名 (税理士提出 / 日経表 PDF)
  address?: string                    // 住所 (日経表 PDF 下部)
  hourlyRate: number
  backRates: Partial<Record<BackType, number>>  // 円単位 (ボトルバックのみ %)
  guaranteeRate: number               // 0-1、UI 参考表示のみ・計算未使用
  active: boolean
  onBreak?: boolean
  lastAssignedAt?: string             // 付け回し優先表示用
}
```

### 3.6 Table

```ts
type TableStatus = 'empty' | 'occupied' | 'ending' | 'alert' | 'settled'
                   // settled = 単独/合算問わず会計確定後の終了処理状態 (M13)

interface ExtensionEntry {
  id: number
  minutes: 30 | 60
  timestamp: string                   // ISO 8601
  nominatedCastName?: string          // 延長時の指名キャスト (バック帰属、M23 で継続)
  orderItemIds: string[]              // 連動して追加した orderItem ID 群 (取消時に同時削除)
}

interface Table extends AuditFields {
  id: number
  number: string                      // '1', '2', 'VIP1' 等
  status: TableStatus
  guestCount: number
  startTime: string | null            // ISO 8601 (サーバー入店時に算出)
  businessDate: string | null         // YYYY-MM-DD (サーバーが startTime から焼く)
  /** 動的: 現在対応中のキャスト名 */
  assignedCasts: string[]
  /**
   * 本指名担当 (固定、複数可)。
   * - 売上・本指名バックはここに帰属する (移動後もこの卓の本指名はこの子)
   * - 複数指定時はシャンパン等のセッパン対象 (calcChampagneSplit)
   */
  mainNominationCastNames: string[]
  isDouhan?: boolean
  isBanaiShimei?: boolean
  setCount: number                    // 基本セット数 (通常 1)
  orders: OrderEmbedded[]             // 1 卓の注文行 (典型 10-30 行、Firestore 1MB 制限内)
  checkTicketPrintedAt?: string       // 中間チェック票印字済 (二重印字防止)
  setDiscountPerSet?: number
  timeAdjustmentMinutes?: number
  extensionHistory?: ExtensionEntry[]
}
```

### 3.7 OrderEmbedded（クロウ R1: `id` 必須化）

```ts
interface OrderEmbedded {
  /** ★ Rev.4.1 追加 (クロウ R1): 配列インデックス依存の不安定性を解消するため必須化。
   *  注文確定 transaction 内で `tx_local_seq + 1` の連番採番 (Table.orders 内で一意)。 */
  id: number
  menuItem: {
    id: number
    name: string
    price: number
    cost: number
    castBack: number
    category: 'guest' | 'cast'
    subcategory: string
    backType?: BackType
  }
  quantity: number
  castName?: string                   // 売上帰属先キャスト (担当割当)
  /** 追補03 R18: ボーナス加算先 (任意)。本指名以外のキャストに少額ボーナス (M7) */
  bonusCastName?: string
  bonusAmount?: number                // 円。`StoreSettings.maxBonusRatePerOrder = 0.3` で上限ガード
  /** ★ Rev.4.1 (M5 ハク版採用): シャンパンセッパン用スナップショット。
   *  注文確定 tx 内で `calcChampagneSplit` 実行 → 当該注文行の本指名キャスト ID を焼く。
   *  会計時起点ではない（後段救済として `POST /tables/:id/orders/:orderId/redistribute`）。 */
  splitCastIds?: number[]
  /** 延長料金で生成された行は true */
  isExtension?: boolean
  addedAt: string                     // ISO 8601
  addedBy: string
}
```

`menuItem` は注文時点のスナップショット（後でメニュー価格を変えても過去伝票が壊れないため）。

### 3.8 MenuCategory（M10）

```ts
interface MenuCategory extends AuditFields {
  kind: 'guest' | 'cast'
  id: string                          // 'shochu', 'fdrink', 'champagne' 等
  label: string                       // '焼酎', 'Lドリンク(F)', 'シャンパン' 等
  order: number                       // 表示順 (昇順)
  hidden?: boolean
  custom?: boolean                    // ユーザー追加カテゴリ (削除可判定)
  /** ★ Rev.4.1 追加 (M10): ボトルキープ可否。シャンパン系既定 false、焼酎/ウイスキー系既定 true */
  allowsBottleKeep: boolean
}
```

### 3.9 GuestMenuItem / CastMenuItem

```ts
interface GuestMenuItem extends AuditFields {
  id: number
  name: string
  price: number
  cost: number
  castBack: number
  category: 'guest'
  subcategory: string                 // MenuCategory.id を参照
  archived?: boolean                  // メニュー非表示（過去伝票の参照は維持）
}

interface CastMenuItem extends AuditFields {
  id: number
  name: string
  price: number
  cost: number
  castBack: number
  category: 'cast'
  subcategory: string                 // MenuCategory.id を参照
  backType: BackType                  // 給与計算で参照する種別キー
  archived?: boolean
}
```

### 3.10 SetPrice / ChargeItem

```ts
interface SetPrice extends AuditFields {
  id: string                          // 'set-2000', 'set-2200', 'set-2400'
  label: string                       // '20:00〜', '22:00〜', '24:00〜LAST'
  price: number                       // 4000 / 5000 / 6000 (税抜)
  cost: number                        // 300 (default)
  startHour: number                   // 適用開始時刻 (20, 22, 24)
}

interface ChargeItem extends AuditFields {
  id: string                          // 'single-charge', 'douhan', 'shimei', 'banai', 'help'
  label: string
  price: number
  cost: number
}
```

時間帯別セット料金は `getSetPriceForTime(startTime)` でサーバー判定。

### 3.11 BillingRecord（M1〜M4 命名統一・複数本指名・再発行・shadow 合算）

```ts
type PaymentMethod = 'cash' | 'card' | 'mixed'

interface BillingRecord extends AuditFields, SoftDeletable {
  id: string                          // Firestore オートID
  storeId: string
  receiptNumber: number               // metadata/billing.nextReceiptNumber tx 内採番 (M17)
  tableNumber: string

  /** ★ Rev.4.1 命名統一 (M1) */
  subtotalBeforeTax: number           // TAX 前の純小計 (保証計算・売上集計に使用)
  serviceChargeAmount: number         // ★ 旧 taxAmount。UI 表示は「TAX」維持、内部識別子のみ統一
  consumptionTaxAmount: number        // 消費税 10% 額 (内税表示用、合計に既加算)
  total: number                       // 客が支払う最終額 (税・手数料・値引き反映後)

  setFee: number                      // セット料金合計
  drinkSubtotal: number               // 注文小計
  tableDiscountAmount: number         // 卓全体値引き
  specialDiscountAmount: number       // 特別値引き (端数カット等)
  specialDiscountReason?: string      // 値引き理由 (バリデーション必須)
  cardFee?: number                    // 客に課したカード手数料 (10%)
  cardProcessingCost?: number         // 決済会社支払 (経費計上、3.5%)
  paymentMethod: PaymentMethod
  cashAmount?: number
  cardAmount?: number

  completedAt: string                 // ISO 8601
  businessDate: string                // YYYY-MM-DD (サーバー算出)

  /** ★ Rev.4.1 複数本指名 (M2) */
  nominatedCastIds: number[]          // 卓に紐付く本指名キャストID群 (空 = フリー)
  castSnapshot: { id: number; name: string; realName?: string }[]
                                      // 税理士提出に realName 必要

  receiptSnapshot: ReceiptSnapshot
  receiptIssued: boolean

  /** ★ Rev.4.1 再発行 (M3) — 上限 20 で打ち切り */
  reissueParentId?: string            // 親 billingId (再発行レコードの場合)
  reissueIndex?: number               // 1〜20。表示は `${receiptNumber}-${reissueIndex}`

  /** ★ Rev.4.1 shadow 合算 (M4) */
  primaryBillingId?: string           // 合算先 (shadow レコード = 各構成卓の売上帰属用)
  mergedBillingIds?: string[]         // 代表レコードに保持される構成卓 billingId 群
  mergedFromTableNumbers?: string[]   // 領収書併記用

  /** void / 取消 */
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  refundAmount?: number
  replacedBy?: string                 // 差し替え先 BillingRecord.id

  /** アーカイブ (M21: 物理削除なし、再アクティブ化なし) */
  archivedAt?: string
}

interface ReceiptSnapshot {
  receiptNumber: number               // 表示用は reissueIndex があれば付与
  receiptName: string                 // 宛名 (default '上様')
  receiptPurpose: string              // 但書 (default '飲食代として')
  subtotal: number
  setFee: number
  serviceCharge: number               // ★ 旧 tax
  consumptionTax: number
  discount: number
  orders: { menuItem: { id: number; name: string; price: number }; quantity: number; castName?: string }[]
  startTime: string | null
  nominationLabel: string             // 'フリー' | '本指名 あいり, みく + 同伴' 等
  storeNameSnapshot: string           // ★ 'Heaven\'s Garden' を冒頭表記
  storeAddressSnapshot: string
  storePhoneSnapshot: string
  invoiceNumberSnapshot: string       // 'T5390001005970'
  stampRequired: boolean              // total > 50000 で印紙欄有効
  completedAt: string                 // ISO 8601
  /** 合算会計時の卓番号リスト (R13 領収書印字用) */
  mergedTables?: string[]
  /** 割り勘人数 (1 = 通常会計) */
  splitCount?: number
}
```

**voidedAt と deletedAt の使い分け**:
- `voidedAt`: 取引として発生したが取り消された（**会計・税務上は記録残す**）
- `deletedAt`: 入力ミス等で取引自体が無かった（owner 承認限定の例外）

### 3.12 DiscountLog（append-only）

```ts
interface DiscountLog extends AuditFields {
  id: string
  storeId: string
  billingRecordId?: string
  tableNumber: string
  originalTotal: number
  discountAmount: number
  finalTotal: number
  reason: string                      // バリデーション必須 (空文字禁止)
  reasonCategory?: '端数カット'|'VIP値引'|'店長承認'|'クーポン'|'その他'
  operator: string                    // username
  operatorRole: 'owner' | 'staff'
  businessDate: string
  timestamp: string                   // ISO 8601
}
```

`firestore.rules` で `update`/`delete` を全拒否（改ざん不可）。

### 3.13 DailyWork（集計キャッシュ、上書き保存 M14）

```ts
interface DailyWork extends AuditFields {
  id: string                          // `${castId}_${businessDate}` を Doc ID に
  castId: number
  businessDate: string                // YYYY-MM-DD
  workMinutes: number                 // AttendanceRecord 集計
  paidMinutes: number                 // calcPaidMinutes 適用後
  hourlyPay: number
  backs: Partial<Record<BackType, number>>   // 件数 (本指名 1, FD 3 等)
  backTotal: number                   // 円換算合計
  bonusTotal: number                  // OrderItem.bonusAmount の自分宛て合計
  sales: number                       // 個人小計売上 (本指名重畳含む、均等割後)
}
```

**上書き保存ルール（M14）**: 同一 `(castId, businessDate)` で再出勤時、当日全件を tx 内で再計算して set。**差分加算ではない**。

### 3.14 DailyPayment / Deduction / AdvancePayment

```ts
interface DailyPayment extends AuditFields, SoftDeletable {
  id: number
  castId: number                      // ボーイは負数等で一意化
  castName: string
  amount: number                      // 額面 (10% 控除前)
  amountAfterDeduction: number        // 10% 控除後の手渡し額 (サーバー計算)
  source: 'register' | 'transfer'
  staffType: 'cast' | 'boy'           // 必須昇格
  businessDate: string
  timestamp: string
}

interface Deduction extends AuditFields, SoftDeletable {
  id: number
  castId: number
  amount: number
  reason: string
  source: 'register' | 'transfer'
  staffType: 'cast' | 'boy'
  businessDate: string
}

interface AdvancePayment extends AuditFields, SoftDeletable {
  id: number
  castId: number
  castName: string
  amount: number
  source: 'register' | 'transfer'
  reason: string
  businessDate: string
  timestamp: string
}
```

### 3.15 Expense

```ts
type ExpenseCategory = '仕入れ（酒等）' | '税金' | '雑費' | string

interface Expense extends AuditFields, SoftDeletable {
  id: number
  amount: number
  category: ExpenseCategory
  note: string
  source: 'register' | 'transfer'
  businessDate: string
  timestamp: string
}
```

### 3.16 AttendanceRecord（ISO 8601 化）

```ts
interface AttendanceRecord extends AuditFields {
  id: number
  staffId: number
  staffName: string                   // スナップショット
  staffType: 'cast' | 'boy'
  businessDate: string                // YYYY-MM-DD (clockIn の businessDate で固定、clockOut が翌日でも不変)
  clockIn: string                     // ISO 8601 full timestamp
  clockOut: string | null             // ISO 8601 (翌 3:00 等もOK)
  scheduledClockIn?: string | null    // 事前予定との比較用
  breakMinutes: number
  workMinutes: number                 // サーバー算出 = (clockOut - clockIn) - breakMinutes
  paidMinutes: number                 // ルーズタイム + 15 分単位切上後
  /** 自動打刻の場合 true (AttendanceSchedule から生成) */
  autoCreated?: boolean
}
```

**バリデーション**:
- `clockOut < clockIn` は不正（日付またぎは clockOut が翌日 ISO 8601 になるので問題ない）
- `clockOut - clockIn > 24h` は不正
- 同一 staff の重複 `clockIn` は 409 Conflict

### 3.17 AttendanceSchedule（M11）

```ts
interface AttendanceSchedule extends AuditFields {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'
  businessDate: string
  scheduledClockIn: string            // ISO 8601 (HH:MM ではなく完全 timestamp)
  processed?: boolean
  processedAt?: string
  processedRecordId?: number          // 紐付く AttendanceRecord.id
}
```

**サーバースケジューラ**: Cloud Function `processSchedules`（1 分 cron）で `scheduledClockIn <= now() && !processed` を走査し、`AttendanceRecord` を生成 + `processed = true` を立てる。**フロント `setInterval` 方式は廃止**（タブを閉じると動かないため）。Cold Start 精度は §18.2 参照。

### 3.18 CastMoveLog

```ts
interface CastMoveLog extends AuditFields {
  id: number
  castName: string
  fromTableId: number | null          // null = 待機から
  toTableId: number | null            // null = 待機戻し
  timestamp: string
  businessDate: string
  durationMinutes?: number            // 元の卓に何分対応していたか
}
```

### 3.19 DailyReport

```ts
interface DailyReport extends AuditFields {
  businessDate: string                // Doc ID
  initialCash: number
  cashSales: number
  cardSales: number
  totalSales: number
  dailyPayTotal: number
  cashExpenseTotal: number
  cashAdvanceTotal: number
  theoreticalCash: number
  actualCash: number
  difference: number                  // actual - theoretical
  note: string
  operator: string
  closedAt: string
  reopenedAt?: string
  reopenedBy?: string
  reopenReason?: string
}
```

`closedAt` 立ち後の紐付く void/delete は **422**。`POST /api/daily-reports/:businessDate/reopen` (owner) で再オープン → 修正 → 再締め。

### 3.20 BottleKeep

```ts
interface BottleKeep extends AuditFields, SoftDeletable {
  id: number
  bottleName: string
  remaining: number                   // 0-100 (%)
  storageLocation: string
  customerName: string
  tableNumber?: string
  expiresAt?: string
  /** 元 OrderItem との紐付き (シャンパン等のセッパン対象注文だった場合の参照保持) */
  sourceOrderId?: string
}
```

### 3.21 StoreSettings (singleton)

```ts
interface StoreSettings extends AuditFields {
  // 税・手数料
  taxRate: number                     // TAX (サービス料) default 0.20
  consumptionTaxRate: number          // 消費税 default 0.10 (内税)
  cardFeeRate: number                 // 客向けカード手数料 default 0.10
  cardProcessingFeeRate: number       // 店舗→決済会社 default 0.035

  // レジ
  initialCash: number                 // default 100000

  // 給与
  closingDay: number                  // 締め日 default 15
  payrollDeductionRate: number        // default 0.10
  dailyPayDeductionRate: number       // default 0.10
  looseTimeMinutes: number            // ルーズタイム default 15
  payUnitMinutes: number              // 給与単位 default 15

  // ★ 法定源泉ガード (M25)
  legalWithholdingConfirmed: boolean  // default false。owner 経由 /admin/payroll-settings でのみフリップ可
  legalWithholdingConfirmedAt?: string
  legalWithholdingConfirmedBy?: string
  legalWithholdingTaxAccountantName?: string  // 税理士名
  legalWithholdingConfirmationDocUrl?: string // 確認内容スナップショット PDF (Cloud Storage)

  // 営業日
  businessDayCutoffHour: number       // default 5

  // 店舗情報
  storeName: string                   // 'CLUB GALAXY' (実店舗は 'Heaven\'s Garden')
  storeAddress: string
  storePhone: string
  invoiceNumber: string               // 'T5390001005970'

  // 延長料金 (M22 で人数連動に変更)
  // ※ 旧 EXTENSION_CHARGES = {30: 1000, 60: 3000} 固定額は廃止
  extensionPricingMode: 'per_guest_set' // 'fullSetCharge × 人数' で算出
  extensionMinuteOptions: [30, 60]

  // 中間チェック票
  checkTicketAutoPrintMinutes: number // 50

  // セッション
  sessionIdleMinutes: number          // 30
  jwtExpiresHours: number             // 12
  heartbeatIntervalMinutes: number    // 5

  // PIN ロック
  pinLockStage1Failures: number       // 5
  pinLockStage1Minutes: number        // 5
  pinLockStage2Failures: number       // 10
  pinLockStage2Minutes: number        // 30
  pinLockStage3Failures: number       // 15
  pinLockStage3Hours: number          // 24

  // ボーナス上限 (M7)
  maxBonusRatePerOrder: number        // 0.30 (注文小計の 30%)

  // シャンパンセッパン (M6)
  champagneSplitThreshold: number     // 20000 (この金額以上で本指名複数時にセッパン適用)
}
```

**Rev.3.1 / Rev.4 から削除**:
- `enableOvertimePremium` / `enableCustomDeduction` / `customDeductionRate`（SPEC_CONFLICTS 採用で運用しない）

### 3.22 DailyAggregate（キャッシュ、tx 同梱更新 M15）

```ts
interface DailyAggregate {
  businessDate: string                // Doc ID
  totalSales: number
  cashSales: number
  cardSales: number
  cardFeeIncome: number
  cardProcessingFee: number
  foodCost: number
  laborCostHourly: number
  laborCostBack: number
  expenseTotal: number
  guestCount: number
  tableCount: number
  billingCount: number
  flRate: number                      // (foodCost + labor + cardProcessingFee) / totalSales
  profit: number
  updatedAt: string
}
```

**M15 重要**: `billingRecords.create` / `attendance` 更新 / `expenses.create` / **`billings/:id/void`** の各 mutation tx 内で **同期更新**。Cloud Functions の eventually consistent モデルは給与計算根拠には致命的なので不可。void 時は decrement + `reissueParentId` チェーン遡及で親 billing の影響も相殺（M16）。

### 3.23 AuditLog

```ts
interface AuditLog {
  id: string
  storeId: string
  collection: string
  documentId: string | number
  action: 'create' | 'update' | 'delete' | 'void' | 'reopen' | 'archive'
        | 'login_success' | 'login_failed' | 'pin_locked' | 'logout'
        | 'legal_withholding_confirmed' | 'champagne_redistribute'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  userId: string
  userRole: 'owner' | 'staff' | 'cast'
  timestamp: string
  reason?: string
  payload?: unknown                   // 任意の追加情報 (lockedUntil, failedAttempts 等)
  ipAddress?: string
}
```

全 mutation で `auditLogs.add()` を tx 内で実行（fire-and-forget は不可、整合性必須）。

### 3.24 metadata/billing (singleton、M17)

```ts
interface BillingMetadata {
  nextReceiptNumber: number
  lastReceiptIssuedAt: string
  receiptResetAt?: string
}
```

採番フロー (`POST /api/billing/records` の Firestore tx 内):
1. `metadata/billing` を get
2. `nextReceiptNumber` を `BillingRecord` に書き、+1 して set
3. 同 tx で `BillingRecord` 本体・`dailyAggregates` upsert・`auditLogs` 追記
4. tx 失敗時は番号スキップなし（リトライで再採番）

---
## §4. ビジネスロジック

### 4.1 給与計算（SPEC_CONFLICTS 反映の最終形）

```
[キャスト]
  workMinutes = AttendanceRecord 集計 (期間内全レコードの workMinutes 合計)
  paidMinutes = calcPaidMinutes(workMinutes, looseTimeMinutes=15, payUnitMinutes=15)
                  ※ 1 出勤ごとに適用 (期間合算後ではない)
  hourlyPay = floor(hourlyRate × paidMinutes / 60)

  backTotal = Σ (件数 × backRates[BackType])
              ※ 'ボトルバック' のみ % 単位 → backTotal += floor(売上 × rate/100)
              ※ シャンパン等は calcChampagneSplit() で本指名複数時セッパン (M5)
              ※ Help料は卓全体売上扱い、本指名キャストの個人売上に加算しない (M8)
  bonusTotal = Σ OrderEmbedded.bonusAmount (bonusCastName == cast.name のもの)

  grossPay = hourlyPay + backTotal + bonusTotal
  payrollDeduction = floor(grossPay × payrollDeductionRate)   // 0.10 default
  netBeforeAdjust = grossPay - payrollDeduction

  dailyPayTotal = Σ DailyPayment.amount (期間内 / castId 一致 / !deletedAt)
  deductionTotal = Σ Deduction.amount
  advanceTotal = Σ AdvancePayment.amount

  netPay = netBeforeAdjust - dailyPayTotal - deductionTotal - advanceTotal

  // 参考表示用 (計算には使わない)
  guaranteeReference = floor(salesTotal × cast.guaranteeRate)

[ボーイ]
  workMinutes / paidMinutes / hourlyPay は同じ
  grossPay = hourlyPay
  netPay = grossPay - dailyPayTotal - deductionTotal
```

**SalaryCalculation レスポンス型**:

```ts
interface SalaryCalculation {
  castId: number
  castName: string
  staffType: 'cast' | 'boy'
  period: { from: string; to: string }
  workDays: number
  workMinutes: number
  paidMinutes: number
  hourlyPay: number
  backTotal: number
  backBreakdown: Partial<Record<BackType, { count: number; amount: number }>>
  bonusTotal: number
  grossPay: number
  payrollDeduction: number              // grossPay × 0.10
  dailyPayTotal: number
  deductionTotal: number
  advanceTotal: number
  netPay: number
  // 参考表示
  salesTotal: number
  guaranteeReference: number            // 計算未使用
}
```

**法定源泉税の物理ガード（M25）**:

```ts
// lib/payroll.ts 抜粋
export function calculateSalary(input: PayrollInput): SalaryCalculation {
  if (input.includeLegalWithholding) {
    if (!input.settings.legalWithholdingConfirmed) {
      throw new ApiError(
        503,
        'LEGAL_WITHHOLDING_NOT_CONFIGURED',
        '法定源泉税の税理士確認が完了していません'
      )
    }
    // 法定源泉計算は税理士確認後にのみ有効化
  }
  // ...
}
```

`legalWithholdingConfirmed` のフリップ手順:
1. owner が `/admin/payroll-settings` から「税理士確認完了」操作
2. 必須入力: 税理士名 / 確認日 / 確認内容スナップショット PDF（Cloud Storage に保存）
3. 監査ログ `LEGAL_WITHHOLDING_CONFIRMED` に必須添付（PDF URL + メタ）
4. 以降のリクエストでフラグ true → 法定源泉計算が解禁

### 4.2 シャンパン等のセッパン計算（M5・M6）

**適用条件**:
- `subcategory === 'champagne'`（焼酎は除外、クロウ④反映）
- `OrderItem.menuItem.price >= StoreSettings.champagneSplitThreshold` (default 20000)
- `mainNominationCastNames.length >= 2`

**起点**: **注文確定 transaction 内**で `calcChampagneSplit` を実行し、`OrderEmbedded.splitCastIds` を焼く（会計時起点ではない）。後段救済として `POST /tables/:id/orders/:orderId/redistribute`（owner、ステップアップ認証 + 監査ログ + 旧スナップショット保存）。

```ts
// lib/champagneSplit.ts (フロント `champagneSplit.ts` の正本サーバー実装)
function calcChampagneSplit(input: {
  totalPrice: number
  nominationCastNames: string[]
  castBackRateMap: Record<string, number>   // 0.0-1.0
}): {
  perCastRevenue: number                  // 売上均等割 (M9: 重み付けなし)
  averageBackRate: number                 // 平均バック率
  perCastBackAmount: number               // 各人バック額
  totalBackAmount: number
}
```

**端数処理**: 各人切り捨て、店側に余り（円未満）。

### 4.3 利益計算（FL指標）

```
// 本日
foodCost = 当日 BillingRecord 集計 + 稼働中 Table の orders 原価
laborCost = (Σ AttendanceRecord.workMinutes × staff.hourlyRate / 60) + Σ DailyWork.backTotal
cardProcessingCost = Σ (cardAmount × cardProcessingFeeRate)
totalCost = foodCost + laborCost + cardProcessingCost
flRate = totalCost / todaySales × 100
profit = todaySales - totalCost

// 月次
DailyAggregate を当月分 SUM
```

**重要**: フロントの `staffFixedCost = 28800` ハードコードは **使わない**。実際の `AttendanceRecord` から人件費を算出する。

### 4.4 伝票番号アトミック採番（M17）

```ts
await db.runTransaction(async (tx) => {
  const metaRef = db.doc(`stores/${storeId}/metadata/billing`)
  const metaDoc = await tx.get(metaRef)
  const meta = metaDoc.data() as BillingMetadata
  const receiptNumber = meta.nextReceiptNumber

  // BillingRecord 本体を保存 (receiptNumber を含めて)
  tx.set(billingRef, { ...record, receiptNumber, createdAt, businessDate })

  // メタを +1 で書き戻し
  tx.update(metaRef, {
    nextReceiptNumber: receiptNumber + 1,
    lastReceiptIssuedAt: createdAt,
  })

  // dailyAggregates upsert (M15: tx 同梱)
  const aggRef = db.doc(`stores/${storeId}/dailyAggregates/${businessDate}`)
  // ... atomic merge

  // auditLogs append
  tx.set(db.collection(`stores/${storeId}/auditLogs`).doc(), { ...auditEntry })
})
```

### 4.5 会計取消（void）フロー（M16）

`POST /api/billing/records/:id/void`（owner のみ + ステップアップ認証）:
1. 対象 BillingRecord を取得
2. `closedAt` チェック: 紐付く DailyReport が締め済なら 422
3. tx 内で `voidedAt/voidedBy/voidReason` を設定
4. **連動して当該 cast の `DailyWork.sales` / `backTotal` を decrement**（売上重畳/バックを巻き戻す）
5. **`dailyAggregates` を decrement**（同 tx 内）
6. **`reissueParentId` チェーン遡及**: 親 billing がある場合、親側の `dailyAggregates` 影響も相殺
7. `auditLogs` 記録（action='void'）

差し替え会計が必要なら、続いて `POST /api/billing/records` で新規発行 + 元レコードに `replacedBy` をセット。

### 4.6 領収書再発行（M3）

`POST /api/billing/records/:id/reissue`:
- 元 `BillingRecord` を変更せず、新規 `BillingRecord` を作成
- `reissueParentId = 元.id` / `reissueIndex = 既存最大 + 1`
- **`reissueIndex > 20` で 409 Conflict**（無限再発行を防止）
- `receiptNumber` は親と同じ。表示は `${receiptNumber}-${reissueIndex}` 形式（例: `000123-2`）
- `dailyAggregates` への影響はない（売上重畳しない、印刷フォーマット変更のみ）

### 4.7 合算会計の shadow レコード（M4）

`POST /api/billing/merge`:

入力: `{ tableNumbers: string[], paymentMethod, splitCount?, ... }`

処理:
1. tx 内で **代表 BillingRecord** を 1 件作成（`mergedFromTableNumbers` に元卓番号、`mergedBillingIds` に shadow ID 群）
2. 各構成卓ごとに **shadow BillingRecord** を作成:
   - `primaryBillingId = 代表.id`
   - 売上は構成卓側に按分 → 各 cast の `DailyWork` に正しく帰属
3. 領収書印字は代表 1 枚（`receiptSnapshot.mergedTables` に卓番号併記）
4. 全 shadow + 代表の `dailyAggregates` 影響を tx 内で集約

`POST /api/billing/split-bill`:

入力: `{ tableNumber, splitCount }`

処理:
- 1 卓を `splitCount` 人で割り勘 → 1 BillingRecord に `receiptSnapshot.splitCount` を設定
- 領収書を `splitCount` 枚出力（各 `total / splitCount`、端数調整は代表券に集約）

### 4.8 締め後 reopen フロー

`POST /api/daily-reports/:businessDate/reopen`（owner のみ）:
1. `DailyReport.closedAt` を null に
2. `reopenedAt/reopenedBy/reopenReason` を記録
3. `auditLogs` に必ず記録（action='reopen'、reason 必須）

reopen 後は通常通り void / 修正 → 再締め (`POST /api/daily-reports`)。

### 4.9 給与支払日算出（payment-dates）

`utils/payroll-payment-date.ts`:
- `period: 'first'`（1-15 日分） → 当月末日払い
- `period: 'second'`（16-月末分） → 翌月 15 日払い
- 土日祝は前倒し（直前の平日）
- 祝日テーブルは 2025-2030 を内蔵（npm `japanese-holidays` 採用検討）

**API**: `GET /api/payroll/payment-dates?period=first&year=2026&month=4`

### 4.10 中間チェック票自動印字判定

API は判定ロジックのみ提供:
- `GET /api/tables/:id/check-ticket-status` → `{ shouldPrint: true, reason: '50min_passed' }`
- 印字自体はフロント側で実行（プリンタが各タブレットに紐付くため）
- 印字後に `PATCH /api/tables/:id { checkTicketPrintedAt: now() }` で記録（二重印字防止）

### 4.11 延長料金（M22・M23）

**人数連動方式**（旧固定額廃止）:
```ts
// lib/pricing.ts
function calcExtensionFee(input: {
  minutes: 30 | 60
  guestCount: number
  fullSetCharge: number   // 当該卓の現在 setPrice (時間帯別)
}): number {
  // M22: fullSetCharge × 人数 × (minutes / 60)
  return Math.floor(input.fullSetCharge * input.guestCount * (input.minutes / 60))
}
```

**M23**: 延長中も本指名バック継続（時間延長であって指名再開ではない）。`ExtensionEntry.nominatedCastName` で延長時の指名キャストを記録するが、本指名バックは `Table.mainNominationCastNames` 全員に付与し続ける。

### 4.12 売上帰属（M9: 均等割）

本指名 N 名 (N >= 1) の卓で売上発生:
- 各キャストの `DailyWork.sales += floor(orderTotal / N)`
- 端数（円未満）は店側集約
- 重み付け（指名順位等）は **YAGNI**：将来用にスキーマ余地のみ残し、現状実装しない

### 4.13 Help料の扱い（M8）

- `OrderItem.castName = Help キャスト名`、`backType = 'ヘルプ'`
- 集計時 `backType === 'ヘルプ'` は **売上加算スキップ**・バック額のみ加算
- Help 料金自体は卓全体売上として `BillingRecord.subtotalBeforeTax` に加算されるが、本指名キャストの `DailyWork.sales` には加算しない

---
## §5. API エンドポイント一覧

### 5.0 共通

- ベース: `/api`
- 認証: JWT Bearer (`Authorization: Bearer <token>`)
- ページネーション: `?limit=50&cursor=<lastDocId>` カーソルベース
- レスポンス: `{ data: [...], nextCursor, hasMore }`
- エラー: `{ error: 'CODE', message: '...', details? }`（§6.5 参照）
- **horizon move 防止（M20）**: cast 自身向け閲覧 API では `?castId=X` クエリは無視し、JWT の `sub` から取得した castId を強制使用

### 5.1 認証 `/api/auth`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, pin}` → JWT 発行（jti 必須、`sessions/{jti}` 書込） | 全員 |
| POST | `/api/auth/logout` | `revokeSession(jti)` | 認証済 |
| GET | `/api/auth/me` | JWT 復元 | 認証済 |
| PATCH | `/api/auth/pin` | PIN 変更（本人 currentPin 必須、owner は他人もリセット可） | 認証済 |
| POST | `/api/auth/heartbeat` | アイドル更新（30 分無操作失効回避、5 分間隔送信） | 認証済 |

### 5.2 ユーザー `/api/users`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/users` | 一覧 | owner |
| POST | `/api/users` | 作成 | owner |
| PATCH | `/api/users/:username` | 更新（role バリデーション必須） | owner |
| DELETE | `/api/users/:username` | 削除（実体は active=false） | owner |

### 5.3 卓 `/api/tables`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/tables` | 一覧（`?updatedAfter=` で差分取得） | owner/staff |
| GET | `/api/tables/:id` | 詳細 | owner/staff |
| POST | `/api/tables` | 卓追加 | owner |
| PATCH | `/api/tables/:id` | 更新 | owner/staff |
| DELETE | `/api/tables/:id` | 削除 | owner |
| POST | `/api/tables/:id/orders` | 注文追加（tx 内で id 連番採番、splitCastIds 焼く） | owner/staff |
| DELETE | `/api/tables/:id/orders/:orderId` | 注文削除（クロウ R1: orderKey ではなく id） | owner/staff |
| POST | `/api/tables/:id/orders/:orderId/bonus` | ボーナス設定（M7） | owner/staff |
| POST | `/api/tables/:id/orders/:orderId/redistribute` | シャンパンセッパン再分配（owner + ステップアップ認証） | owner |
| POST | `/api/tables/:id/extensions` | 延長追加（人数連動 fullSetCharge×人数、M22） | owner/staff |
| DELETE | `/api/tables/:id/extensions/:extId` | 延長取消（連動 orderItemIds も同 tx 削除） | owner/staff |
| POST | `/api/tables/:id/move-cast` | キャスト移動 | owner/staff |
| POST | `/api/tables/:id/reset` | 卓リセット（会計確定後） | owner/staff |
| POST | `/api/tables/reorder` | 並び替え | owner |
| GET | `/api/tables/:id/check-ticket-status` | 中間チェック票印字要否判定 | owner/staff |

### 5.4 キャスト `/api/casts`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/casts` | 一覧 | owner/staff（cast は不可） |
| POST | `/api/casts` | 作成 | owner |
| PATCH | `/api/casts/:id` | 更新 | owner/staff |
| DELETE | `/api/casts/:id` | 削除（active=false） | owner |
| POST | `/api/casts/replace-all` | 一括置換（Seed 用） | owner |

### 5.5 メニュー `/api/menu`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/menu/categories` | カテゴリ一覧（`allowsBottleKeep` 含む） | owner/staff |
| POST | `/api/menu/categories` | カテゴリ追加 | owner |
| PATCH | `/api/menu/categories/:id` | 更新 | owner |
| DELETE | `/api/menu/categories/:id` | 削除（custom=true のみ） | owner |
| GET/POST/PATCH/DELETE | `/api/menu/guest` | ゲストメニュー CRUD | GET: owner/staff、他: owner |
| GET/POST/PATCH/DELETE | `/api/menu/cast` | キャストメニュー CRUD | GET: owner/staff、他: owner |
| GET | `/api/menu/set-prices` | セット料金 | owner/staff |
| PATCH | `/api/menu/set-prices/:id` | 更新 | owner |
| GET | `/api/menu/charges` | チャージ項目 | owner/staff |
| PATCH | `/api/menu/charges/:id` | 更新 | owner |

### 5.6 会計 `/api/billing`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/billing/records` | **デフォルトで `voidedAt == null` 除外**。`?includeVoided=true` で void 込み（クロウ R5）。`?businessDate=` `?month=` `?limit=&cursor=` `?includeArchived=true` | owner/staff |
| GET | `/api/billing/records/:id` | 詳細（receiptSnapshot 含む） | owner/staff |
| POST | `/api/billing/records` | 会計確定（tx で receiptNumber 採番 + dailyAggregates upsert + auditLog） | owner/staff |
| POST | `/api/billing/records/:id/void` | 取消（voidReason 必須、dailyAggregates decrement、reissueParentId チェーン遡及） | owner（ステップアップ認証） |
| POST | `/api/billing/records/:id/reissue` | 再発行（reissueIndex を採番、上限 20 で 409） | owner/staff |
| GET | `/api/billing/discounts` | 値引きログ | owner/staff |
| POST | `/api/billing/discounts` | 値引き記録（append-only、reason 必須） | owner/staff |
| POST | `/api/billing/merge` | 合算会計（shadow 方式 M4） | owner/staff |
| POST | `/api/billing/split-bill` | 割り勘伝票発行 | owner/staff |

### 5.7 ボトルキープ `/api/bottles`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/bottles` | 一覧 | owner/staff |
| POST | `/api/bottles` | 追加 | owner/staff |
| PATCH | `/api/bottles/:id` | 更新 | owner/staff |
| DELETE | `/api/bottles/:id` | 削除（soft） | owner |

### 5.8 給与 `/api/payroll`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/payroll/calculate` | 全員給与計算（`legalWithholdingConfirmed` チェック） | owner |
| GET | `/api/payroll/payment-dates` | 支払日 | owner/staff |
| GET | `/api/payroll/daily-payments` | 日払い一覧 | owner/staff |
| POST | `/api/payroll/daily-payments` | 日払い記録（10% 控除自動算出） | owner/staff |
| DELETE | `/api/payroll/daily-payments/:id` | 取消（soft） | owner |
| GET | `/api/payroll/deductions` | 天引き一覧 | owner/staff |
| POST | `/api/payroll/deductions` | 天引き追加 | owner/staff |
| DELETE | `/api/payroll/deductions/:id` | 取消（soft） | owner |
| GET | `/api/payroll/daily-work/:castId` | 日次集計取得 | owner/staff |

### 5.9 自己給与 `/api/salary`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/salary/me` | JWT.sub から自己給与取得（cast/boy 両対応、`?castId=X` 無視 M20） | 認証済（自己制限） |

### 5.10 勤怠 `/api/attendance`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/attendance` | 一覧 | owner/staff |
| POST | `/api/attendance` | 出勤記録（サーバー時刻使用推奨） | owner/staff |
| PATCH | `/api/attendance/:id` | 退勤打刻 / 休憩追加 | owner/staff |
| GET | `/api/attendance/schedules` | 事前出勤予定一覧 | owner/staff |
| POST | `/api/attendance/schedules` | 予定追加 | owner/staff |
| DELETE | `/api/attendance/schedules/:id` | 予定削除 | owner/staff |

### 5.11 経費 `/api/expenses`

CRUD + soft-delete + 監査ログ。

### 5.12 前借り `/api/advances`

CRUD + soft-delete + 監査ログ。

### 5.13 日報・レジ締め `/api/daily-reports`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/daily-reports` | 一覧 | owner/staff |
| GET | `/api/daily-reports/:businessDate` | 詳細 | owner/staff |
| POST | `/api/daily-reports` | 締め実行（tx で集計 + closedAt セット + dailyAggregates 焼き直し） | owner/staff |
| POST | `/api/daily-reports/:businessDate/reopen` | 再オープン（reopenReason 必須） | owner |

### 5.14 FL指標 `/api/metrics`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/metrics/fl` | 本日の FL 指標 | owner |
| GET | `/api/metrics/fl/monthly` | 月次 FL 指標 | owner |
| GET | `/api/metrics/sales/calendar` | 日別売上カレンダー | owner |
| GET | `/api/metrics/cast/:castId/monthly` | キャスト個別月次売上・給与推移 | owner |

### 5.15 設定 `/api/settings`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/settings` | 全設定取得 | owner/staff |
| PUT | `/api/settings` | 更新（税務直結なので全フィールド監査ログ） | owner |
| POST | `/api/admin/payroll-settings/confirm-legal-withholding` | `legalWithholdingConfirmed` フリップ（PDF 添付必須、M25） | owner（ステップアップ認証） |

### 5.16 出力 `/api/export`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/export/payroll-csv` | 税理士用 CSV | owner |
| GET | `/api/export/cast-ledger/:castId.pdf` | キャスト日経表 PDF | owner |
| GET | `/api/export/cast-ledger/:castId.csv` | キャスト日経表 CSV | owner |
| GET | `/api/export/billing-csv` | 会計 CSV（`?includeVoided=true` `?includeArchived=true` 既存） | owner |

### 5.17 アーカイブ `/api/archive`（M21: read-only + 出力のみ）

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| POST | `/api/archive` | `{beforeDate}` で archivedAt フラグ付与（物理削除なし） | owner |
| GET | `/api/archive` | アーカイブ済み参照一覧 | owner |
| GET | `/api/billing/records?includeArchived=true` | アーカイブ込み参照 | owner |

**重要**: `archivedAt` を null に戻す機能は **提供しない**（不正温床のため）。データ復旧が必要なら DBA 経由で直接 Firestore 操作 + 監査ログ追加。

### 5.18 監査ログビューア `/api/audit`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/audit/logs` | 一覧（`?from=&to=&action=&userId=&collection=` フィルタ + cursor） | owner |

---
## §6. 認証・権限

### 6.1 PIN 認証フロー（クロウ R2: jti 必須化、クロウ R3: 文言統一）

```ts
// POST /api/auth/login
async function login(username: string, pin: string) {
  const userRef = db.doc(`stores/${storeId}/userAccounts/${username}`)
  const userSnap = await userRef.get()
  if (!userSnap.exists) throwInvalidCredentials()

  const user = UserAccountSchema.parse(userSnap.data())

  // ロックチェック
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) {
    throwLocked(user.lockedUntil)
  }

  const ok = await bcrypt.compare(pin, user.pinHash)
  if (!ok) {
    const attempts = (user.loginAttempts ?? 0) + 1
    const update: Partial<UserAccount> = { loginAttempts: attempts }
    // 段階ロック (クロウ R3 で文言統一)
    if (attempts >= settings.pinLockStage3Failures) {
      // 15 回 → 24h ロック
      update.lockedUntil = isoFromNow(settings.pinLockStage3Hours * 3600_000)
    } else if (attempts >= settings.pinLockStage2Failures) {
      // 10 回 → 30 分
      update.lockedUntil = isoFromNow(settings.pinLockStage2Minutes * 60_000)
    } else if (attempts >= settings.pinLockStage1Failures) {
      // 5 回 → 5 分
      update.lockedUntil = isoFromNow(settings.pinLockStage1Minutes * 60_000)
    }
    await userRef.update(update)
    if (update.lockedUntil) {
      // 監査ログ PIN_LOCKED
      throwLocked(update.lockedUntil)
    }
    throwInvalidCredentials()
  }

  // 成功 → ロック解除 + JWT 発行 (jti 必須、クロウ R2)
  await userRef.update({ loginAttempts: 0, lockedUntil: null })
  const jti = crypto.randomUUID()
  const token = jwt.sign(
    { sub: username, jti, role: user.role, castId: user.castId },
    JWT_SECRET,
    { expiresIn: `${settings.jwtExpiresHours}h` },
  )
  // セッション書込 (idle 管理用)
  await db.doc(`stores/${storeId}/sessions/${jti}`).set({
    jti,
    username,
    role: user.role,
    castId: user.castId,
    storeId,
    createdAt: nowJstIso(),
    lastActivityAt: nowJstIso(),
    expiresAt: isoFromNow(settings.jwtExpiresHours * 3600_000),
  })
  return { token, role: user.role, displayName: user.displayName }
}
```

**エラーハンドラ擬似コード（M24）**:

```ts
// lib/errors.ts
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) { super(message) }
}

export function throwInvalidCredentials(): never {
  throw new ApiError(401, 'AUTH_INVALID', 'ユーザー名または PIN が違います')
}

export function throwLocked(lockedUntil: string): never {
  // lockedUntil は ISO 8601 で必ず返す
  throw new ApiError(429, 'PIN_LOCKED', 'PIN ロック中', { lockedUntil })
}

export function throwLegalWithholdingNotConfigured(): never {
  throw new ApiError(503, 'LEGAL_WITHHOLDING_NOT_CONFIGURED', '法定源泉税の税理士確認が完了していません')
}
```

### 6.2 PIN 強度バリデーション

弱い PIN（`0000`, `1234`, `1111`, `9999`, `0987` 等の連番・反復）を `POST /api/auth/pin` で拒否。

### 6.3 共有端末の 30 分無操作失効（M19）

- JWT 自体は 12h 有効
- `sessions/{jti}` に `lastActivityAt` を保存（M19）
- `requireAuth` ミドルウェアで `now - lastActivityAt > sessionIdleMinutes` なら 401 + `revoked = true`
- フロントは `POST /api/auth/heartbeat` を **5 分間隔**で送る
- 全リクエストでも `lastActivityAt` を refresh するが、Firestore 書込コスト削減のため将来的には差分更新（> 1 分経過時のみ）に最適化検討

```ts
// middleware/auth.ts requireAuth 抜粋
export async function requireAuth(req, res, next) {
  const token = extractBearer(req)
  let payload: JwtPayload
  try { payload = jwt.verify(token, JWT_SECRET) }
  catch { return sendError(res, new ApiError(401, 'AUTH_INVALID_TOKEN', 'トークン無効')) }
  if (!payload.jti) return sendError(res, new ApiError(401, 'AUTH_INVALID_TOKEN', 'jti 欠落'))
  const session = await touchSession(payload.jti)
  if (!session) return sendError(res, new ApiError(401, 'SESSION_EXPIRED', 'セッション失効'))
  req.user = payload
  next()
}
```

### 6.4 ロール別権限表

| エンドポイント | owner | staff | cast |
|---|:-:|:-:|:-:|
| tables / orders / move-cast | ✅ | ✅ | ❌ |
| billing/records (作成) | ✅ | ✅ | ❌ |
| billing/records/void | ✅* | ❌ | ❌ |
| billing/records/reissue | ✅ | ✅ | ❌ |
| billing/merge / split-bill | ✅ | ✅ | ❌ |
| daily-reports (作成) | ✅ | ✅ | ❌ |
| daily-reports/reopen | ✅* | ❌ | ❌ |
| menu/categories (CRUD) | ✅ | 閲覧 | ❌ |
| menu (CRUD) | ✅ | 閲覧 | ❌ |
| payroll/calculate | ✅* | ❌ | ❌ |
| metrics/fl | ✅ | ❌ | ❌ |
| settings (PUT) | ✅* | ❌ | ❌ |
| admin/confirm-legal-withholding | ✅* | ❌ | ❌ |
| export | ✅ | ❌ | ❌ |
| archive | ✅* | ❌ | ❌ |
| salary/me | ✅ | ✅ | ✅** |
| attendance/schedules | ✅ | ✅ | ❌ |
| audit/logs | ✅ | ❌ | ❌ |

\* ステップアップ認証（PIN 再入力）必須
\** 自分のデータのみ。`?castId=X` 横移動は無視（M20）

### 6.5 統一エラーフォーマット

```ts
interface ErrorResponse {
  error: string                       // 機械可読コード ('AUTH_INVALID', 'PIN_LOCKED', ...)
  message: string                     // ユーザー向け日本語メッセージ
  details?: unknown                   // 追加情報 (lockedUntil 等)
}
```

代表的なエラーコード:
- `AUTH_REQUIRED` (401) — 認証ヘッダなし
- `AUTH_INVALID_TOKEN` (401) — 無効/jti 欠落
- `AUTH_INVALID` (401) — username / PIN 不一致
- `SESSION_EXPIRED` (401) — idle 切れ / hard expiry
- `PIN_LOCKED` (429) — `details.lockedUntil` ISO 8601
- `FORBIDDEN` (403) — ロール不足
- `NOT_FOUND` (404)
- `BAD_REQUEST` (400) — `details` に Zod エラー詳細
- `USER_EXISTS` (409)
- `LEGAL_WITHHOLDING_NOT_CONFIGURED` (503) — 給与計算ガード（M25）
- `RECEIPT_REISSUE_LIMIT` (409) — 再発行 20 回上限到達（M3）

---

## §7. 監査ログ実装方針

`backend/src/lib/audit.ts`:

```ts
export function buildEntry(input: {
  action: AuditAction
  performedBy: string
  collection?: string
  documentId?: string | number
  before?: object | null
  after?: object | null
  reason?: string
  payload?: unknown
  storeId?: string
  businessDate?: string
}): AuditLogEntry {
  return {
    id: crypto.randomUUID(),
    storeId: input.storeId ?? STORE_ID,
    timestamp: nowJstIso(),
    businessDate: input.businessDate ?? todayBusinessDate(),
    ...input,
  }
}

export function appendInTx(tx: Transaction, entry: AuditLogEntry): void {
  const ref = db.collection(`stores/${entry.storeId}/auditLogs`).doc(entry.id)
  tx.set(ref, entry)
}

export async function append(entry: AuditLogEntry): Promise<void> {
  await db.collection(`stores/${entry.storeId}/auditLogs`).doc(entry.id).set(entry)
}
```

**全 mutation で必ず同 tx 内で `appendInTx` を呼ぶ**（fire-and-forget は禁止）。

監査対象アクション（`AuditAction` enum 抜粋）:
- 認証系: `LOGIN_SUCCESS` / `LOGIN_FAILED` / `LOGOUT` / `PIN_LOCKED` / `PIN_CHANGE`
- 会計系: `BILLING_CREATE` / `BILLING_VOID` / `BILLING_REISSUE` / `BILLING_DISCOUNT` / `BILLING_MERGE` / `BILLING_SPLIT`
- 給与系: `PAYROLL_FINALIZE` / `LEGAL_WITHHOLDING_CONFIRMED`
- アーカイブ: `ARCHIVE_SET` / `ARCHIVE_UNSET`（unset は通常 API では発火しない）
- ユーザー: `USER_CREATE` / `USER_UPDATE` / `USER_DELETE`
- 設定: `SETTINGS_UPDATE`
- 注文: `CHAMPAGNE_REDISTRIBUTE` / `EXTENSION_CANCEL`
- レジ: `CASH_DRAWER_OPEN` / `CASH_DRAWER_CLOSE`
- 日報: `DAILY_REPORT_CLOSE` / `DAILY_REPORT_REOPEN`

---
## §8. Firestore セキュリティルール（`firestore.rules`）

### 8.1 Phase 1（MVP） — 全クライアント書込み禁止

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // クライアント (フロント) からの直接アクセスは原則禁止。
    // 全て backend (Admin SDK) 経由でアクセスする。
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

**理由**:
- 認証は PIN ベースで Firebase Auth ではないため、Firestore Rules で role 判定が困難
- 全アクセスを Express バックエンド経由にすることで、複雑な権限制御を Node.js 層で一元化
- フロントの Firebase SDK 直接呼び出しは原則使わない

**discountLogs の改ざん不可保護**（仮に Phase 2 で部分解禁しても適用）:
```
match /stores/{storeId}/discountLogs/{logId} {
  allow read: if false;             // Phase 1
  allow create: if false;           // 全 backend 経由
  allow update, delete: if false;   // 改ざん不可
}
```

### 8.2 Phase 2 — onSnapshot 解禁案（将来検討）

Firebase Auth カスタムトークン経由（`admin.auth().createCustomToken()` → `signInWithCustomToken()`）で `request.auth.token.role` ベース read 限定許可:

```
match /stores/{storeId}/tables/{tableId} {
  allow read: if request.auth != null
            && request.auth.token.storeId == storeId;
  allow write: if false;
}

match /stores/{storeId}/billingRecords/{billingId} {
  allow read: if request.auth != null
            && request.auth.token.role in ['owner', 'staff']
            && request.auth.token.storeId == storeId;
  allow write: if false;
}
```

cast role はテーブルや会計を直接読めないように除外。

---

## §9. Firestore インデックス（`firestore.indexes.json`）

```json
{
  "indexes": [
    { "collectionGroup": "billingRecords", "fields": [
      { "fieldPath": "businessDate", "order": "ASCENDING" },
      { "fieldPath": "completedAt", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "billingRecords", "fields": [
      { "fieldPath": "voidedAt", "order": "ASCENDING" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "billingRecords", "fields": [
      { "fieldPath": "archivedAt", "order": "ASCENDING" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "billingRecords", "fields": [
      { "fieldPath": "nominatedCastIds", "arrayConfig": "CONTAINS" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "tables", "fields": [
      { "fieldPath": "mainNominationCastNames", "arrayConfig": "CONTAINS" }
    ]},
    { "collectionGroup": "tables", "fields": [
      { "fieldPath": "status", "order": "ASCENDING" },
      { "fieldPath": "startTime", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "attendanceRecords", "fields": [
      { "fieldPath": "businessDate", "order": "ASCENDING" },
      { "fieldPath": "staffId", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "attendanceSchedules", "fields": [
      { "fieldPath": "processed", "order": "ASCENDING" },
      { "fieldPath": "scheduledClockIn", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "expenses", "fields": [
      { "fieldPath": "businessDate", "order": "ASCENDING" },
      { "fieldPath": "deletedAt", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "advancePayments", "fields": [
      { "fieldPath": "castId", "order": "ASCENDING" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "dailyPayments", "fields": [
      { "fieldPath": "staffType", "order": "ASCENDING" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "deductions", "fields": [
      { "fieldPath": "castId", "order": "ASCENDING" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "auditLogs", "fields": [
      { "fieldPath": "collection", "order": "ASCENDING" },
      { "fieldPath": "timestamp", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "auditLogs", "fields": [
      { "fieldPath": "userId", "order": "ASCENDING" },
      { "fieldPath": "timestamp", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "castMoveLogs", "fields": [
      { "fieldPath": "businessDate", "order": "ASCENDING" },
      { "fieldPath": "castName", "order": "ASCENDING" }
    ]},
    { "collectionGroup": "discountLogs", "fields": [
      { "fieldPath": "businessDate", "order": "ASCENDING" },
      { "fieldPath": "timestamp", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "sessions", "fields": [
      { "fieldPath": "username", "order": "ASCENDING" },
      { "fieldPath": "lastActivityAt", "order": "DESCENDING" }
    ]}
  ]
}
```

デプロイ時のインデックスビルドに数分〜数十分かかるので **本番直前に時間を確保**。

---

## §10. データアーカイブ方針（M21）

- **物理削除しない**。`archivedAt` フラグ付与のみ
- 通常一覧 API は `where archivedAt == null` でフィルタ
- `?includeArchived=true` でアーカイブ込み取得（owner のみ）
- 税務上 **7 年（青色申告 10 年）保持義務**
- フロント `archiveOldData` の物理削除実装は **バグ**。BE 化と同時にフロントも `archivedAt` フラグ表示 UI に変更
- **アーカイブ後は read-only 表示 + CSV/PDF 出力のみ**（M21）。
  - `archivedAt` を null に戻す API は **提供しない**（不正温床）
  - データ復旧が必要な場合は DBA が直接 Firestore 操作 + 監査ログ手動追加

---

## §11. マルチ店舗設計

```
firestore/stores/{storeId}/...
                  │
                  ├── default          → Heaven's Garden (現状)
                  ├── snack-deep       → 将来
                  └── club-galaxy      → 将来
```

- **`storeId` は固定識別子**（変更不可）。`storeName` は表示用で変更可
- JWT に含めて配信 (`{ sub, jti, role, storeId, castId }`)
- フロントは `storeId` を意識せず、JWT のものを使う
- 将来「店舗切替 UI」を入れる場合は `userAccounts/{username}.allowedStoreIds: string[]` を Phase 3 で追加

---

## §12. CSV / Excel 出力

### 12.1 税理士用月次給与 CSV (`/api/export/payroll-csv`)

カラム:
```
キャストID, 源氏名, 本名, 期間, 勤務時間, 時給合計, バック合計, ボーナス, 額面合計,
払い時控除(10%), 日払合計, 天引合計, 前借合計, 差引支給額,
住所, 法定源泉(参考), 雑収入(参考)
```

UTF-8 BOM 付き、Excel で文字化けしないよう。

### 12.2 キャスト日経表 PDF/CSV (`/api/export/cast-ledger/:castId`)

既存 `cast1.2025.6.PDF` フォーマット準拠。
- ヘッダー: 店舗名 / タイトル / 源氏名 / 時給 / 先月売上 / 当月売上
- 表: 日 / 時間 / 日給 / Fドリンク / 本ドリンク / Fカクテル / 本カクテル / 本カクテルW / 同伴 / 本指 / 場内 / ボトルバック / その他 / P合計 / 日給合計 / ホステス税(-10%) / 総支給額
- フッター: 本名 / 住所 / 株式会社CATSWINGS / 代表取締役 鄭 憲一

実装は `frontend/src/utils/castLedger.ts` の HTML テンプレを Puppeteer + Chromium で PDF 化。

### 12.3 会計 CSV (`/api/export/billing-csv`)

税務調査時の生データダンプ用。`?from=&to=&includeArchived=true&includeVoided=true` で全件取得可能。

---

## §13. リアルタイム同期 / フロント接続戦略

### 13.1 Phase 1（MVP） — 差分ポーリング

- フロントは `GET /api/tables?updatedAfter=<lastUpdatedAt>` を 30 秒間隔
- 楽観的更新 + サーバーレスポンス上書き
- 対象: `tables` `billingRecords` `attendanceRecords`

### 13.2 Phase 2 — onSnapshot 解禁

- セキュリティルールを read-only で開放（§8.2）
- Firebase Auth カスタムトークン経由で `request.auth.token` を有効化
- フロントの `useStore` を `onSnapshot` ベースに置換
- Service Worker でオフラインキャッシュ + オンライン復帰時同期

### 13.3 フロント `store.tsx` の段階移行

1. **Phase A**: `frontend/src/api/` を新設、各 mutation 関数を fetch 化
2. **Phase B**: 初期化を mock → API 取得に切替
3. **Phase C**: `flMetrics` の `useMemo` 内ハードコード `staffFixedCost = 28800` を削除、`/api/metrics/fl` から取得
4. **Phase D**: `auth.tsx` を `dummyAccounts` 直接参照から `POST /api/auth/login` 経由に置換、JWT 保存

---
## §14. 実装優先度・コードタスク（クロウ⑧反映で外部依頼と分離）

### 14.1 フェーズ分割

| Phase | 完了基準 | 主要タスク | デプロイ前提 |
|---|---|---|---|
| **P0** | foundation + 認証 + 営業日基盤 + 致命 2 件解消 | foundation lib (`businessDate`/`errors`/`audit`/`sessions`)、`middleware/auth` 刷新（`jti` / `requireRole` / idle 失効）、bcrypt PIN + 段階ロック、`OrderItem.id`、`AttendanceRecord` ISO 化、`businessDayCutoffHour=5` 統一、`archivedAt` ソフト削除、Profit staff 遮断、FL ローカル計算化 | クロウ R4 §14.4 の **FE/BE 同時デプロイ手順** |
| **P0.5** | 伝票番号アトミック採番 | `metadata/billing.nextReceiptNumber` を transaction で `increment`、レイトレース無し | P0 後 |
| **P1** | 勤怠 / 経費 / 前借 / 日報 / レジ締 / void / refund / ページネーション | `attendance` `expenses` `advances` `dailyReports` ルーター新設、`POST /billings/:id/void` + `dailyAggregates` decrement、`reissueParentId` チェーン遡及、`?cursor=...` ページネーション、CashDrawer reconciliation | P0.5 後 |
| **P2** | 給与計算 + FL 指標 + Firestore インデックス | `lib/payroll.ts`（15 分 + ルーズタイム + 0.9 係数）、`/api/metrics/fl/today` `/monthly`、`firestore.indexes.json` 反映 | **税理士確認後**（§15 ブロッカー解消が前提） |
| **P3** | 帳票出力 + アーカイブ + リアルタイム同期 + シード | CSV / Excel / 日経表 PDF（`routes/export.ts`）、`archivedRefs/{id}` メタ + read-only 表示、`onSnapshot` 移行、本番 seed 投入 | P2 後 |

### 14.2 P0 内の実行順（破壊的変更ゼロから順次）

1. **§3.3 cutoffHour=5 固定**（businessDate 基盤 — 全 mutation の前提）
2. **§6.1 JWT 認証強化**（`jti` 必須、`sessions/{jti}`、idle 30 分、heartbeat 5 分、bcrypt + 段階ロック）
3. **§10 archive `archivedAt` フラグ**（既存読み出しに影響しないため先行可）
4. **Profit staff 遮断**（`/api/metrics/fl/*` を `requireRole('owner')` で塞ぐ）
5. **FL ローカル計算化**（フロント `staffFixedCost = 28800` ハードコード排除、暫定でローカル計算 → 後段で `/api/metrics/fl` 切替）
6. **§3.13 AttendanceRecord ISO 化**（`clockIn` / `workMinutes` / `businessDate`）
7. **MenuCategory.allowsBottleKeep フラグ**（M10）
8. **シャンパンセッパン UI**（注文時起点、`splitCastIds[]` スナップショット、再分配 `POST /tables/:id/orders/:orderId/redistribute`）

3 → 4 → 5 → 6 → 7 → 8 はバックエンド側を先に整え、フロント側は順次取り込み。1（cutoffHour）と 2（auth）は FE / BE 双方の同期切替が必要。

### 14.3 役割分担

| 担当 | 範囲 |
|---|---|
| **ホーク** | バックエンド全実装、Cloud Run デプロイ、Firestore Rules / インデックス deploy、Service Account 設定、ローカル / 統合テスト |
| **ハク** | Rev.4.1 起こし起点、必要時 BE スケルトン補助 |
| **クロウ** | レビュー・PM、各フェーズ完了確認、致命/重要/改善のチェック |
| **ふうや** | GO 判断、税理士アポ取り、本番 deploy 確認、業務観点の最終ジャッジ |

### 14.4 FE/BE 同時デプロイ手順（クロウ R4）

`businessDayCutoffHour` を 6 → 5 に切替える際の **デプロイ順序**:

1. **【先行】 BE: `StoreSettings.businessDayCutoffHour=5` を Firestore に書込**（管理画面 or seed 直書き、即時反映）
2. **【先行】 BE: `lib/businessDate.ts` の `BUSINESS_DAY_CUTOFF_HOUR_DEFAULT=5` で deploy**（Cloud Run リビジョン上書き）
3. **【検証】 既存 FE が古い 6 を使っていても、BE 算出 `businessDate` が真として保存される**（不整合期間あり）
4. **【後追い】 FE: `getBusinessDay()` ハードコード 6 を削除し、`StoreSettings.businessDayCutoffHour` を読みに行くよう修正、ビルド + Cloud Run リビジョン deploy**
5. **【検証】 FE 表示と BE 算出の `businessDate` が 1 営業日通して一致することを確認**

**移行期間（数時間〜1 日）の不整合許容**: 営業時間外（朝 5 時〜午後）のデプロイで実害ゼロ。深夜 0:00〜5:00 帯の営業中デプロイは禁止。

代替案として `StoreSettings.businessDayCutoffHour` を FE / BE 両方で読む形にしておけば、Firestore 値変更で同時切替できる（ただし FE 側の `getBusinessDay()` を Firestore 取得に書き換える工数が別途発生）。
## §15. 外部依頼事項（税理士確認 + 社長確認 + 物理機器）

クロウ⑧反映で §14 のコードタスクと分離。**P2 着手前のブロッカー** を含む。

### 15.1 税理士確認 8 項目

| # | 項目 | 確認内容 | ブロッカー先 | 優先度 |
|---|---|---|---|---|
| T1 | 給与計算式 `(時給 + バック) × 0.9 − 日払 − 天引` | 法定源泉税との関係。10% 控除部分の扱い、税理士見解を取得 | P2 給与確定 API | 🔴 |
| T2 | 法定源泉税（日給 5,000 円超過分の 10.21%） | `StoreSettings.legalWithholdingConfirmed` を on にできる根拠書面、PDF 添付必須 | P2 + フラグ on | 🔴 |
| T3 | 独自 10% 控除と法定源泉税の差額 = 雑収入 | 経理処理の妥当性、勘定科目 | P2 給与確定 API | 🟡 |
| T4 | サービス料 (TAX 20%) の課税ベース | 業界慣行 A (内税込×0.2) か B (税抜×0.2) か。税法上の正解を選定 | §4 会計ロジック | 🟡 |
| T5 | カード手数料 +10% を客に転嫁 | 適格請求書発行事業者として「販売手数料」「立替金」のどちらに該当するか | §4 会計ロジック | 🟡 |
| T6 | カード決済額の 3.5% を経費計上 | 経費名目（カード決済手数料 / 売上値引）と帳簿付け | §12 CSV 出力 | 🔵 |
| T7 | 値引き理由必須 + 監査ログ保存 | 改ざん不可性の税務調査対応水準 | §7 監査ログ | 🔵 |
| T8 | レシート再発行 (`reissueIndex`) の課税伝票としての扱い | 再発行枝番 `'000123-2'` を「写し」と明示するか、別伝票として申告するか | §3.x BillingRecord | 🔵 |

**フロー**: ふうや が税理士アポ → 税理士見解取得 → ふうや が `LEGAL_WITHHOLDING_CONFIRMED` 監査ログを起こす（税理士名 / 確認日 / PDF 添付）→ オーナー画面で `legalWithholdingConfirmed` フラグを on（PIN 再入力 + ステップアップ認証）→ P2 給与確定 API が動き出す。

### 15.2 社長確認案件

| # | 項目 | 内容 |
|---|---|---|
| O1 | 各キャストのバック単価表 | 全員違う前提。CSV 一括入稿フォーマットで初期投入（`PUT /api/casts` replace-all） |
| O2 | 各 staff の時給 | `UserAccount.hourlyRate` に直書き |
| O3 | 中間チェック票自動印字（50 分経過） | フロント発火、印字内容は §x で定義 |
| O4 | 営業時間（20:00〜LAST）と LAST 時刻 | StoreSettings に `closingTime` を持つか、卓ごとに自由か |
| O5 | カード決済機ベンダー | S1EP 据え置き端末、アプリ側は金額手入力のみ（決済連動なし）— 確定済 |
| O6 | レシートロゴ・店舗住所・電話番号 | StoreSettings の `storeName` / `storeAddress` / `storePhone` / `invoiceNumber` |
| O7 | 「Heaven's Garden」表記の用途範囲 | レシート先頭は固定、それ以外は `storeName` 可変 |
| O8 | アーカイブ閾値（`archivedAt` を立てる目安） | 半年 / 1 年 / 2 年。税務上の保存期間 7 年は別途、表示遅延対策として |

### 15.3 物理機器確認

| # | 項目 | 内容 |
|---|---|---|
| H1 | Galaxy Tab S10 FE+ 動作確認 | PWA / Chrome / Samsung Internet どれで運用するか、画面密度 / 解像度の確定 |
| H2 | EPSON TM-m30III-H 接続方式 | Bluetooth / LAN どちらで運用するか、ePOS Print SDK の通信先 |
| H3 | 店舗 LAN 構成 | タブレット同時接続 3-4 台、レシートプリンタ、ルーター。VPN / オフライン耐性の有無 |
## §16. マイグレーション戦略（Rev.3.1 → Rev.4.1）

既存 `backend/` は Rev.3.1 ベースのスキャフォールド。Rev.4.1 構造への移行は **インクリメンタル**で進める。

### 16.1 フェーズ A: foundation 整備（破壊的変更ゼロ）

- `src/lib/` 新設（`businessDate` / `errors` / `audit` / `sessions`）
- `middleware/auth.ts` を `jti` 対応に刷新（既存 token は再ログイン要求でフラッシュ）
- `routes/auth.ts` を bcrypt + 段階ロック + `/heartbeat` / `/logout` 対応に刷新
- `seed.ts` の PIN を bcrypt 化、`businessDayCutoffHour=5` を `StoreSettings` に追加
- `package.json` に `bcrypt` `zod` 追加

→ 既存 API のレスポンス形は維持、フロントは触らない。**deploy 後、再ログインだけ要求**。

### 16.2 フェーズ B: 型定義刷新

- `types.ts` を Rev.4.1 §3 ベースで刷新（`OrderItem.id` 必須、`Table.assignedCasts` / `mainNominationCastNames`、`BillingRecord` 命名統一、`AttendanceRecord` ISO 8601、`UserAccount` 判別ユニオン、etc.）
- 既存ハンドラも新型に追従
- フロント側 `mock.ts` との整合確認

### 16.3 フェーズ C: 新規ルーター追加

- `attendance` / `expenses` / `advances` / `dailyReports` / `metrics` / `archive`
- `billing` を `void` / `merge` / `split-bill` / `reissue` 対応に拡張
- `payroll` を `calculate` / `payment-dates` / `daily-payments` / `deductions` 構成に再編

### 16.4 フェーズ D: フロント切替

§13.3 参照。`store.tsx` を fetch 化し、API 経由データに置換。

### 16.5 リリース戦略

- Cloud Run 既存サービス `club-galaxy-backend` を **リビジョンアップで上書き**（消さない）
- 各リビジョンに `--tag rev-YYYYMMDD-HHMM` を付け、問題発生時は `gcloud run services update-traffic --to-revisions=OLD=100` で即ロールバック
- Firestore セキュリティルールは Phase 1 = クライアント直書き禁止のまま、ルール変更時のみ deploy
- Firestore インデックスは `firestore.indexes.json` を repo 管理、CI で deploy
## §17. エラーレスポンス・例外設計（M24）

### 17.1 統一フォーマット

```ts
interface ErrorResponse {
  error: string         // 機械可読コード ('AUTH_INVALID' 等)
  message: string       // 日本語の説明文
  details?: unknown     // 補助情報 (lockedUntil, validation errors, etc.)
}
```

### 17.2 `ApiError` + throw helpers（`backend/src/lib/errors.ts`）

```ts
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message)
    this.name = 'ApiError'
  }

  toJSON(): ErrorResponse {
    return {
      error: this.code,
      message: this.message,
      ...(this.details !== undefined ? { details: this.details } : {}),
    }
  }
}

export function throwInvalidCredentials(): never {
  throw new ApiError(401, 'AUTH_INVALID', 'ユーザー名または PIN が違います')
}

export function throwLocked(lockedUntil: string): never {
  throw new ApiError(429, 'PIN_LOCKED', 'PIN ロック中', { lockedUntil })
}

export function throwLegalWithholdingNotConfigured(): never {
  throw new ApiError(503, 'LEGAL_WITHHOLDING_NOT_CONFIGURED',
    '法定源泉税の税理士確認が完了していません')
}
```

`lockedUntil` は **ISO 8601 + +09:00** で必ず返す（クライアント側で残り秒数表示できるように）。

### 17.3 HTTP ステータスコード規約

| Status | 用途 | 代表 code |
|---|---|---|
| 400 | リクエスト不正（Zod バリデーション失敗） | `BAD_REQUEST`, `VALIDATION_FAILED` |
| 401 | 未認証 / トークン無効 | `AUTH_REQUIRED`, `AUTH_INVALID`, `AUTH_INVALID_TOKEN`, `SESSION_EXPIRED` |
| 403 | 権限不足 | `FORBIDDEN` |
| 404 | リソース不在 | `NOT_FOUND` |
| 409 | 状態競合 | `USER_EXISTS`, `RECEIPT_NUMBER_CONFLICT` |
| 429 | ロック中 | `PIN_LOCKED` |
| 503 | 設定未完 | `LEGAL_WITHHOLDING_NOT_CONFIGURED` |
| 500 | 内部エラー | `INTERNAL_ERROR` |

### 17.4 統一 `sendError` ハンドラ

```ts
export function sendError(res: Response, err: unknown): void {
  if (err instanceof ApiError) {
    res.status(err.status).json(err.toJSON())
    return
  }
  console.error(err)
  res.status(500).json({
    error: 'INTERNAL_ERROR',
    message: '内部エラーが発生しました',
  } satisfies ErrorResponse)
}
```

各ルートハンドラは `try { ... } catch (e) { sendError(res, e) }` の包囲が必須。Express 5 の async ミドルウェアエラーは自動 catch されるが、本設計では明示包囲で「未捕捉が即 500 を返す」事故を防ぐ。
## §18. テスト・運用

### 18.1 テスト戦略

| レイヤ | フレームワーク | 対象 |
|---|---|---|
| ユニット | Vitest | `lib/businessDate` `lib/pricing` `lib/payroll` `lib/champagneSplit` `lib/salesAttribution` |
| 統合 | Vitest + supertest + Firebase Emulator (Firestore) | ルートハンドラ、認証ミドルウェア、transaction 整合 |
| E2E | Playwright（フロント側 repo） | フロント PWA + Cloud Run staging |

CI: GitHub Actions で `npm run build` + `npm test` を毎 PR で。Cloud Build 連携は将来検討。

### 18.2 Cloud Functions 自動打刻の運用注意（クロウ R6）

`processSchedules`（1 分 cron）でスケジュールに基づき自動打刻するが、**精度に対する許容誤差** を明文化する:

- **許容誤差は ±数分**（Cold Start で数十秒〜2 分程度の遅延が起こり得る）
- `processSchedules` の cron 発火タイミングは **UI 表示上のヒント**であり、給与計算根拠としては使わない
- `clockIn` / `clockOut` は **サーバ算出値（Cloud Function 内で評価した `nowJstIso()`）を真とする**
- 1 分 cron が遅延した場合、対象 schedule は次の発火で取り込まれる（一度処理した schedule は `processedAt` フラグで二重実行防止）
- **過去 7 日以上前の `attendanceSchedules` は cron 対象外**（Cold Start 連鎖のリカバリ、`backfillBefore` 設定でスキップ可能）

### 18.3 監視・ログ

- Cloud Logging: 全リクエストの structured log（`severity` / `username` / `jti` / `path` / `status`）
- 認証失敗 / PIN ロック / 設定変更 / void / 法定源泉確認は **Slack / Discord 通知**（Webhook、`logging-router` 経由）
- 月次 FL 指標と売上推移は週次バッチでオーナー Discord にサマリー送付

### 18.4 デプロイ手順

```bash
# 1. ビルド検証
cd backend && npm run build

# 2. Firestore ルール / インデックス先行 deploy（必要時のみ）
firebase deploy --only firestore:rules,firestore:indexes \
    --project=club-galaxy0000

# 3. Cloud Run リビジョン deploy
gcloud run deploy club-galaxy-backend \
    --source=. \
    --region=asia-northeast1 \
    --project=club-galaxy0000 \
    --service-account=club-galaxy-backend@club-galaxy0000.iam.gserviceaccount.com \
    --tag=rev-$(date +%Y%m%d-%H%M)

# 4. リビジョン確認
gcloud run revisions list --service=club-galaxy-backend \
    --region=asia-northeast1 --project=club-galaxy0000

# 5. ロールバック（事故時のみ）
gcloud run services update-traffic club-galaxy-backend \
    --to-revisions=PREVIOUS_REV=100 \
    --region=asia-northeast1 --project=club-galaxy0000
```

### 18.5 Service Account 構成

- `club-galaxy-backend@club-galaxy0000.iam.gserviceaccount.com`（バックエンド Cloud Run 用、専用 SA）
  - `roles/datastore.user`（Firestore read/write）
  - `roles/logging.logWriter`（Cloud Logging 出力）
  - `roles/firebase.admin` は付与しない（Phase 1 で不要）
- 既存のデフォルト Compute SA (`733762302128-compute@developer.gserviceaccount.com`) を Cloud Run から外し、専用 SA に切替（P0 最終 deploy 時に実施）

---

*Rev.4.1 文書終わり*
