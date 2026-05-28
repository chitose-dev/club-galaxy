# CLUB GALAXY バックエンド設計書（Rev.3.1 — 最終確定版）

> レビュー: 2026-04-22 ハク (Claude Opus 4.7)
> 改訂: 2026-04-22 ホーク (Claude Opus 4.6)
> 反映内容: クリティカル5件・重要5件・改善提案7件 + 日付/タイムゾーン設計

---

## 1. 現状分析

### 実装済み（スキャフォールドのみ、Firestoreとの接続コード有り）
| ルーター | エンドポイント | 状態 |
|----------|-------------|------|
| auth | login / users CRUD | Firestore接続済み・動作する |
| tables | CRUD / orders / reset / reorder | Firestore接続済み・動作する |
| casts | CRUD / 一括置換 | Firestore接続済み・動作する |
| menu | guest / cast / set-prices / charges | Firestore接続済み・動作する |
| billing | records / discounts | Firestore接続済み・動作する |
| bottles | CRUD | Firestore接続済み・動作する |
| payroll | daily-pay / deductions / daily-work | Firestore接続済み・動作する |
| settings | GET / PUT | Firestore接続済み・動作する |

### 未実装（フロントエンドには既にUI有り）
| 機能 | フロントエンド状態 | バックエンド状態 |
|------|-----------------|---------------|
| 勤怠管理 (AttendanceRecord) | store.tsx で管理、AdminPage に UI | エンドポイント・型なし |
| 経費管理 (Expense) | store.tsx で管理、AdminPage に UI | エンドポイント・型なし |
| 前借り管理 (AdvancePayment) | store.tsx で管理、AdminPage に UI | エンドポイント・型なし |
| 日報 (DailyReport) | store.tsx で管理 | エンドポイント・型なし |
| 給与計算ロジック | フロントで計算中 (castLedger.ts) | ロジックなし |
| FL指標計算 | フロントで計算中 (store.tsx) | ロジックなし |
| データアーカイブ | store.tsx archiveOldData() | エンドポイントなし |
| 伝票番号採番 | store.tsx getNextReceiptNumber() | ロジックなし |
| CSV/Excel出力 | なし | なし |
| 権限制御 | auth.tsx でロール判定 | requireAuth のみ（ロール不問） |

### バックエンド型定義の不足
`backend/src/types.ts` がフロントエンドの `mock.ts` と比べて以下が欠落:
- `Table`: `checkTicketPrintedAt`, `setDiscountPerSet`, `timeAdjustmentMinutes`, `extensionHistory`
- `Cast`: `realName`, `address`, `onBreak`, `lastAssignedAt`
- `BillingRecord`: `nominatedCastId`, `subtotalBeforeTax`, `castNamesSnapshot`, `receiptSnapshot`
- `DailyPayment`: `staffType`（必須）
- `Deduction`: `source`, `staffType`（必須）
- `StoreSettings`: `cardProcessingFeeRate`, `storeName`, `storeAddress`, `storePhone`, `invoiceNumber`
- `UserAccount`: `hourlyRate`
- 型自体が存在しない: `AttendanceRecord`, `Expense`, `AdvancePayment`, `DailyReport`, `ExtensionEntry`, `ReceiptSnapshot`

---

## 2. 設計方針

### 原則
1. **フロントエンドの既存インターフェースに合わせる** — フロントの型・データ構造を正とし、バックエンドをそれに合わせる
2. **ビジネスロジックはバックエンドに移行** — 給与計算・FL指標・伝票番号はサーバーサイドで実行
3. **フロントエンドの改修は最小限** — `useStore` の各メソッド内部で API コールに差し替える形で移行
4. **監査ログは改ざん不可** — DiscountLog は append-only、DELETE 不可
5. **全 mutation に監査フィールドを付与** — `createdBy`, `updatedBy`, `updatedAt` 必須。金銭関連は soft-delete（`deletedAt`, `deletedBy`, `deleteReason`）
6. **日付またぎは `businessDate` で管理** — 全レコードに営業日（JST）を明示保存、カットオフ時刻で判定

### 技術スタック（変更なし）
- Express 5 + TypeScript
- Firebase Admin SDK (Firestore)
- JWT認証（12時間有効）
- PIN は **bcrypt ハッシュ** で保存、ログイン試行は **5回/分でレート制限**

### エラーレスポンス統一フォーマット
```typescript
interface ErrorResponse {
  error: string        // 機械可読コード（例: "FORBIDDEN", "NOT_FOUND", "VALIDATION_ERROR"）
  message: string      // 人間可読メッセージ
  details?: unknown    // バリデーションエラー時のフィールド詳細
}
```
全エンドポイントでこのフォーマットを使用。

---

## 3. 日付・タイムゾーン規約

キャバクラの営業時間（20:00〜LAST 2-4時）は日付またぎが常態。以下の規約を全コレクション・全エンドポイントに適用する。

### 3.1 タイムゾーンは JST 固定
- 全ての timestamp は **ISO 8601 + オフセット付き** で保存（例: `"2026-04-22T02:30:00+09:00"`）
- Firestore の `Timestamp` 型は UTC 保存になるが、**アプリ層では必ず JST で解釈**
- `YYYY-MM-DD` 形式は **「JSTの日付」と定義**

### 3.2 `businessDate` を明示フィールドとして保存
- 導出ではなく**保存時にサーバー側で確定**させる（クライアントから送らせない＝改ざん防止）
- Firestore はクエリ式に計算を書けない（`where businessDate == '2026-04-22'` の形でしか引けない）
- 将来カットオフ時刻を変えても過去データが遡及変更されない

### 3.3 カットオフ時刻を `StoreSettings` に持つ
```ts
businessDayCutoffHour: number  // default 5（朝5時まで前営業日扱い）
```
`00:00〜05:00` のタイムスタンプは **前日の businessDate** に属する。

### 3.4 導出関数をユーティリティ化
```ts
// backend/src/utils/business-date.ts
export function toBusinessDate(
  timestamp: string,          // ISO 8601
  cutoffHour: number          // from StoreSettings
): string {                    // "YYYY-MM-DD"
  const d = new Date(timestamp)
  const jst = new Date(d.getTime() + 9 * 60 * 60 * 1000)  // UTC→JST
  if (jst.getUTCHours() < cutoffHour) {
    jst.setUTCDate(jst.getUTCDate() - 1)
  }
  return jst.toISOString().slice(0, 10)
}
```
全ての作成 API（attendance / billing / expenses / advances / daily-report）でサーバー側がこの関数で `businessDate` を焼く。

---

## 4. Firestore コレクション設計

```
firestore
└── stores
    └── "default"
        ├── tables/{id}                  ← 既存（型拡張）
        ├── casts/{id}                   ← 既存（型拡張）
        ├── guestMenu/{id}               ← 既存
        ├── castMenu/{id}                ← 既存
        ├── setPrices/{id}               ← 既存
        ├── chargeItems/{id}             ← 既存
        ├── billingRecords/{id}          ← 既存（型拡張 + void対応）
        ├── discountLogs/{id}            ← 既存（append-only）
        ├── dailyPayments/{id}           ← 既存（旧 dailyPayRequests、リネーム）
        ├── deductions/{id}              ← 既存（型拡張）
        ├── bottleKeeps/{id}             ← 既存
        ├── dailyWork/{castId_date}      ← 既存
        ├── userAccounts/{username}      ← 既存（型拡張 + PINハッシュ化）
        ├── auditLogs/{id}               ★ 新規（全 mutation の監査ログ）
        ├── attendanceRecords/{id}       ★ 新規
        ├── expenses/{id}                ★ 新規
        ├── advancePayments/{id}         ★ 新規
        ├── dailyReports/{businessDate}  ★ 新規
        ├── dailyAggregates/{businessDate} ★ 新規（日次集計キャッシュ）
        ├── metadata/billing             ★ 新規（nextReceiptNumber カウンタ）
        └── archivedData/{id}            ★ 新規
```

**注意**: `receiptCounter` は独立コレクションとしては廃止。伝票番号カウンタは `stores/default/metadata/billing` メタドキュメント内の `nextReceiptNumber` フィールドで管理し、`POST /billing/records` の Firestore transaction 内でアトミックに get → increment → set する（§8.2 参照）。

### Firestore 複合インデックス (`firestore.indexes.json`)

```json
{
  "indexes": [
    {
      "collectionGroup": "attendanceRecords",
      "fields": [
        { "fieldPath": "businessDate", "order": "ASCENDING" },
        { "fieldPath": "staffId", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "billingRecords",
      "fields": [
        { "fieldPath": "businessDate", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "expenses",
      "fields": [
        { "fieldPath": "businessDate", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    },
    {
      "collectionGroup": "advancePayments",
      "fields": [
        { "fieldPath": "castId", "order": "ASCENDING" },
        { "fieldPath": "businessDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "dailyPayments",
      "fields": [
        { "fieldPath": "staffType", "order": "ASCENDING" },
        { "fieldPath": "businessDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "deductions",
      "fields": [
        { "fieldPath": "castId", "order": "ASCENDING" },
        { "fieldPath": "businessDate", "order": "ASCENDING" }
      ]
    },
    {
      "collectionGroup": "auditLogs",
      "fields": [
        { "fieldPath": "collection", "order": "ASCENDING" },
        { "fieldPath": "timestamp", "order": "DESCENDING" }
      ]
    }
  ]
}
```

デプロイ時にインデックスビルドで数分〜時間かかるので本番前に確認必須。

---

## 5. 型定義の修正 (`types.ts`)

### 5.0 共通監査フィールド

```typescript
// 全 mutation 対象の型に付与
interface AuditFields {
  createdBy: string       // username
  createdAt: string       // ISO 8601
  updatedBy?: string
  updatedAt?: string
}

// 金銭関連の soft-delete 用
interface SoftDeletable {
  deletedAt?: string      // ISO 8601（null = 有効）
  deletedBy?: string
  deleteReason?: string
}

// バック種別
type BackType = 'drink' | 'bottle' | 'food' | 'nomination' | 'douhan' | 'shimei' | 'banai' | 'other'
```

### 5.1 既存型の拡張

```typescript
// --- Table ---
export interface ExtensionEntry {
  id: number
  minutes: 30 | 60
  timestamp: string       // ISO 8601
  nominatedCastName?: string
  orderMenuItemId?: number
}

export interface Table {
  id: number
  number: string
  status: TableStatus
  guestCount: number
  startTime: string | null    // ISO 8601
  castNames: string[]
  nomination: 'shimei' | 'banai' | 'free' | 'douhan' | null
  setCount: number
  orders: OrderItem[]
  businessDate: string         // YYYY-MM-DD（営業日）
  checkTicketPrintedAt?: string | null
  setDiscountPerSet?: number
  timeAdjustmentMinutes?: number
  extensionHistory?: ExtensionEntry[]
}

// --- Cast ---
export interface Cast {
  id: number
  name: string        // 源氏名
  realName?: string   // 本名（給与明細・税理士出力用）
  address?: string    // 住所（給与明細用）
  hourlyRate: number
  backRates: Partial<Record<BackType, number>>
  guaranteeRate: number
  active: boolean
  onBreak?: boolean
  lastAssignedAt?: string | null
}

// --- BillingRecord ---
export interface ReceiptSnapshot {
  subtotal: number
  tax: number
  total: number
  paymentMethod: string
  items: { name: string; qty: number; price: number }[]
}

export interface BillingRecord extends AuditFields, SoftDeletable {
  id: number
  tableNumber: string
  total: number
  paymentMethod: 'cash' | 'card' | 'mixed'
  cashAmount?: number
  cardAmount?: number
  cardFee?: number
  timestamp: string          // ISO 8601
  businessDate: string       // YYYY-MM-DD（営業日、サーバー算出）
  receiptNumber: number      // 伝票番号（billing POST 内でアトミック採番）
  nominatedCastId?: number
  subtotalBeforeTax?: number
  castSnapshot?: { id: number; name: string; realName?: string }[]
  receiptSnapshot?: ReceiptSnapshot
  // void/refund 対応（voidedAt と deletedAt の使い分け）
  // - voidedAt: 取引として発生した後に「取り消された」。会計・税務上は「取消取引」として記録に残る（原則こちらを使用）
  // - deletedAt (SoftDeletable): 入力ミス等で取引自体が無かったことにする。owner の承認フローで限定使用
  voidedAt?: string          // ISO 8601（null = 有効）
  voidedBy?: string
  voidReason?: string
  replacedBy?: number        // 差し替え先の BillingRecord ID
}

// --- DailyPayment（旧 DailyPayRequest → リネーム） ---
export interface DailyPayment extends AuditFields {
  id: number
  castId: number
  castName: string
  amount: number
  businessDate: string       // YYYY-MM-DD
  staffType: 'cast' | 'boy'  // 必須（optional から昇格）
}

// --- Deduction ---
export interface Deduction extends AuditFields, SoftDeletable {
  id: number
  castId: number
  amount: number
  reason: string
  source: 'register' | 'transfer'
  staffType: 'cast' | 'boy'  // 必須（optional から昇格）
  businessDate: string
}

// --- StoreSettings ---
export interface StoreSettings extends AuditFields {
  taxRate: number                    // TAX(サービス料) default 0.2
  cardFeeRate: number                // 客向けカード手数料 default 0.1
  cardProcessingFeeRate: number      // 店舗経費 default 0.035
  initialCash: number                // レジ金初期値 default 100000
  closingDay: number                 // 締め日 default 15
  storeName: string
  storeAddress: string
  storePhone: string
  invoiceNumber: string              // T5390001005970
  businessDayCutoffHour: number      // default 5（朝5時まで前営業日扱い）
  enableOvertimePremium: boolean     // 深夜割増(22:00-5:00 25%増)適用フラグ default false
  enableCustomDeduction: boolean     // 独自10%控除の有効/無効 default true
  customDeductionRate: number        // 控除率 default 0.10
}

// --- UserAccount ---
export interface UserAccount {
  username: string
  pinHash: string            // bcrypt ハッシュ（生PINは保存しない）
  role: 'owner' | 'staff' | 'cast'
  castId?: number
  displayName: string
  hourlyRate?: number        // ボーイ用
  loginAttempts?: number     // レート制限用
  lockedUntil?: string       // ISO 8601
}
```

### 5.2 新規型

```typescript
// --- 勤怠管理 ---
export interface AttendanceRecord extends AuditFields {
  id: number
  staffId: number
  staffName: string
  staffType: 'cast' | 'boy'     // 必須
  businessDate: string            // YYYY-MM-DD（営業日、サーバー算出）
  clockIn: string                 // ISO 8601 full timestamp
  clockOut: string | null         // ISO 8601（翌日2:30等もOK）
  breakMinutes: number
  workMinutes: number             // サーバー算出: (clockOut - clockIn - break) 分単位
}

// --- 経費管理 ---
export interface Expense extends AuditFields, SoftDeletable {
  id: number
  amount: number
  category: '仕入れ（酒等）' | '税金' | '雑費'
  note: string
  source: 'register' | 'transfer'
  businessDate: string            // YYYY-MM-DD
  timestamp: string               // ISO 8601
}

// --- 前借り管理 ---
export interface AdvancePayment extends AuditFields, SoftDeletable {
  id: number
  castId: number
  castName: string
  amount: number
  source: 'register' | 'transfer'
  reason: string
  businessDate: string
  timestamp: string               // ISO 8601
}

// --- 日報（レジ締め） ---
export interface DailyReport extends AuditFields {
  id: number
  businessDate: string            // YYYY-MM-DD（主キー的に使用）
  initialCash: number
  cashSales: number
  cardSales: number
  totalSales: number
  dailyPayTotal: number
  cashExpenseTotal: number
  cashAdvanceTotal: number
  theoreticalCash: number
  actualCash: number
  difference: number
  note: string
  operator: string
  closedAt: string                // レジ締め確定日時
  reopenedAt?: string             // reopen 日時（reopen 履歴用）
  reopenedBy?: string             // reopen 操作者
  reopenReason?: string           // reopen 理由
}

// --- 日次集計キャッシュ ---
export interface DailyAggregate {
  businessDate: string
  totalSales: number
  cashSales: number
  cardSales: number
  foodCost: number                // 原価合計
  laborCost: number               // 人件費（日次は時給分のみの推定値: workMinutes × hourlyRate。バック分を含む確定値は月次集計時に再計算される）
  expenseTotal: number
  guestCount: number
  tableCount: number
  billingCount: number
  flRate: number
  profit: number
  updatedAt: string
}

// --- 監査ログ ---
export interface AuditLog {
  id: string
  collection: string              // 対象コレクション名
  documentId: string | number     // 対象ドキュメントID
  action: 'create' | 'update' | 'delete' | 'void'
  before: Record<string, unknown> | null  // 変更前の全量スナップショット（create 時は null）
  after: Record<string, unknown> | null   // 変更後の全量スナップショット（delete 時は null）
  userId: string                  // 操作者
  timestamp: string               // ISO 8601
}

// --- FL指標（API レスポンス用、保存しない） ---
export interface FLMetrics {
  todaySales: number
  foodCost: number
  laborCost: number
  cardProcessingCost: number
  flRate: number
  todayProfit: number
  monthlyProfit: number
  monthlyFlRate: number
}

// --- 給与計算結果（API レスポンス用） ---
export interface SalaryCalculation {
  castId: number
  castName: string
  staffType: 'cast' | 'boy'
  period: { from: string; to: string }
  workDays: number
  totalMinutes: number             // 分単位（workHours → workMinutes に変更）
  hourlyPay: number
  backTotal: number
  salesTotal: number
  guaranteeAmount: number
  grossPay: number
  overtimePremium: number          // 深夜割増額（enableOvertimePremium=true時のみ）
  dailyPayTotal: number
  deductionTotal: number
  advanceTotal: number
  netPay: number
  storeTaxDeduction: number        // 独自控除額（enableCustomDeduction=true時のみ）
  legalWithholding: number
  miscIncome: number
}
```

---

## 6. 新規 API エンドポイント

### 6.0 共通: ページネーション

一覧系 API は全て**カーソルベースページネーション**を採用。Firestore の 1MB 制限対策＋課金最適化。

```
?limit=50&cursor=<lastDocId>
```

レスポンス:
```json
{
  "data": [...],
  "nextCursor": "<lastDocId>" | null,
  "hasMore": true | false
}
```

集計系（合計額など）は別エンドポイント or `dailyAggregates` から取得。

### 6.1 勤怠 (`/api/attendance`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/attendance` | 一覧取得。`?businessDate=YYYY-MM-DD` `?staffId=N` `?limit=&cursor=` |
| POST | `/api/attendance` | 出勤記録を作成。サーバーが `businessDate` と `workMinutes` を算出 |
| PATCH | `/api/attendance/:id` | 退勤時刻・休憩時間を更新。`workMinutes` を再算出 |

バリデーション:
- `clockOut < clockIn` は弾く（日付またぎの場合 clockOut は翌日の timestamp になるので正常）
- `clockOut - clockIn > 24h` は弾く

**ファイル**: `backend/src/routes/attendance.ts`

### 6.2 経費 (`/api/expenses`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/expenses` | 一覧取得。`?businessDate=YYYY-MM-DD` `?month=YYYY-MM` `?limit=&cursor=` |
| POST | `/api/expenses` | 経費を記録 |
| DELETE | `/api/expenses/:id` | **soft-delete**（`deletedAt/deletedBy/deleteReason` を設定）。監査ログ記録 |

**ファイル**: `backend/src/routes/expenses.ts`

### 6.3 前借り (`/api/advances`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/advances` | 一覧取得。`?castId=N` `?month=YYYY-MM` `?limit=&cursor=` |
| POST | `/api/advances` | 前借りを記録。監査ログ記録 |
| DELETE | `/api/advances/:id` | **soft-delete**。監査ログ記録 |

**ファイル**: `backend/src/routes/advances.ts`

### 6.4 日報・レジ締め (`/api/daily-reports`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/daily-reports` | 一覧取得。`?businessDate=YYYY-MM-DD` |
| POST | `/api/daily-reports` | レジ締め実行（トランザクション） |

**レジ締めトランザクション**:
`POST /api/daily-reports` は `{ businessDate: "2026-04-22", actualCash: 250000 }` を受けて:
1. Firestore transaction で `billingRecords`, `expenses`, `advances`, `attendanceRecords` を `businessDate == ?` で集計
2. `dailyReports/{businessDate}` に書き込み
3. 同時に `dailyAggregates/{businessDate}` を焼く（日次集計キャッシュ）
4. 対象データに `closedAt` を立てる（以後 owner 以外編集不可）

**ファイル**: `backend/src/routes/daily-reports.ts`

### 6.5 給与計算 (`/api/payroll` に追加)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/payroll/calculate` | 給与計算を実行。`?from=YYYY-MM-DD&to=YYYY-MM-DD` 必須。`?castId=N` で個別 |

**レスポンス**: `SalaryCalculation[]`

**計算ロジック**:
```
キャスト:
  勤務分合計 = Σ workMinutes
  深夜勤務分 = Σ（22:00〜翌5:00 にかかる workMinutes）
  overtimePremium = 時給 × (深夜勤務分 / 60) × 0.25  ※enableOvertimePremium=true の場合のみ

  A = 時給 × (勤務分合計 / 60) + overtimePremium + バック合計
  B = 個人小計売上（!voided のみ） × 保証率 + overtimePremium
    ※深夜割増は労基法上「時給に対する割増」であり、売上保証が選ばれた場合も別途加算
  grossPay = MAX(A, B)  ※保証率0%の場合は自動的にA

  独自控除（enableCustomDeduction=true の場合）:
    storeTaxDeduction = grossPay × customDeductionRate
  
  legalWithholding = <TBD: 税理士確認後に確定>
    ※ 実装前に税理士確認フェーズを必ず入れること
    ※ calcLegalWithholding() を utils/payroll-calc.ts に切り出し、式が確定するまで本番デプロイ禁止
    ※ 実装時は calcLegalWithholding() を throw new Error('LEGAL_WITHHOLDING_NOT_CONFIGURED: 税理士確認後に式を実装すること') として配置
  miscIncome = storeTaxDeduction - legalWithholding

  netPay = grossPay - storeTaxDeduction - 日払合計 - 天引合計 - 前借合計
  
  ※ overtimePremium フィールドは SalaryCalculation に内訳表示用として別持ち

ボーイ:
  grossPay = 時給 × (勤務分合計 / 60)
  netPay = grossPay - 日払合計 - 天引合計
```

**⚠️ 税務上の注意**: 「独自10%控除」と法定源泉税の差額を店舗雑収入にする処理は税務上グレーな面がある。本番稼働前に顧問税理士への確認が必須。`enableCustomDeduction` で on/off 可能にし、運用判断を先方に委ねる設計とする。

### 6.6 FL指標 (`/api/metrics`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/metrics/fl` | 本日のFL指標を返す |
| GET | `/api/metrics/fl/monthly` | 今月のFL指標。`?month=YYYY-MM` で指定 |

月次指標は `dailyAggregates` を集約して返す（billingRecords 全件 scan を回避）。

**ファイル**: `backend/src/routes/metrics.ts`

### 6.7 自己給与閲覧 (`/api/salary`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/salary/me` | JWTの sub で自分の給与情報のみ返す。cast・staff（ボーイ）両対応 |

`requireRole('cast')` ではなく `requireAuth` のみ適用し、JWT の `sub` で自己制限する。owner も自分のを見られる。

**ファイル**: `backend/src/routes/salary.ts`

### 6.8 PIN 管理 (`/api/auth/pin`)

| メソッド | パス | 説明 |
|---------|------|------|
| PATCH | `/api/auth/pin` | PIN 変更。本人 or owner のみ。`{ username, currentPin?, newPin }` |

- 本人変更時: `currentPin` 必須（セッションハイジャック対策）
- owner が他人のPINをリセットする場合: `currentPin` 不要
- バリデーション: 弱い PIN（`0000`, `1234`, `1111` 等の禁止リスト）を拒否

### 6.9 データアーカイブ (`/api/archive`)

| メソッド | パス | 説明 |
|---------|------|------|
| POST | `/api/archive` | `{ beforeDate: "YYYY-MM-DD" }` で指定日以前のデータに `archivedAt` フラグを付与 |
| GET | `/api/archive` | アーカイブされたデータの一覧（税務調査時の読み取り経路） |

**アーカイブ方針**:
- 元コレクションから**削除しない**。`archivedAt` フラグで区別し、通常の一覧 API では `!archivedAt` で絞る
- 税務上、帳簿類は **7年（青色申告なら10年）保持義務**。物理削除は禁止
- 税理士出力エンドポイント（`/api/export`）は `?includeArchived=true` でアーカイブ済みデータも返せるようにする
- 通常クエリは `where archivedAt == null` を含める。Firestore が複合インデックスを要求するエラーが出た時点で `firestore.indexes.json` に追加

### 6.10 データ出力 (`/api/export`)

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/api/export/payroll-csv` | 税理士用CSV。`?from=&to=` 必須 |
| GET | `/api/export/cast-ledger/:castId` | キャスト日経表PDF/CSV。`?month=YYYY-MM` |

**ファイル**: `backend/src/routes/export.ts`

---

## 7. 権限制御（ロールベースアクセス）

### ミドルウェア

```typescript
// backend/src/middleware/auth.ts

// PIN 認証: bcrypt ハッシュ比較
// レート制限: 同一ユーザー5回失敗 → 5分ロック（loginAttempts, lockedUntil で管理）
// PIN 変更: PATCH /api/auth/pin（本人 or owner のみ）

export function requireRole(...roles: Array<'owner' | 'staff' | 'cast'>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = (req as any).user
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'この操作を行う権限がありません'
      })
    }
    next()
  }
}
```

### 適用ルール

| エンドポイント | owner | staff (黒服) | cast |
|-------------|-------|------------|------|
| tables (CRUD/orders) | ✅ | ✅ | ❌ |
| casts (CRUD) | ✅ | ✅(閲覧のみ) | ❌ |
| menu (CRUD) | ✅ | ✅(閲覧のみ) | ❌ |
| billing (records/discounts) | ✅ | ✅ | ❌ |
| billing (void) | ✅ | ❌ | ❌ |
| bottles | ✅ | ✅ | ❌ |
| payroll (daily-pay/deductions) | ✅ | ✅ | ❌ |
| payroll/calculate | ✅ | ❌ | ❌ |
| attendance | ✅ | ✅ | ❌ |
| expenses | ✅ | ✅ | ❌ |
| advances | ✅ | ✅ | ❌ |
| daily-reports | ✅ | ✅ | ❌ |
| metrics/fl | ✅ | ❌ | ❌ |
| settings | ✅ | ❌ | ❌ |
| export | ✅ | ❌ | ❌ |
| archive | ✅ | ❌ | ❌ |
| **salary/me (自分の給与)** | ✅* | ✅* | ✅* |
| auth/pin (PIN変更) | ✅(全員) | ✅(自分) | ✅(自分) |

> \* salary/me は **自分のデータのみ**。JWT の `sub` で自己制限、他人の給与は閲覧不可。

> **拡張ポイント**: 現時点では3ロールで十分だが、マルチ店舗展開時に `permissions[]` 配列方式への拡張を検討。店長クラスの黒服に metrics 閲覧権限を付与するケースなど。

---

## 8. 既存ルーターの修正箇所

### 8.1 `routes/tables.ts`
- `Table` 型を拡張フィールド対応に更新
- `POST /:id/reset` のリセットに `extensionHistory: []`, `checkTicketPrintedAt: null` 等を追加
- `POST /:id/orders` の order 集約ロジックを `castName` 考慮に修正

### 8.2 `routes/billing.ts`
- **伝票番号のアトミック採番**: `POST /records` の Firestore transaction 内で `metadata/billing.nextReceiptNumber` を get → increment → set し、同一 transaction で `billingRecords` を保存。Firestore transaction はリトライされるため、get した値を使って set する形で冪等性を担保。クライアント側の失敗で番号がスキップされない
- `businessDate` をサーバー側で `toBusinessDate()` を使って算出・保存
- `castNamesSnapshot` → `castSnapshot` に変更（`{ id, name, realName }[]`）
- **void エンドポイント追加**: `POST /records/:id/void` — `voidedAt/voidedBy/voidReason` を設定。DELETE は使わない
- **締め後 void は禁止**: `closedAt` が立ったレコードの void は 422 エラー。どうしても必要な場合は「レジ締めを reopen → void → 再締め」のフロー（`POST /api/daily-reports/:businessDate/reopen`、owner 限定）。reopen 時は `closedAt` を null に戻すだけでなく、`reopenedAt`/`reopenedBy`/`reopenReason` を DailyReport に記録し、監査ログにも記録する
- `POST /discounts` は **append-only**（DELETE エンドポイントを追加しない）
- 全 mutation で `auditLogs` に記録

### 8.3 `routes/settings.ts`
- `DEFAULT_SETTINGS` に以下を追加:
  - `cardProcessingFeeRate`, `storeName`, `storeAddress`, `storePhone`, `invoiceNumber`
  - `businessDayCutoffHour` (default: 5)
  - `enableOvertimePremium` (default: false)
  - `enableCustomDeduction` (default: true)
  - `customDeductionRate` (default: 0.10)
- 変更時に `auditLogs` に記録（税務直結のため）

### 8.4 `routes/payroll.ts`
- `DailyPayRequest` → `DailyPayment` にリネーム
- `staffType` を必須化
- `businessDate` をサーバー側で算出
- `GET /daily-pay` に `?businessDate=` `?staffType=` フィルタ追加
- `POST /daily-pay` に日払い10%控除の自動計算ロジック追加

### 8.5 `routes/auth.ts`
- PIN を **bcrypt** でハッシュ化して保存
- ログイン時に `loginAttempts` をカウント、5回失敗で5分ロック
- `PATCH /api/auth/pin` — PIN 変更 API 追加

### 8.6 `index.ts`
- 新規ルーターの登録 + ロールベースミドルウェアの適用

```typescript
import { requireRole } from './middleware/auth'
import { attendanceRouter } from './routes/attendance'
import { expensesRouter } from './routes/expenses'
import { advancesRouter } from './routes/advances'
import { dailyReportsRouter } from './routes/daily-reports'
import { metricsRouter } from './routes/metrics'
import { exportRouter } from './routes/export'
import { archiveRouter } from './routes/archive'
import { salaryRouter } from './routes/salary'

// 既存（権限適用）
app.use('/api/tables',    requireAuth, requireRole('owner','staff'), tablesRouter)
app.use('/api/casts',     requireAuth, castsRouter)  // 内部でロール分岐
app.use('/api/menu',      requireAuth, menuRouter)    // 内部でロール分岐
app.use('/api/billing',   requireAuth, requireRole('owner','staff'), billingRouter)
app.use('/api/bottles',   requireAuth, requireRole('owner','staff'), bottlesRouter)
app.use('/api/payroll',   requireAuth, requireRole('owner','staff'), payrollRouter)
app.use('/api/settings',  requireAuth, requireRole('owner'), settingsRouter)

// 新規
app.use('/api/attendance',     requireAuth, requireRole('owner','staff'), attendanceRouter)
app.use('/api/expenses',       requireAuth, requireRole('owner','staff'), expensesRouter)
app.use('/api/advances',       requireAuth, requireRole('owner','staff'), advancesRouter)
app.use('/api/daily-reports',  requireAuth, requireRole('owner','staff'), dailyReportsRouter)
app.use('/api/metrics',        requireAuth, requireRole('owner'), metricsRouter)
app.use('/api/export',         requireAuth, requireRole('owner'), exportRouter)
app.use('/api/archive',        requireAuth, requireRole('owner'), archiveRouter)
app.use('/api/salary',         requireAuth, salaryRouter)  // JWT sub で自己制限
```

---

## 9. リアルタイム同期（方針）

テーブル操作・会計は複数の黒服が同時に触る前提。

### Phase 1（MVP）
- フロントは API ポーリング（30秒間隔）で**差分取得**（`?updatedAfter=<ISO 8601>`）
- 各端末は最後に取得した `updatedAt` をローカル保存し、次回リクエストに使用
- 楽観的更新 + サーバーレスポンスで上書き
- 対象コレクション: `tables`（最頻）、`billingRecords`（会計中のみ）

### Phase 2（本番安定後）
- **Firestore onSnapshot** リアルタイムリスナーを `tables` と `billingRecords` に導入
- PWA オフライン対応: Service Worker でキャッシュ、オンライン復帰時にサーバーと同期

---

## 10. フロントエンド接続戦略

### Phase 1: API クライアント層の追加
`frontend/src/api/` ディレクトリを新規作成。

```
frontend/src/api/
├── client.ts          ← fetch ラッパー（JWT自動付与、エラーハンドリング統一）
├── tables.ts
├── casts.ts
├── menu.ts
├── billing.ts
├── bottles.ts
├── payroll.ts
├── attendance.ts
├── expenses.ts
├── advances.ts
├── daily-reports.ts
├── metrics.ts
├── settings.ts
└── export.ts
```

### Phase 2: store.tsx の段階的移行
`useStore` の各ミューテーション関数内で API コールに差し替え。

### Phase 3: 初期データロードの移行
`store.tsx` の初期化で mock データではなく API から取得。

---

## 11. 初期データ投入 (Seed)

`backend/src/seed.ts` — フロントエンドの `mock.ts` と同等の初期データをFirestoreに投入。

```bash
npx tsx src/seed.ts
```

投入対象:
- tables (10卓)
- casts (5名)
- guestMenuItems (83品)
- castMenuItems (9品)
- setPrices (3帯)
- chargeItems (5種)
- userAccounts (4アカウント、PIN は bcrypt ハッシュ化して保存)
- storeSettings (初期値)

**注意**: `receiptCounter` は独立ドキュメントとしては不要（billing transaction 内で管理）。

---

## 12. 新規ファイル一覧

```
backend/src/
├── types.ts                     ← 型拡張（7型追加、8型修正）
├── index.ts                     ← ルーター登録追加
├── seed.ts                      ★ 新規：初期データ投入
├── middleware/
│   └── auth.ts                  ← requireRole + bcrypt + rate limit 追加
├── routes/
│   ├── attendance.ts            ★ 新規
│   ├── expenses.ts              ★ 新規
│   ├── advances.ts              ★ 新規
│   ├── daily-reports.ts         ★ 新規（レジ締めトランザクション）
│   ├── metrics.ts               ★ 新規
│   ├── export.ts                ★ 新規
│   ├── archive.ts               ★ 新規
│   ├── salary.ts                ★ 新規
│   ├── tables.ts                ← 型対応修正
│   ├── billing.ts               ← アトミック採番 + void + 監査ログ
│   ├── settings.ts              ← デフォルト値追加 + 監査ログ
│   └── payroll.ts               ← DailyPayment リネーム + 給与計算ロジック
└── utils/
    ├── business-date.ts         ★ 新規：toBusinessDate() ユーティリティ
    ├── audit.ts                 ★ 新規：監査ログ書き込みヘルパー
    ├── pagination.ts            ★ 新規：カーソルページネーションヘルパー
    ├── payroll-calc.ts          ★ 新規：給与計算ロジック
    └── fl-calc.ts               ★ 新規：FL指標計算ロジック
```

---

## 13. 環境変数

```env
PORT=3001
JWT_SECRET=<本番用シークレット>
GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
```

**注意**: `FIREBASE_SERVICE_ACCOUNT` を `.env` で JSON 文字列として持つのは事故の元。**ファイルパス参照**（`GOOGLE_APPLICATION_CREDENTIALS`）を使用する。Firebase Admin SDK は `GOOGLE_APPLICATION_CREDENTIALS` 環境変数を自動認識する。

---

## 14. 実装優先順位（レビュー反映版）

| 優先度 | 作業 | 理由 |
|--------|------|------|
| **P0** | 型定義の統一 (`types.ts`) + 監査フィールド追加 | 全ての後続作業の前提 |
| **P0** | 権限制御 (`requireRole`) + PIN bcrypt 化 | セキュリティ要件 |
| **P0** | 日付/タイムゾーン規約 (`business-date.ts`) | 全コレクションの基盤 |
| **P0** | 監査ログ基盤 (`audit.ts`) | 金銭操作の追跡 |
| **P0.5** | 伝票番号アトミック化 (`billing.ts` 内) | 税務上の欠番防止 |
| **P1** | 勤怠（日付またぎ対応・workMinutes） | フロントにUIあり |
| **P1** | 経費・前借り（soft-delete + 監査ログ） | フロントにUIあり |
| **P1** | 日報・レジ締め（トランザクション + dailyAggregates） | 営業終了時の必須機能 |
| **P1** | void/refund（BillingRecord） | 運用上必ず発生する |
| **P1** | ページネーション基盤 | Firestore 1MB 制限対策 |
| **P2** | 給与計算ロジック（深夜割増・税務要件は税理士確認後） | サーバーサイドへ移行 |
| **P2** | FL指標（dailyAggregates 活用） | ProfitPage で使用 |
| **P2** | 自己給与閲覧（cast + staff 両対応） | SalaryPage で使用 |
| **P2** | Firestore インデックスデプロイ | 複合クエリの前提 |
| **P3** | CSV/Excel出力 | 税理士提出用 |
| **P3** | データアーカイブ | パフォーマンス対策 |
| **P3** | リアルタイム同期（onSnapshot） | MVP 後に段階導入 |
| **P3** | Seedスクリプト | 開発・テスト環境構築用 |

---

## 変更履歴

| 日付 | 版 | 内容 |
|------|-----|------|
| 2026-04-22 | Rev.1 | 初版作成 |
| 2026-04-22 | Rev.2 | ハク (Claude Opus 4.7) レビュー反映。クリティカル5件（監査ログ・伝票番号アトミック化・日付またぎ・深夜割増・独自控除）、重要5件（void/refund・ページネーション・PIN bcrypt・Firestoreインデックス・リアルタイム同期）、改善7件（DailyPayment リネーム・staffType 必須化・castSnapshot・dailyAggregates・トランザクション境界・salary/me 両対応・エラーフォーマット統一等）を反映 |
| 2026-04-22 | Rev.3 | ハク最終レビュー反映。A: 採番メカニズムの矛盾解消（metadata/billing ドキュメント明示）、B: 深夜割増の加算式明確化（A/B 両方に内包）、C: legalWithholding を TBD 化+税理士確認必須を明文化、D: 締め後 void 禁止ルール+reopen フロー、E: dailyAggregates.laborCost を時給分のみに限定、F: アーカイブは archivedAt フラグ方式+7年保持義務明記、G: AuditLog を全量スナップショット方式に変更、H: /api/auth/pin を API 一覧に追加、I: salary/me の JWT sub 制限を脚注明示、J: ポーリングを差分取得方式に変更 |
| 2026-04-22 | Rev.3.1 | 最終確定版。legalWithholding の仮実装式を削除→throw Error方式に変更、§6 セクション番号の欠番修正、PIN変更APIにcurrentPin追加（本人変更時必須）、voidedAt/deletedAt の使い分けルール明記、DailyReportにreopenedAt/reopenedBy/reopenReason追加、archivedAtクエリ方針追記。**ハクより実装開始GO承認** |
