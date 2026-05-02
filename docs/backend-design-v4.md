# CLUB GALAXY バックエンド設計書（Rev.4 — フロント追補02/03 反映版）

> 作成: 2026-04-29 ホーク (Claude Opus 4.7)
> 改訂対象: Rev.3.1 (2026-04-22)
> 改訂主旨: 追補02 / 追補03 / SPEC_CONFLICTS.md / TRUST UI 改修まとめ までを反映し、
> **現状フロント実装 (`frontend/src/data/mock.ts` および `utils/*`) を真**として
> サーバー側スキーマ・ロジック・API を再定義する。
> Rev.3.1 (`backend-design.md`) は比較用に残置。

---

## 0. Rev.3.1 からの主要変更点（要旨）

| # | 変更 | 由来 |
|---|---|---|
| 1 | Table 指名モデルを `assignedCasts` + `mainNominationCastNames` (複数) + `isDouhan` / `isBanaiShimei` の独立フラグ構造に刷新 | 追補02 R1 / 追補03 R24 |
| 2 | `BackType` を 17 種に拡張（FD/本D/Fカク/本カク/本カクW/Fショ/本ショ/FP/本P/FB/本B/同伴/本指名/場内指名/ボトルバック/ヘルプ/その他） | 追補02 先方 2026-04-23 / 追補03 R19 |
| 3 | ボトルバックは「%」単位で扱う（`PERCENT_BACK_TYPES` に明示） | 追補03 R19 |
| 4 | シャンパン等高額ボトルは本指名複数時に「セッパン」(売上均等割 + 平均バック率) | ビデオレビュー N1〜N4 |
| 5 | OrderItem に `castName` `bonusCastName` `bonusAmount` を追加（本指名以外への "ボーナス的" 加算） | 追補03 R18 |
| 6 | `displayOrderName()` で「本指名あいり」「本カクみく」等のキャスト名付き表記を生成 | 指示書 §2.3 / 追補02 |
| 7 | 給与計算式を `(時給 + バック) × 0.9 − 日払 − 天引` に確定。MAX 式・保証率は参考表示のみ。深夜割増フラグ・独自控除フラグは廃止 | SPEC_CONFLICTS.md |
| 8 | 時給は **ルーズタイム 15 分 + 15 分単位切り上げ** (追補03 R25) | `utils/payroll.ts` |
| 9 | 営業日カットオフ時刻を **5 時に統一** (Rev.3.1 と同じ) ※ フロントの 6 時はバグとして合わせる | Rev.3.1 §3.3 |
| 10 | `AttendanceRecord.clockIn / clockOut` を **ISO 8601 + workMinutes** に統一（HH:MM / workHours は廃止） | Rev.3.1 §5 / 致命4 |
| 11 | `AttendanceSchedule`（事前出勤予定）コレクション新設 | 追補02 R4 |
| 12 | `Table` に `setDiscountPerSet` `timeAdjustmentMinutes` `extensionHistory` `checkTicketPrintedAt` を正式追加 | 追補02 R12-5 / フロント既存 |
| 13 | `ExtensionEntry` に `nominatedCastName` `orderMenuItemId` を持たせ延長取消フローを正規化 | 追補02 R8-2 / R8-3 |
| 14 | `MenuCategory` マスタ（並び替え・非表示・追加対応）コレクション新設 | 追補02 R5 |
| 15 | `EXTENSION_CHARGES` (30 分 = 1000 円 / 60 分 = 3000 円) を初期値として `StoreSettings` 配下に格納 | 指示書 §6.2.3 |
| 16 | `ReceiptSnapshot` をフロント詳細形 (receiptNumber / receiptName / receiptPurpose / setFee / consumptionTax / discount / orders[] / startTime / nominationLabel / completedAt) で再定義 | フロント `mock.ts:233-247` |
| 17 | `BillingRecord.castNamesSnapshot` を `castSnapshot: {id,name,realName?}[]` に格上げ（税理士出力で realName 必要） | Rev.3.1 既述 + フロント |
| 18 | `BillingRecord` に `voidedAt/voidedBy/voidReason/replacedBy` を追加（フロント未実装、BE で先行） | Rev.3.1 |
| 19 | `DailyReport` を `closedAt/reopenedAt/reopenedBy/reopenReason` 持ちに拡張、`businessDate` を主キー化 | Rev.3.1 |
| 20 | アーカイブは **物理削除しない**（フロント `archiveOldData` は filter で消しているがバグ。BE は `archivedAt` フラグ方式） | Rev.3.1 §6.9 |
| 21 | 給与支払日（前半→当月末日 / 後半→翌月15日、土日祝前倒し）を `/api/payroll/payment-dates` で配信（フロント `paymentDate.ts` をサーバー化） | フロント `utils/paymentDate.ts` |
| 22 | `StoreSettings` から `enableOvertimePremium` `enableCustomDeduction` `customDeductionRate` を **削除**。深夜割増・独自10%控除は SPEC_CONFLICTS の決定で運用しない | SPEC_CONFLICTS.md |

---

## 1. 設計方針

### 1.1 原則

1. **フロントが真**: 現状フロント (`frontend/src/data/mock.ts` の型 + `utils/*` の計算ロジック) を仕様の最終確定状態として扱い、バックエンドはこれに合わせる
2. **計算は段階的にサーバー移行**: フロント `utils/*` を「同等関数」としてサーバーに移植、API レスポンスでサーバー算出値を返し、フロントは差し替えで対応
3. **金銭関連は不変・追跡可能**: 監査フィールド + soft-delete + 監査ログ。物理削除禁止
4. **日付またぎは `businessDate`** で正規化、サーバー側で焼く（クライアント送信値は信用しない）
5. **エラーフォーマット統一** (Rev.3.1 と同じ):
   ```ts
   interface ErrorResponse { error: string; message: string; details?: unknown }
   ```

### 1.2 技術スタック (Rev.3.1 から踏襲)

- Express 5 + TypeScript
- Firebase Admin SDK (Firestore)
- JWT 認証 (12h 有効) + 共有端末向け **30 分無操作で失効** (idle expiry) を追加
- PIN は **bcrypt ハッシュ**、ログイン試行 **5 回 / 分でレート制限**
- Node.js 20 LTS

### 1.3 Firestore vs Postgres の判断（Rev.3.1 の議論を再確認）

集計・JOIN・税務 CSV 出力が要件の柱だが、本店舗の規模（卓 10 / 同時同接 3-4 / 月次会計レコード〜数千件）であれば **Firestore で十分**。判断の根拠:

- 月次集計は `dailyAggregates` キャッシュで Firestore の弱点を回避できる
- CSV 出力は月次バッチで全量読みすればよい（数千件レベル）
- マルチ店舗展開時もコレクション分割でスケール可能
- Postgres に移行するメリットは「複雑な JOIN を `payroll/calculate` で書ける」程度で、本要件では月次集計が主役なので利点が薄い

**結論**: Firestore 継続。ただし `payroll/calculate` と `metrics/fl/monthly` の実装で Firestore の限界を感じたら、Postgres ミラー（Cloud SQL）への ETL を検討する余地を残す。

---

## 2. 日付・タイムゾーン規約

Rev.3.1 §3 を踏襲。要点のみ再掲。

### 2.1 タイムゾーンは JST 固定
- timestamp は **ISO 8601 + +09:00** で保存
- `YYYY-MM-DD` は JST 日付の意味で統一

### 2.2 `businessDate` フィールド
- 全 mutation 系コレクションに必須
- サーバー側で `toBusinessDate(timestamp, cutoffHour)` で算出
- カットオフ時刻 default = **5 時** (`StoreSettings.businessDayCutoffHour`)。00:00 〜 04:59 は前日扱い

### 2.3 ユーティリティ
```ts
// backend/src/utils/business-date.ts
export function toBusinessDate(timestamp: string, cutoffHour: number): string {
  const d = new Date(timestamp)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)
  if (jst.getUTCHours() < cutoffHour) {
    jst.setUTCDate(jst.getUTCDate() - 1)
  }
  return jst.toISOString().slice(0, 10)
}
```

### 2.4 フロントとの統合（要修正）
フロント `utils/businessDay.ts` の既定値が `boundaryHour = 6` になっている。BE と揃えるため **5 に修正してから API 化**する（営業終了時刻が 4-5 時付近のため、6 時境界だと終電後の会計が翌日扱いになる事故源）。

---

## 3. データモデル（Firestore コレクション）

### 3.1 コレクションツリー

```
firestore
└── stores/{storeId}                       ← マルチ店舗対応 (デフォルト "default")
    ├── tables/{id}
    ├── casts/{id}
    ├── userAccounts/{username}
    ├── menuCategories/{id}                ★ 新規 (追補02 R5)
    ├── guestMenuItems/{id}
    ├── castMenuItems/{id}
    ├── setPrices/{id}
    ├── chargeItems/{id}
    ├── billingRecords/{id}                + void/refund + receiptSnapshot
    ├── discountLogs/{id}                  (append-only)
    ├── dailyPayments/{id}                 (旧 dailyPayRequests からリネーム)
    ├── deductions/{id}
    ├── advancePayments/{id}
    ├── expenses/{id}
    ├── attendanceRecords/{id}
    ├── attendanceSchedules/{id}           ★ 新規 (追補02 R4)
    ├── castMoveLogs/{id}                  ★ 新規 (追補02 R10-3 付け回し履歴)
    ├── bottleKeeps/{id}
    ├── dailyWork/{castId}_{businessDate}  (集計済キャッシュ)
    ├── dailyReports/{businessDate}
    ├── dailyAggregates/{businessDate}     (FL 指標キャッシュ)
    ├── auditLogs/{id}                     (全 mutation)
    ├── archivedRefs/{id}                  (アーカイブ操作の履歴のみ。実データは元コレクション残置)
    ├── storeSettings/(singleton)
    └── metadata/billing                   (nextReceiptNumber カウンタ等)
```

### 3.2 共通インターフェース

```ts
interface AuditFields {
  createdBy: string         // username
  createdAt: string         // ISO 8601 + offset
  updatedBy?: string
  updatedAt?: string
}

interface SoftDeletable {
  deletedAt?: string
  deletedBy?: string
  deleteReason?: string
}

// 17 種 — フロント mock.ts:151-158 と完全一致
type BackType =
  | 'FD' | '本D'
  | 'Fカク' | '本カク' | '本カクW'
  | 'Fショ' | '本ショ'
  | 'FP' | '本P'
  | 'FB' | '本B'
  | '同伴' | '本指名' | '場内指名'
  | 'ボトルバック' | 'ヘルプ' | 'その他'

// ボトルバックのみ % 単位で格納 (0-100 整数)。実計算時に /100 して率にする
const PERCENT_BACK_TYPES: readonly BackType[] = ['ボトルバック'] as const
```

### 3.3 User / UserAccount

```ts
interface UserAccount extends AuditFields {
  username: string             // Doc ID
  pinHash: string              // bcrypt
  role: 'owner' | 'staff' | 'cast'
  castId?: number              // role='cast' のとき必須
  displayName: string
  hourlyRate?: number          // ボーイ用 (role='staff')
  loginAttempts?: number
  lockedUntil?: string         // ISO 8601
  pinChangedAt?: string        // PIN 変更日時 (棚卸用)
}
```

**変更点**: フロント `mock.ts:878-893` の生 PIN は廃止。`pinHash` のみサーバー保存、API では一切返さない。

### 3.4 Cast

```ts
interface Cast extends AuditFields {
  id: number
  name: string                 // 源氏名
  realName?: string            // 本名 (税理士出力 / 日経表 PDF)
  address?: string             // 住所 (日経表 PDF 下部)
  hourlyRate: number
  backRates: Partial<Record<BackType, number>>
                              // 円単位 (ボトルバックのみ %)
  guaranteeRate: number        // 0.0-1.0、UI 参考表示のみ・計算には使わない
  active: boolean
  onBreak?: boolean
  lastAssignedAt?: string      // 付け回し待機時間順表示用
}
```

### 3.5 Table

```ts
type TableStatus = 'empty' | 'occupied' | 'ending' | 'alert' | 'settled'
                 // settled は合算会計後の "支払い済 + 自動リセット待ち"

interface ExtensionEntry {
  id: number
  minutes: 30 | 60
  timestamp: string                  // ISO 8601
  nominatedCastName?: string         // 延長時に指名したキャスト
  orderMenuItemId?: number           // 連動して追加した注文 (取消時に同時削除)
}

interface Table extends AuditFields {
  id: number
  number: string                     // "1", "2", "VIP1" 等
  status: TableStatus
  guestCount: number
  startTime: string | null           // ISO 8601
  /** 現在「対応中」のキャスト (動的)。卓間付け回しで変動 */
  assignedCasts: string[]
  /**
   * 本指名担当 (固定、複数可)。
   * - 売上・本指名バックはここに帰属する (移動後もこの卓の本指名はこの子)
   * - 複数指定時はシャンパン等のセッパン対象 (calcChampagneSplit)
   */
  mainNominationCastNames: string[]
  isDouhan?: boolean                 // 本指名と共存可
  isBanaiShimei?: boolean
  setCount: number                   // 基本セット数 (通常 1)
  orders: OrderItem[]                // 配列で保持 (Firestore 1MB 制限内、典型 10-30 行)
  /** 営業日。サーバー側で startTime から焼く */
  businessDate: string
  checkTicketPrintedAt?: string      // 中間チェック票印字済タイムスタンプ (二重印字防止)
  setDiscountPerSet?: number         // セット 1 件あたり値引額 (円、追補02 R12-5)
  timeAdjustmentMinutes?: number     // 残り時間の手動微調整 (±)
  extensionHistory?: ExtensionEntry[]
}
```

**実装上の注意**: Table は頻繁に書き換わる + リアルタイム同期対象なのでドキュメントサイズに注意（orders 配列が肥大化しないよう、会計確定時に `billingRecords` に転記したら `resetTable` で初期化する既存挙動を BE でも維持）。

### 3.6 OrderItem

```ts
interface OrderItem {
  menuItem: { id: number; name: string; price: number; cost: number; castBack: number; category: 'guest'|'cast'; subcategory: string; backType?: BackType }
  quantity: number
  castName?: string                  // 紐付けキャスト (担当割当)
  /** 追補03 R18: ボーナス加算先 (任意)。本指名以外のキャストに少額ボーナスを付ける用 */
  bonusCastName?: string
  bonusAmount?: number               // 円
}
```

`menuItem` は注文時点のスナップショット（後でメニュー価格を変えても過去伝票が壊れないため）。

### 3.7 MenuCategory (新規)

```ts
interface MenuCategory extends AuditFields {
  kind: 'guest' | 'cast'
  id: string                         // 'shochu', 'fdrink', 'custom-no-alcohol' 等
  label: string                      // '焼酎', 'Lドリンク(F)' 等
  order: number                      // 表示順 (昇順)
  hidden?: boolean
  custom?: boolean                   // ユーザー追加カテゴリ (削除可判定)
}
```

並び替え・非表示・カスタムカテゴリ追加を管理画面から制御する。

### 3.8 GuestMenuItem / CastMenuItem

```ts
interface GuestMenuItem extends AuditFields {
  id: number
  name: string
  price: number
  cost: number
  castBack: number
  category: 'guest'
  subcategory: string                // MenuCategory.id を参照 (kind='guest')
  archived?: boolean                 // メニュー非表示（過去伝票の参照は維持）
}

interface CastMenuItem extends AuditFields {
  id: number
  name: string
  price: number
  cost: number
  castBack: number
  category: 'cast'
  subcategory: string                // MenuCategory.id を参照 (kind='cast')
  backType: BackType                 // 給与計算で参照する種別キー
  archived?: boolean
}
```

### 3.9 SetPrice / ChargeItem

```ts
interface SetPrice extends AuditFields {
  id: string                         // 'set-2000', 'set-2200', 'set-2400'
  label: string                      // '20:00〜', '22:00〜', '24:00〜LAST'
  price: number                      // 4000 / 5000 / 6000
  cost: number                       // 300 (default)
  startHour: number                  // 適用開始時刻 (20, 22, 24)
}

interface ChargeItem extends AuditFields {
  id: string                         // 'single-charge', 'douhan', 'shimei', 'banai', 'help'
  label: string
  price: number
  cost: number
}
```

時間帯別セット料金 → 適用判定はサーバー `getSetPriceForTime(startTime)` で行う（フロント `mock.ts:593-601` と同等実装）。

### 3.10 BillingRecord

```ts
type PaymentMethod = 'cash' | 'card' | 'mixed'

interface BillingRecord extends AuditFields, SoftDeletable {
  id: number
  tableNumber: string
  total: number
  paymentMethod: PaymentMethod
  cashAmount?: number
  cardAmount?: number
  cardFee?: number                   // 客に乗せたカード手数料 (10%)
  timestamp: string                  // ISO 8601 (HH:MM のみは廃止)
  businessDate: string               // YYYY-MM-DD (サーバー算出)
  receiptNumber: number              // 採番は metadata/billing.nextReceiptNumber tx 内
  reissueSuffix?: number             // 再発行時の枝番 (000123-2 → suffix=2)
  /** 本指名卓の場合の担当キャスト ID 群 (複数本指名対応) */
  nominatedCastIds?: number[]
  subtotalBeforeTax?: number         // TAX 前小計 (保証計算・売上重畳用)
  /** 税理士提出に realName が必要なため id/name/realName セットで保持 */
  castSnapshot?: { id: number; name: string; realName?: string }[]
  receiptSnapshot?: ReceiptSnapshot
  /** 合算会計の元卓番号群 */
  mergedFromTableNumbers?: string[]
  // void/refund (DELETE は使わない)
  voidedAt?: string
  voidedBy?: string
  voidReason?: string
  replacedBy?: number                // 差し替え先 BillingRecord.id
}

interface ReceiptSnapshot {
  receiptNumber: number
  receiptName: string                // 宛名 (default '上様')
  receiptPurpose: string             // 但書 (default '飲食代として')
  subtotal: number                   // 商品+セット計
  setFee: number                     // セット料金小計
  tax: number                        // TAX (サービス料 20%) 額
  consumptionTax: number             // 消費税 10% 額 (内税表示用)
  discount: number                   // 値引き額
  orders: { menuItem: { id: number; name: string; price: number }; quantity: number; castName?: string }[]
  startTime: string | null           // 卓開始時刻
  nominationLabel: string            // 'フリー' | '本指名 あいり, みく + 同伴' 等 (utils/nomination.ts)
  completedAt: string                // ISO 8601
  /** 合算会計時の卓番号リスト (R13 領収書印字用) */
  mergedTables?: string[]
  /** 割り勘人数 (1 = 通常会計) */
  splitCount?: number
}
```

**voidedAt と deletedAt の使い分け** (Rev.3.1 §5.1 の脚注を継承):
- `voidedAt`: 取引として発生したが取り消された（**会計・税務上は記録残す**）
- `deletedAt`: 入力ミス等で取引自体が無かった（owner 承認限定の例外）

### 3.11 DiscountLog

```ts
interface DiscountLog extends AuditFields {
  id: number                         // append-only
  billingRecordId?: number           // 紐付く伝票 (会計確定後)
  tableNumber: string
  originalTotal: number
  discountAmount: number
  reason: string                     // バリデーション必須 (空文字禁止)
  reasonCategory?: '端数カット'|'VIP値引'|'店長承認'|'クーポン'|'その他'
  operator: string                   // username
  timestamp: string                  // ISO 8601
  businessDate: string
}
```

DELETE 不可。値引き額 > 0 で `reason` 空欄は API バリデーションで弾く。

### 3.12 DailyWork (集計キャッシュ)

```ts
interface DailyWork extends AuditFields {
  id: string                         // `${castId}_${businessDate}` をDoc IDに
  castId: number
  businessDate: string               // YYYY-MM-DD
  workMinutes: number                // 勤務分 (AttendanceRecord 集計)
  paidMinutes: number                // 給与対象分 (calcPaidMinutes 適用後)
  hourlyPay: number                  // calcHourlyPay 結果
  backs: Partial<Record<BackType, number>>   // 件数 (本指名 1, FD 3 等)
  backTotal: number                  // 円換算合計
  sales: number                      // 個人小計売上 (本指名重畳含む)
}
```

会計時 / 勤怠更新時に `dailyWork/{castId}_{businessDate}` を tx 内で upsert する。

### 3.13 DailyPayment / Deduction / AdvancePayment

```ts
interface DailyPayment extends AuditFields, SoftDeletable {
  id: number
  castId: number                     // ボーイは負数等で一意化
  castName: string
  amount: number                     // 額面 (10% 控除前)
  amountAfterDeduction: number       // 10% 控除後の手渡し額 (サーバー計算)
  source: 'register' | 'transfer'
  staffType: 'cast' | 'boy'          // 必須昇格
  businessDate: string
  timestamp: string
}

interface Deduction extends AuditFields, SoftDeletable {
  id: number
  castId: number
  amount: number
  reason: string
  source: 'register' | 'transfer'
  staffType: 'cast' | 'boy'          // 必須昇格
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

### 3.14 Expense

```ts
type ExpenseCategory = '仕入れ（酒等）' | '税金' | '雑費' | string  // string は将来カテゴリ追加用

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

### 3.15 AttendanceRecord (時刻型を ISO 8601 化)

```ts
interface AttendanceRecord extends AuditFields {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'
  businessDate: string                  // YYYY-MM-DD (サーバー算出)
  clockIn: string                       // ISO 8601 full timestamp
  clockOut: string | null               // ISO 8601 (翌日3:00 等もOK)
  breakMinutes: number
  workMinutes: number                   // サーバー算出 = (clockOut-clockIn)分 - breakMinutes
  paidMinutes: number                   // ルーズタイム + 15分単位切り上げ後
  scheduledClockIn?: string | null      // 事前予定との比較用 (ISO 8601)
  /** 自動打刻の場合 true (AttendanceSchedule から生成) */
  autoCreated?: boolean
}
```

**バリデーション**:
- `clockOut < clockIn` は **不正**（日付またぎは clockOut が翌日の ISO 8601 になるので問題ない）
- `clockOut - clockIn > 24h` は不正
- 同一 staff の重複 `clockIn` (前回 `clockOut` が null のまま新規作成) は 409 Conflict

### 3.16 AttendanceSchedule (新規)

```ts
interface AttendanceSchedule extends AuditFields {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'
  businessDate: string                  // YYYY-MM-DD
  scheduledClockIn: string              // ISO 8601 (HH:MM ではなく完全 timestamp)
  processed?: boolean                   // AttendanceRecord 化済み
  processedAt?: string
  processedRecordId?: number            // 紐付く AttendanceRecord.id
}
```

**サーバー側スケジューラ**: 1 分間隔の Cloud Functions スケジュールジョブ (または Cloud Scheduler) で `scheduledClockIn <= now() && !processed` を走査し、`AttendanceRecord` を生成 + `processed = true` を立てる。フロント `setInterval` 方式は **タブを閉じると動かない** ため、サーバー化が必須。

### 3.17 CastMoveLog (新規、追補02 R10-3)

```ts
interface CastMoveLog extends AuditFields {
  id: number
  castName: string
  fromTableId: number | null         // null = 待機から
  toTableId: number | null           // null = 待機戻し
  timestamp: string                  // ISO 8601
  businessDate: string
  /** 接客時間計算用: 元の卓に何分対応していたか (サーバー算出) */
  durationMinutes?: number
}
```

将来「キャスト別接客時間レポート」の根拠データ。Phase 3 で UI 化想定。

### 3.18 DailyReport

```ts
interface DailyReport extends AuditFields {
  businessDate: string                  // Doc ID
  initialCash: number
  cashSales: number
  cardSales: number
  totalSales: number
  dailyPayTotal: number                 // 当日日払い合計
  cashExpenseTotal: number              // レジ現金からの経費
  cashAdvanceTotal: number              // レジ現金からの前借り
  theoreticalCash: number               // 計算値
  actualCash: number                    // 入力値
  difference: number                    // actual - theoretical
  note: string
  operator: string                      // username
  closedAt: string                      // 締め確定日時
  reopenedAt?: string                   // reopen 履歴
  reopenedBy?: string
  reopenReason?: string
}
```

**ルール**:
- `closedAt` が立っているレコードに紐付く `billingRecords` の void / `expenses` の delete は **422**
- 修正したい場合は `POST /api/daily-reports/:businessDate/reopen` (owner のみ) → 修正 → 再締め
- reopen は `auditLogs` に必ず記録

### 3.19 BottleKeep

```ts
interface BottleKeep extends AuditFields, SoftDeletable {
  id: number
  bottleName: string
  remaining: number                     // 0-100 (%)
  storageLocation: string
  customerName: string
  tableNumber?: string                  // 預け入れ時の卓 (任意)
  expiresAt?: string                    // 期限 (任意)
}
```

### 3.20 StoreSettings (singleton)

```ts
interface StoreSettings extends AuditFields {
  // 税・手数料
  taxRate: number                       // TAX (サービス料) default 0.20
  consumptionTaxRate: number            // 消費税 default 0.10 (内税扱い、合計加算しない)
  cardFeeRate: number                   // 客向けカード手数料 default 0.10
  cardProcessingFeeRate: number         // 店舗→決済会社 default 0.035
  // レジ
  initialCash: number                   // default 100000
  // 給与
  closingDay: number                    // 締め日 default 15
  payrollDeductionRate: number          // 給与控除率 default 0.10 (SPEC_CONFLICTS)
  dailyPayDeductionRate: number         // 日払い時控除率 default 0.10
  looseTimeMinutes: number              // ルーズタイム default 15
  payUnitMinutes: number                // 給与単位 default 15
  // 営業日
  businessDayCutoffHour: number         // default 5
  // 店舗情報
  storeName: string                     // 'CLUB GALAXY' (実店舗は 'Heaven\'s Garden')
  storeAddress: string
  storePhone: string
  invoiceNumber: string                 // 'T5390001005970'
  // 延長料金
  extensionCharges: { '30': number; '60': number }   // {30: 1000, 60: 3000}
  // 中間チェック票
  checkTicketAutoPrintMinutes: number   // 50 (セット開始から N 分経過で自動印字)
  // セッション
  sessionIdleMinutes: number            // 共有端末の無操作失効。default 30
  jwtExpiresHours: number               // default 12
}
```

**Rev.3.1 から削除したフィールド**:
- `enableOvertimePremium` / `enableCustomDeduction` / `customDeductionRate`
  → SPEC_CONFLICTS で「保証率も独自10%控除も実質オフ運用」と決まったため不要

### 3.21 DailyAggregate (キャッシュ)

```ts
interface DailyAggregate {
  businessDate: string                  // Doc ID
  totalSales: number
  cashSales: number
  cardSales: number
  cardFeeIncome: number                 // 客から取った手数料収入
  cardProcessingFee: number             // 決済会社支払
  foodCost: number                      // 商品原価合計 (注文確定時に焼く)
  laborCostHourly: number               // 時給ぶん (workMinutes × hourlyRate)
  laborCostBack: number                 // バック合計
  expenseTotal: number
  guestCount: number
  tableCount: number
  billingCount: number
  flRate: number                        // (foodCost + laborCostHourly + laborCostBack + cardProcessingFee) / totalSales
  profit: number
  updatedAt: string
}
```

`billingRecords.create` / `attendance` 更新 / `expenses.create` の各 mutation tx 末尾で同 businessDate のレコードを upsert する。

### 3.22 AuditLog

```ts
interface AuditLog {
  id: string
  collection: string
  documentId: string | number
  action: 'create' | 'update' | 'delete' | 'void' | 'reopen' | 'archive'
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  userId: string                        // 操作者 username
  userRole: 'owner' | 'staff' | 'cast'
  timestamp: string
  reason?: string                       // void/delete/reopen 時の理由
  ipAddress?: string                    // 任意
}
```

全 mutation で `auditLogs.add()` を tx 内で実行（fire-and-forget は不可、整合性必須）。

### 3.23 metadata/billing (singleton)

```ts
interface BillingMetadata {
  nextReceiptNumber: number             // 次の伝票番号
  lastReceiptIssuedAt: string
  receiptResetAt?: string               // 年初リセット等の履歴
}
```

採番は `POST /api/billing/records` の Firestore tx 内:
1. `metadata/billing` を get
2. `nextReceiptNumber` を `BillingRecord` に書き、+1 して set
3. 同 tx で `BillingRecord` 本体を保存
4. tx 失敗時は番号スキップなし（リトライで再採番）

---

## 4. ビジネスロジック

### 4.1 給与計算 (SPEC_CONFLICTS 反映の最終形)

```
[キャスト]
  workMinutes = AttendanceRecord 集計 (期間内全レコードの workMinutes 合計)
  paidMinutes = calcPaidMinutes(workMinutes, looseTimeMinutes=15, payUnitMinutes=15)
                  ※ 1 出勤ごとに適用 (期間合算後に一括ではない)
  hourlyPay = floor(hourlyRate × paidMinutes / 60)

  backTotal = Σ (件数 × backRates[BackType])
              ※ 'ボトルバック' のみ % 単位 → backTotal += floor(売上 × rate/100)
              ※ シャンパン等は calcChampagneSplit() で本指名複数時セッパン
  bonusTotal = Σ OrderItem.bonusAmount (bonusCastName == cast.name のもの)

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
  payrollDeduction: number              // (grossPay * 0.10)
  dailyPayTotal: number
  deductionTotal: number
  advanceTotal: number
  netPay: number
  // 参考表示
  salesTotal: number
  guaranteeReference: number            // 計算には未使用
}
```

**法定源泉税の扱い**: SPEC_CONFLICTS で「指示書ベースの 10% 控除式」採用、独自 10% 控除と法定源泉の差額を雑収入にする処理は **廃止**。法定源泉税が必要な場合は別途税理士確認後に追加するが、現時点では `SalaryCalculation` に含めない。

### 4.2 シャンパン等のセッパン計算

```ts
// utils/champagne-split.ts (フロント `champagneSplit.ts` をサーバー移植)
function calcChampagneSplit(input: {
  totalPrice: number,
  nominationCastNames: string[],
  castBackRateMap: Record<string, number>   // 0.0-1.0
}): {
  perCastRevenue: number,
  averageBackRate: number,
  perCastBackAmount: number,
  totalBackAmount: number,
}
```

適用対象: subcategory が `champagne / whisky / shochu / brandy / wine` の `GuestMenuItem` で、卓に `mainNominationCastNames.length >= 2` の場合。

**実装**: `billingRecords.create` 時に対象注文を抽出 → セッパン計算 → 各キャストの DailyWork に振り分ける。

### 4.3 利益計算 (FL指標)

```ts
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

**Rev.3.1 からの修正**: フロントの `staffFixedCost = 28800` のハードコードは **使わない**。実際の `AttendanceRecord` から人件費を算出する。

### 4.4 伝票番号アトミック採番

`POST /api/billing/records`:
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

  // dailyAggregates upsert
  // auditLogs append
})
```

**再発行**: 元レコードを変更せず、`reissueSuffix` を立てた新規 `BillingRecord` を作成（同じ receiptNumber、suffix=2 等）。印刷時に `000123-2` 形式で表示。

### 4.5 会計取消 (void) フロー

`POST /api/billing/records/:id/void`:
1. 対象 BillingRecord を取得
2. `closedAt` チェック: 紐付く DailyReport が締め済なら 422
3. tx 内で `voidedAt/voidedBy/voidReason` を設定
4. 連動して当該 cast の `DailyWork.sales` / `backTotal` を減算（**売上重畳 / バックを巻き戻す**）
5. `dailyAggregates` を再計算
6. `auditLogs` 記録

差し替え会計が必要なら、続いて `POST /api/billing/records` で新規発行 + 元レコードに `replacedBy` をセット。

### 4.6 締め後 reopen フロー

`POST /api/daily-reports/:businessDate/reopen` (owner のみ):
1. `DailyReport.closedAt` を null に
2. `reopenedAt/reopenedBy/reopenReason` を記録
3. `auditLogs` に必ず記録（理由: 監査対応）

reopen 後は通常通り void / 修正 → 再締め (`POST /api/daily-reports`)。

### 4.7 給与支払日算出

`utils/payroll-payment-date.ts` (フロント `paymentDate.ts` の移植):
- `period: 'first'` (1-15 日分) → 当月末日払い
- `period: 'second'` (16-月末分) → 翌月 15 日払い
- 土日祝は前倒し（直前の平日）
- 祝日テーブルは 2025-2030 を内蔵 (npm `japanese-holidays` 採用も検討)

**API**: `GET /api/payroll/payment-dates?period=first&year=2026&month=4`

### 4.8 中間チェック票自動印字判定

API は判定ロジックのみ提供:
- `GET /api/tables/:id/check-ticket-status` → `{ shouldPrint: true, reason: '50min_passed' }` 等
- 印字自体はフロント (端末) 側で実行（プリンタが各タブレットに紐付くため）
- 印字後に `PATCH /api/tables/:id { checkTicketPrintedAt: now() }` で記録（二重印字防止）

---

## 5. API エンドポイント一覧

### 5.0 共通

- ベース: `/api`
- 認証: JWT Bearer (`Authorization: Bearer <token>`)
- ページネーション: `?limit=50&cursor=<lastDocId>` カーソルベース
- レスポンス: `{ data: [...], nextCursor, hasMore }`
- エラー: `{ error: 'CODE', message: '...', details? }`

### 5.1 認証 `/api/auth`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| POST | `/api/auth/login` | `{username, pin}` → JWT 発行 | 全員 |
| POST | `/api/auth/logout` | セッション破棄 | 認証済 |
| GET | `/api/auth/me` | JWT 復元 | 認証済 |
| PATCH | `/api/auth/pin` | PIN 変更 (本人 currentPin 必須、owner は他人もリセット可) | 認証済 |
| POST | `/api/auth/heartbeat` | アイドル更新 (30 分無操作失効回避) | 認証済 |

### 5.2 ユーザー `/api/users`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/users` | 一覧 | owner |
| POST | `/api/users` | 作成 | owner |
| PATCH | `/api/users/:username` | 更新 | owner |
| DELETE | `/api/users/:username` | 削除 (実体は active=false) | owner |

### 5.3 卓 `/api/tables`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/tables` | 一覧 (`?updatedAfter=` で差分取得) | owner/staff |
| GET | `/api/tables/:id` | 詳細 | owner/staff |
| POST | `/api/tables` | 卓追加 | owner |
| PATCH | `/api/tables/:id` | 更新 (assignedCasts / mainNominationCastNames / setDiscountPerSet 等) | owner/staff |
| DELETE | `/api/tables/:id` | 削除 | owner |
| POST | `/api/tables/:id/orders` | 注文追加 | owner/staff |
| DELETE | `/api/tables/:id/orders/:orderKey` | 注文削除 | owner/staff |
| POST | `/api/tables/:id/orders/:orderKey/bonus` | ボーナス設定 (R18) | owner/staff |
| POST | `/api/tables/:id/extensions` | 延長追加 (`{minutes, nominatedCastName?}`) | owner/staff |
| DELETE | `/api/tables/:id/extensions/:extId` | 延長取消 (連動注文も削除) | owner/staff |
| POST | `/api/tables/:id/move-cast` | キャスト移動 (`{castName, fromTableId, toTableId}`) | owner/staff |
| POST | `/api/tables/:id/reset` | 卓リセット (会計確定後) | owner/staff |
| POST | `/api/tables/reorder` | 並び替え (`{ orders: [{id, position}] }`) | owner |
| GET | `/api/tables/:id/check-ticket-status` | 中間チェック票印字要否判定 | owner/staff |

### 5.4 キャスト `/api/casts`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/casts` | 一覧 | owner/staff (cast は不可) |
| POST | `/api/casts` | 作成 | owner |
| PATCH | `/api/casts/:id` | 更新 (休憩フラグ等含む) | owner |
| DELETE | `/api/casts/:id` | 削除 (active=false) | owner |
| POST | `/api/casts/replace-all` | 一括置換 (Seed 用) | owner |

### 5.5 メニュー `/api/menu`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/menu/categories` | カテゴリ一覧 | owner/staff |
| POST | `/api/menu/categories` | カテゴリ追加 | owner |
| PATCH | `/api/menu/categories/:id` | 更新 (label / order / hidden) | owner |
| DELETE | `/api/menu/categories/:id` | 削除 (custom=true のみ) | owner |
| GET | `/api/menu/guest` | ゲストメニュー | owner/staff |
| POST | `/api/menu/guest` | 追加 | owner |
| PATCH | `/api/menu/guest/:id` | 更新 | owner |
| DELETE | `/api/menu/guest/:id` | 削除 (archived=true) | owner |
| GET | `/api/menu/cast` | キャストメニュー | owner/staff |
| POST | `/api/menu/cast` | 追加 | owner |
| PATCH | `/api/menu/cast/:id` | 更新 | owner |
| DELETE | `/api/menu/cast/:id` | 削除 | owner |
| GET | `/api/menu/set-prices` | セット料金 | owner/staff |
| PATCH | `/api/menu/set-prices/:id` | 更新 | owner |
| GET | `/api/menu/charges` | チャージ項目 (シングル/同伴/本指名/場内/Help) | owner/staff |
| PATCH | `/api/menu/charges/:id` | 更新 | owner |

### 5.6 会計 `/api/billing`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/billing/records` | 一覧 (`?businessDate=` `?month=` `?limit=&cursor=`) | owner/staff |
| GET | `/api/billing/records/:id` | 詳細 (receiptSnapshot 含む) | owner/staff |
| POST | `/api/billing/records` | 会計確定 (tx で receiptNumber 採番 + dailyAggregates upsert) | owner/staff |
| POST | `/api/billing/records/:id/void` | 取消 (voidReason 必須) | owner |
| POST | `/api/billing/records/:id/reissue` | 再発行 (reissueSuffix を採番) | owner/staff |
| GET | `/api/billing/discounts` | 値引きログ一覧 | owner/staff |
| POST | `/api/billing/discounts` | 値引き記録 (append-only、reason 必須) | owner/staff |
| POST | `/api/billing/merge` | 合算会計 (`{tableNumbers[], paymentMethod, ...}`) | owner/staff |
| POST | `/api/billing/split-bill` | 割り勘伝票発行 (`{tableNumber, splitCount}`) | owner/staff |

### 5.7 ボトルキープ `/api/bottles`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/bottles` | 一覧 | owner/staff |
| POST | `/api/bottles` | 追加 | owner/staff |
| PATCH | `/api/bottles/:id` | 更新 (remaining 等) | owner/staff |
| DELETE | `/api/bottles/:id` | 削除 (soft) | owner |

### 5.8 給与 `/api/payroll`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/payroll/calculate` | 全員給与計算 (`?from=&to=&castId?=`) | owner |
| GET | `/api/payroll/payment-dates` | 支払日 (`?period=first|second&year=&month=`) | owner/staff |
| GET | `/api/payroll/daily-payments` | 日払い一覧 (`?businessDate=&staffType=&castId=`) | owner/staff |
| POST | `/api/payroll/daily-payments` | 日払い記録 (10% 控除自動算出) | owner/staff |
| DELETE | `/api/payroll/daily-payments/:id` | 取消 (soft) | owner |
| GET | `/api/payroll/deductions` | 天引き一覧 | owner/staff |
| POST | `/api/payroll/deductions` | 天引き追加 | owner/staff |
| DELETE | `/api/payroll/deductions/:id` | 取消 (soft) | owner |
| GET | `/api/payroll/daily-work/:castId` | 日次集計取得 (`?from=&to=`) | owner/staff |

### 5.9 自己給与 `/api/salary`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/salary/me` | JWT.sub から自己給与取得 (cast/boy 両対応) | 認証済 (自己制限) |

### 5.10 勤怠 `/api/attendance`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/attendance` | 一覧 (`?businessDate=&staffId=`) | owner/staff |
| POST | `/api/attendance` | 出勤記録 (`{staffId, clockIn?}`、サーバー時刻使用推奨) | owner/staff |
| PATCH | `/api/attendance/:id` | 退勤打刻 / 休憩追加 | owner/staff |
| GET | `/api/attendance/schedules` | 事前出勤予定一覧 | owner/staff |
| POST | `/api/attendance/schedules` | 予定追加 | owner/staff |
| DELETE | `/api/attendance/schedules/:id` | 予定削除 | owner/staff |

### 5.11 経費 `/api/expenses`

Rev.3.1 §6.2 と同じ。soft-delete + 監査ログ。

### 5.12 前借り `/api/advances`

Rev.3.1 §6.3 と同じ。

### 5.13 日報・レジ締め `/api/daily-reports`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/daily-reports` | 一覧 (`?businessDate=&month=`) | owner/staff |
| GET | `/api/daily-reports/:businessDate` | 詳細 | owner/staff |
| POST | `/api/daily-reports` | 締め実行 (tx で集計 + closedAt セット + dailyAggregates 焼き直し) | owner/staff |
| POST | `/api/daily-reports/:businessDate/reopen` | 再オープン (reopenReason 必須) | owner |

### 5.14 FL指標 `/api/metrics`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/metrics/fl` | 本日の FL指標 | owner |
| GET | `/api/metrics/fl/monthly` | 月次 FL指標 (`?month=YYYY-MM`) | owner |
| GET | `/api/metrics/sales/calendar` | 日別売上カレンダー (`?month=YYYY-MM`) | owner |
| GET | `/api/metrics/cast/:castId/monthly` | キャスト個別月次売上・給与推移 | owner |

### 5.15 設定 `/api/settings`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/settings` | 全設定取得 | owner/staff |
| PUT | `/api/settings` | 更新 (税務直結なので全フィールド監査ログ) | owner |

### 5.16 出力 `/api/export`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| GET | `/api/export/payroll-csv` | 税理士用 CSV (`?from=&to=`) | owner |
| GET | `/api/export/cast-ledger/:castId.pdf` | キャスト日経表 PDF (`?year=&month=`) | owner |
| GET | `/api/export/cast-ledger/:castId.csv` | キャスト日経表 CSV | owner |
| GET | `/api/export/billing-csv` | 会計 CSV (税務調査対応) | owner |

### 5.17 アーカイブ `/api/archive`

| メソッド | パス | 説明 | 権限 |
|---|---|---|---|
| POST | `/api/archive` | `{beforeDate}` で archivedAt フラグ付与 (物理削除なし) | owner |
| GET | `/api/archive` | アーカイブ済み参照一覧 | owner |
| GET | `/api/billing/records?includeArchived=true` | アーカイブ込み参照 | owner |

---

## 6. 認証・権限

### 6.1 PIN 認証

```ts
// POST /api/auth/login
async function login(username: string, pin: string) {
  const user = await db.collection(`stores/${storeId}/userAccounts`).doc(username).get()
  if (!user.exists) return throw_invalid_credentials()

  const data = user.data() as UserAccount
  if (data.lockedUntil && new Date(data.lockedUntil) > new Date()) {
    return throw_locked()
  }

  const ok = await bcrypt.compare(pin, data.pinHash)
  if (!ok) {
    const attempts = (data.loginAttempts ?? 0) + 1
    const update: Partial<UserAccount> = { loginAttempts: attempts }
    if (attempts >= 5) {
      update.lockedUntil = new Date(Date.now() + 5 * 60_000).toISOString()
      update.loginAttempts = 0
    }
    await user.ref.update(update)
    return throw_invalid_credentials()
  }

  // 成功 → JWT 発行 (12h、idle 30 分も別管理)
  await user.ref.update({ loginAttempts: 0, lockedUntil: null })
  return jwt.sign({ sub: username, role: data.role, castId: data.castId }, JWT_SECRET, { expiresIn: '12h' })
}
```

### 6.2 PIN 強度バリデーション
弱い PIN (`0000`, `1234`, `1111`, `9999`, `0987` 等の連番・反復) を `POST /api/auth/pin` で拒否。

### 6.3 共有端末の 30 分無操作失効
- JWT 自体は 12h 有効
- 別途 Redis or Firestore の `sessions/{jwtJti}` に `lastActivityAt` を保存
- `requireAuth` ミドルウェアで `now - lastActivityAt > sessionIdleMinutes` なら 401
- フロントは `POST /api/auth/heartbeat` を 5 分間隔で送る

### 6.4 ロール別権限表

Rev.3.1 §7 を踏襲。追加点:

| エンドポイント | owner | staff | cast |
|---|:-:|:-:|:-:|
| tables / orders / move-cast | ✅ | ✅ | ❌ |
| billing/records (作成) | ✅ | ✅ | ❌ |
| billing/records/void | ✅ | ❌ | ❌ |
| billing/records/reissue | ✅ | ✅ | ❌ |
| billing/merge / split-bill | ✅ | ✅ | ❌ |
| daily-reports (作成) | ✅ | ✅ | ❌ |
| daily-reports/reopen | ✅ | ❌ | ❌ |
| menu/categories | ✅ | ✅ (閲覧のみ) | ❌ |
| menu (CRUD) | ✅ | ❌ | ❌ |
| payroll/calculate | ✅ | ❌ | ❌ |
| metrics/fl | ✅ | ❌ | ❌ |
| settings (PUT) | ✅ | ❌ | ❌ |
| export | ✅ | ❌ | ❌ |
| archive | ✅ | ❌ | ❌ |
| salary/me | ✅* | ✅* | ✅* |
| attendance/schedules | ✅ | ✅ | ❌ |

\* 自分のデータのみ

---

## 7. 監査ログ実装方針

`backend/src/utils/audit.ts`:

```ts
export async function appendAuditLog(
  tx: FirebaseFirestore.Transaction,
  params: {
    collection: string
    documentId: string | number
    action: AuditLog['action']
    before: object | null
    after: object | null
    user: { username: string; role: string }
    reason?: string
  }
): Promise<void> {
  const ref = db.collection(`stores/${storeId}/auditLogs`).doc()
  tx.set(ref, {
    id: ref.id,
    ...params,
    userId: params.user.username,
    userRole: params.user.role,
    timestamp: new Date().toISOString(),
  })
}
```

**全 mutation で必ず同 tx 内で呼ぶ**。fire-and-forget は禁止。

監査対象アクション:
- `billingRecords` の create / void / reissue / soft-delete
- `discountLogs` の create
- `expenses` / `advances` / `dailyPayments` / `deductions` の create / soft-delete
- `dailyReports` の create / reopen
- `userAccounts` の create / update / pin 変更
- `storeSettings` の更新（税率・カット・控除率は全部）

---

## 8. Firestore セキュリティルール (`firestore.rules`)

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
- フロントの Firebase SDK 直接呼び出しは原則使わない（`onSnapshot` リアルタイム同期は Phase 2 で例外的に解禁検討）

Phase 2 で `onSnapshot` を解禁する場合は、読み取りだけ許可するルールを追加:
```
match /stores/{storeId}/tables/{tableId} {
  allow read: if request.auth != null;
  allow write: if false;
}
```

---

## 9. Firestore インデックス (`firestore.indexes.json`)

```json
{
  "indexes": [
    { "collectionGroup": "billingRecords", "fields": [
      { "fieldPath": "businessDate", "order": "ASCENDING" },
      { "fieldPath": "timestamp", "order": "DESCENDING" }
    ]},
    { "collectionGroup": "billingRecords", "fields": [
      { "fieldPath": "voidedAt", "order": "ASCENDING" },
      { "fieldPath": "businessDate", "order": "ASCENDING" }
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
    ]}
  ]
}
```

デプロイ時のインデックスビルドに数分〜数十分かかるので **本番直前に時間を確保**。

---

## 10. データアーカイブ方針

- **物理削除しない**。`archivedAt` フラグ付与のみ
- 通常一覧 API は `where archivedAt == null` でフィルタ
- `?includeArchived=true` でアーカイブ込み取得 (owner のみ)
- 税務上 **7 年（青色申告 10 年）保持義務**
- フロント `archiveOldData` の物理削除実装は **バグ**。BE 化と同時にフロントも `archivedAt` フラグ表示 UI に変更

---

## 11. マルチ店舗設計

```
firestore/stores/{storeId}/...
                  │
                  ├── default          → Heaven's Garden (現状)
                  ├── snack-deep       → 将来
                  └── club-galaxy      → 将来
```

- `storeId` は JWT に含めて配信 (`{ sub, role, storeId, castId }`)
- フロントは `storeId` を意識せず、JWT のものを使う
- 将来「店舗切替 UI」を入れる場合は、ユーザーが複数 storeId を持てるよう `userAccounts/{username}.allowedStoreIds: string[]` を追加（Phase 3）

---

## 12. CSV / Excel 出力

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

実装は `frontend/src/utils/castLedger.ts` の HTML テンプレを Puppeteer + Chromium で PDF 化。フロント側の「ブラウザ印刷ダイアログ → PDF 保存」モードはそのまま残し、BE 化したい人向けに API も提供。

### 12.3 会計 CSV (`/api/export/billing-csv`)

税務調査時の生データダンプ用。`?from=&to=&includeArchived=true&includeVoided=true` で全件取得可能。

---

## 13. リアルタイム同期 / フロント接続戦略

### 13.1 Phase 1 (MVP) — 差分ポーリング
- フロントは `GET /api/tables?updatedAfter=<lastUpdatedAt>` を 30 秒間隔
- 楽観的更新 + サーバーレスポンス上書き
- 対象: `tables` `billingRecords` `attendanceRecords`

### 13.2 Phase 2 — onSnapshot 解禁
- セキュリティルールを read-only で開放
- フロントの `useStore` を `onSnapshot` ベースに置換
- Service Worker でオフラインキャッシュ + オンライン復帰時同期

### 13.3 フロント `store.tsx` の段階移行
1. **Phase A**: `frontend/src/api/` を新設、各ミューテーション関数を fetch 化
2. **Phase B**: 初期化を mock → API 取得に切替
3. **Phase C**: `flMetrics` の `useMemo` 内ハードコード `staffFixedCost = 28800` を削除、`/api/metrics/fl` から取得
4. **Phase D**: `auth.tsx` を `dummyAccounts` 直接参照から `POST /api/auth/login` 経由に置換、JWT 保存

---

## 14. 実装優先順位 (Rev.4)

| 優先度 | 作業 | 由来 / 理由 |
|---|---|---|
| **P0** | 型定義刷新 (追補02/03 全反映) `types.ts` + 共通 AuditFields | 全後続作業の前提 |
| **P0** | 権限制御 (`requireRole`) + PIN bcrypt + JWT + idle 失効 | セキュリティ要件 |
| **P0** | businessDate 規約 (`business-date.ts`、cutoffHour=5) | 全コレクション基盤 |
| **P0** | 監査ログ基盤 (`audit.ts` + `auditLogs` コレクション) | 金銭操作追跡 |
| **P0.5** | 伝票番号アトミック採番 (`metadata/billing` + tx) | 税務上の欠番防止 |
| **P0.5** | 税理士確認: 給与計算式 = `(時給+バック)×0.9 - 日払 - 天引` で OK か | **本番デプロイ前ブロッカー** |
| **P1** | 卓・注文 CRUD (assignedCasts / mainNominationCastNames / extensionHistory / setDiscountPerSet 全対応) | 追補02 R1/R12-5 |
| **P1** | 会計 (BillingRecord + receiptSnapshot 詳細形 + void + reissue + 合算 + 割り勘) | 営業必須 |
| **P1** | 勤怠 (ISO 8601 + workMinutes + paidMinutes + AttendanceSchedule + サーバースケジューラ) | 追補02 R4 |
| **P1** | 経費 / 前借り (soft-delete + 監査) | フロント UI 既存 |
| **P1** | 日報・レジ締め (tx + dailyAggregates + reopen フロー) | 営業必須 |
| **P1** | メニュー (MenuCategory + GuestMenuItem + CastMenuItem + SetPrice + ChargeItem CRUD) | 追補02 R5 |
| **P1** | カーソルページネーション基盤 | Firestore 制限対策 |
| **P2** | 給与計算 API (`/api/payroll/calculate`、ルーズタイム + 15 分単位 + ボトルバック % + シャンパンセッパン + ボーナス) | サーバー化 |
| **P2** | FL指標 (`dailyAggregates` 集約 + 月次) | ProfitPage |
| **P2** | 自己給与 (`/api/salary/me`) | SalaryPage |
| **P2** | 給与支払日 API (`paymentDate.ts` 移植) | SalaryPage |
| **P2** | キャスト移動 + CastMoveLog | 追補02 R10 |
| **P2** | Firestore インデックスデプロイ | クエリ前提 |
| **P3** | CSV / Excel 出力 (税理士用 + キャスト日経表 PDF) | 月次運用 |
| **P3** | アーカイブ (archivedAt フラグ方式) + フロント側 UI 修正 | パフォーマンス |
| **P3** | リアルタイム同期 (`onSnapshot`) | MVP 後段階導入 |
| **P3** | Seed (フロント mock.ts と同等) | 開発・テスト環境 |
| **P3** | マルチ店舗対応 (storeId 複数許可) | 将来展開 |

**P0.5 の税理士確認は本番ブロッカー**。設計書の §4.1 を税理士に見せて、`grossPay × 0.10` の控除式を計上方法として認めるか、源泉徴収との関係を確認する。

---

## 15. ファイル構成 (`backend/src/`)

```
backend/src/
├── index.ts                          ← Express bootstrap + ルーター登録
├── types.ts                          ← Rev.4 型定義
├── seed.ts                           ← フロント mock.ts 互換の初期データ
├── middleware/
│   ├── auth.ts                       ← JWT検証 + requireRole + idle失効 + bcrypt
│   └── error.ts                      ← ErrorResponse 統一フォーマット
├── routes/
│   ├── auth.ts                       ← login / logout / me / pin / heartbeat
│   ├── users.ts                      ← UserAccount CRUD
│   ├── tables.ts                     ← Table CRUD + orders + extensions + move-cast
│   ├── casts.ts                      ← Cast CRUD
│   ├── menu.ts                       ← MenuCategory + Guest/Cast/Set/Charge
│   ├── billing.ts                    ← records + void + reissue + merge + split-bill + discounts
│   ├── bottles.ts                    ← BottleKeep CRUD
│   ├── payroll.ts                    ← calculate + payment-dates + daily-payments + deductions + daily-work
│   ├── salary.ts                     ← /me 自己給与
│   ├── attendance.ts                 ← records + schedules
│   ├── expenses.ts                   ← Expense CRUD
│   ├── advances.ts                   ← AdvancePayment CRUD
│   ├── daily-reports.ts              ← 締め tx + reopen
│   ├── metrics.ts                    ← FL + sales/calendar + cast/monthly
│   ├── settings.ts                   ← StoreSettings
│   ├── export.ts                     ← CSV + 日経表 PDF
│   └── archive.ts                    ← archivedAt フラグ操作
├── utils/
│   ├── business-date.ts              ← toBusinessDate (cutoffHour=5)
│   ├── audit.ts                      ← appendAuditLog
│   ├── pagination.ts                 ← cursor pagination
│   ├── payroll-calc.ts               ← 給与計算 + calcPaidMinutes (フロント payroll.ts 移植)
│   ├── champagne-split.ts            ← セッパン (フロント champagneSplit.ts 移植)
│   ├── nomination.ts                 ← getNominationLabel (フロント nomination.ts 移植)
│   ├── set-count-label.ts            ← getSetLabel (フロント setCountLabel.ts 移植)
│   ├── payment-date.ts               ← 支払日算出 + 祝日判定
│   ├── fl-calc.ts                    ← FL 指標計算
│   └── pin-validate.ts               ← 弱い PIN 拒否
├── jobs/
│   └── attendance-scheduler.ts       ← Cloud Functions or Cron で 1 分ごとに走らせ AttendanceSchedule を処理
└── config/
    └── firebase.ts                   ← Firebase Admin 初期化
```

---

## 16. サーバー化判断ポイント (フロント独自実装の扱い)

| フロント実装箇所 | サーバー化要否 | 理由 |
|---|---|---|
| `getNextReceiptNumber` (`store.tsx:153,365`) | **必須** | 複数端末同時稼働で衝突 |
| `archiveOldData` の物理削除 (`store.tsx:343-355`) | **必須 + 仕様修正** | 税務上違法。フラグ方式へ |
| `flMetrics.staffFixedCost = 28800` (`store.tsx:397`) | **必須** | ハードコードは即修正 |
| `auth.tsx` の `dummyAccounts` 直接参照 | **必須** | 認証は BE で |
| `getBusinessDay` (`utils/businessDay.ts`) cutoffHour=6 | **修正のみ** | BE と揃えて 5 に。フロントの判定は表示用にローカル維持可 |
| `calcChampagneSplit` (`utils/champagneSplit.ts`) | **両持ち** | 会計確定時は BE 計算が真。フロントはプレビュー用 |
| `getNominationLabel` / `getSetLabel` | **両持ち** | UI 表示に必要、サーバーは receiptSnapshot 焼き込み用 |
| `calcHourlyPay` / `calcPaidMinutes` (`utils/payroll.ts`) | **両持ち** | 給与計算は BE で確定。SalaryPage 確認用にフロントも保持 |
| `getPaymentDate` (`utils/paymentDate.ts`) | **API 化** | 祝日テーブルの保守を一元化 |
| `printCastLedger` (`utils/castLedger.ts`) | **両持ち** | 端末で印刷ダイアログ起動できるのが利点。BE PDF API は税理士提出用 |
| `displayOrderName` (`mock.ts:585-591`) | **両持ち** | UI/レシート両方で必要、副作用なし |
| `AttendanceSchedule` の自動打刻 (`store.tsx:319-329`) | **必須サーバー化** | タブ閉じると動かない |
| `nominatedCastIds` / `castSnapshot` の生成 | **BE 必須** | 会計時 tx 内で確定 |

---

## 17. 環境変数

```env
PORT=3001
NODE_ENV=production
JWT_SECRET=<本番用シークレット (256bit以上)>
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
DEFAULT_STORE_ID=default
SESSION_REDIS_URL=redis://...           # idle session 管理用 (任意、未設定時は Firestore で代替)
```

`FIREBASE_SERVICE_ACCOUNT` を `.env` に JSON 文字列で持つのは **禁止**。`GOOGLE_APPLICATION_CREDENTIALS` パス参照のみ。

---

## 18. 未確定・要確認事項

1. **税理士確認** (P0.5、本番デプロイブロッカー)
   - 給与控除 10% を「源泉徴収」として処理してよいか / 別控除扱いか
   - 法定源泉徴収（日給 5,000 円超 × 10.21%）を併用するか
   - SPEC_CONFLICTS で「指示書の `(時給+バック)×0.9` 採用」と決めたが、税法上の整理は別途必要
2. **AttendanceSchedule のサーバースケジューラ運用**
   - Firebase Cloud Functions の cron トリガー (1 分間隔) で十分か / Cloud Scheduler + Cloud Run か
   - フロント側にもバックアップとして 1 分タイマーを残すか（タブ開いてる時のみ補助）
3. **シャンパンセッパンの厳密ルール**
   - `mainNominationCastNames` が 3 名以上の時の端数（円未満）の扱い (現状: 各人切り捨て、店側に余り)
   - 同伴ボトルやヘルプ時の按分ルール
4. **合算会計の伝票出力**
   - 1 領収書に複数卓を併記するか、卓ごとに別領収書を発行するか (現状: 1 つに併記、`mergedTables` 配列で記録)
5. **再発行 (`reissueSuffix`) の運用ポリシー**
   - 何回まで再発行を許容するか / どのレコードを「最終版」と扱うか (現状: 直近の reissueSuffix が最大のものを最終とする想定)
6. **マルチ店舗の現実的タイムライン**
   - Heaven's Garden 単店舗で最低 N 月安定運用してから展開予定。本設計書ではコレクション分離方針のみ確定し、UI/権限細部は Phase 3 で再設計
7. **onSnapshot 解禁の判断基準**
   - MVP 安定運用 N 週間後 / 端末数 / 同時更新衝突発生頻度のいずれをトリガーにするか
8. **Cloud SQL / Postgres ETL**
   - Firestore で給与計算が遅くなる場合の逃げ道。発動条件 (1 計算 > 30 秒等) を Phase 3 で再評価
9. **領収書の印刷経路**
   - EPSON TM-m30III-H への直接送信プロトコル (Bluetooth ESC/POS or LAN)
   - 現状の `window.print()` 経由か / Node.js から escpos ライブラリで直送するか
10. **PIN リセットの本人確認**
    - owner が他人 PIN をリセットする時、現場でどう本人確認するか（運用ルールの問題、設計書範囲外）

---

## 19. 変更履歴

| 日付 | 版 | 内容 |
|---|---|---|
| 2026-04-22 | Rev.1 | 初版 (ホーク) |
| 2026-04-22 | Rev.2 | ハクレビュー反映 (致命5 / 重要5 / 改善7) |
| 2026-04-22 | Rev.3 | ハク最終レビュー反映 (採番・割増・税務・締め後・アーカイブ・監査ログ・PIN・onSnapshot 等) |
| 2026-04-22 | Rev.3.1 | 最終確定版。legalWithholding throw 化・voidedAt/deletedAt 使い分け明記・DailyReport reopen 追加 |
| 2026-04-29 | **Rev.4** | **追補02/03・SPEC_CONFLICTS・TRUST UI 改修まとめを反映。** Table 指名モデル刷新 / BackType 17 種拡張 / PERCENT_BACK_TYPES / シャンパンセッパン / OrderItem ボーナス / MenuCategory 追加 / AttendanceSchedule 追加 / 給与計算式 = 0.9 控除式に確定 / ルーズタイム+15分単位 / 深夜割増・独自控除フラグ廃止 / ReceiptSnapshot 詳細形 / DailyReport businessDate 主キー化 / etc. (ホーク) |
