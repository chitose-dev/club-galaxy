// ─── 型定義 ───

export type TableStatus = 'empty' | 'occupied' | 'ending' | 'alert'

export interface Table {
  id: number
  number: string
  status: TableStatus
  guestCount: number
  startTime: string | null
  castNames: string[]
  nomination: 'shimei' | 'banai' | 'free' | 'douhan' | null
  setCount: number
  orders: OrderItem[]
}

export interface GuestMenuItem {
  id: number
  name: string
  price: number
  category: 'guest'
  subcategory: 'shochu' | 'whisky' | 'brandy' | 'champagne' | 'shot' | 'pitcher' | 'beer' | 'warimono'
}

export interface CastMenuItem {
  id: number
  name: string
  price: number
  category: 'cast'
  subcategory: 'fd' | 'honkaku' | 'hond'
  backType: BackType
}

export type MenuItem = GuestMenuItem | CastMenuItem

export type BackType = 'FD' | '本D' | 'Fカク' | '本カク' | '本カクW' | '同伴' | '本指名' | '場内指名' | 'ボトルバック' | 'その他'

export interface OrderItem {
  menuItem: MenuItem
  quantity: number
  castName?: string
}

export interface Cast {
  id: number
  name: string
  hourlyRate: number
  backRates: Partial<Record<BackType, number>>
  active: boolean
}

export interface SetPrice {
  id: string
  label: string
  price: number
}

// ─── セット料金（時間帯別） ───

export const setPrices: SetPrice[] = [
  { id: 'set-2000', label: '20:00〜20:59', price: 3500 },
  { id: 'set-2100', label: '21:00〜22:59', price: 4000 },
  { id: 'set-2300', label: '23:00〜ラスト', price: 5000 },
]

export const chargeItems: SetPrice[] = [
  { id: 'single-charge', label: 'シングルチャージ', price: 1000 },
  { id: 'douhan', label: '同伴', price: 4000 },
  { id: 'shimei', label: '指名料', price: 2000 },
  { id: 'banai', label: '場内指名', price: 1000 },
  { id: 'help', label: 'ヘルプ', price: 4000 },
]

export const SET_DURATION_MINUTES = 60
export const EXTENSION_OPTIONS = [30, 60] as const
export const ALERT_MINUTES = 50
export const ENDING_MINUTES = 10

// ─── ゲスト用ドリンクメニュー ───

export const guestMenuItems: GuestMenuItem[] = [
  { id: 101, name: '焼酎', price: 0, category: 'guest', subcategory: 'shochu' },
  { id: 102, name: 'ウイスキー', price: 0, category: 'guest', subcategory: 'whisky' },
  { id: 103, name: 'ブランデー', price: 0, category: 'guest', subcategory: 'brandy' },
  { id: 104, name: 'シャンパン', price: 0, category: 'guest', subcategory: 'champagne' },
  { id: 105, name: 'ゲストショット', price: 2000, category: 'guest', subcategory: 'shot' },
  { id: 106, name: 'ピッチャー', price: 2000, category: 'guest', subcategory: 'pitcher' },
  { id: 107, name: 'ゲストビール', price: 1500, category: 'guest', subcategory: 'beer' },
  { id: 108, name: '割物', price: 600, category: 'guest', subcategory: 'warimono' },
]

// ─── キャスト用ドリンクメニュー ───

export const castMenuItems: CastMenuItem[] = [
  { id: 201, name: 'レディースドリンク (FD)', price: 1000, category: 'cast', subcategory: 'fd', backType: 'FD' },
  { id: 202, name: 'レディースカクテル (本カク)', price: 1500, category: 'cast', subcategory: 'honkaku', backType: '本カク' },
  { id: 203, name: 'レディースショット (本D)', price: 2000, category: 'cast', subcategory: 'hond', backType: '本D' },
]

export const allMenuItems: MenuItem[] = [...guestMenuItems, ...castMenuItems]

// ─── キャスト一覧 ───

export const casts: Cast[] = [
  {
    id: 1, name: 'あいり', hourlyRate: 2500, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000 },
  },
  {
    id: 2, name: 'みく', hourlyRate: 2000, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000 },
  },
  {
    id: 3, name: 'れな', hourlyRate: 2500, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000 },
  },
  {
    id: 4, name: 'ゆい', hourlyRate: 2000, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000 },
  },
  {
    id: 5, name: 'りさ', hourlyRate: 3000, active: true,
    backRates: { FD: 200, '本D': 500, 'Fカク': 300, '本カク': 500, '本カクW': 800, '同伴': 3000, '本指名': 1500, '場内指名': 500, 'ボトルバック': 1000 },
  },
]

// ─── ユーティリティ ───

export function getSetPriceForTime(startTime: string): number {
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 21) return 3500
  if (hour < 23) return 4000
  return 5000
}

export function getSetPriceLabel(startTime: string): string {
  const hour = parseInt(startTime.split(':')[0], 10)
  if (hour < 21) return '20:00〜20:59'
  if (hour < 23) return '21:00〜22:59'
  return '23:00〜ラスト'
}

// ─── 卓データ（デモ用10卓） ───

export const initialTables: Table[] = [
  { id: 1, number: '1', status: 'occupied', guestCount: 3, startTime: '21:00', castNames: ['あいり'], nomination: 'shimei', setCount: 1, orders: [] },
  { id: 2, number: '2', status: 'occupied', guestCount: 2, startTime: '21:30', castNames: ['みく'], nomination: 'free', setCount: 1, orders: [] },
  { id: 3, number: '3', status: 'ending', guestCount: 4, startTime: '20:15', castNames: ['れな'], nomination: 'shimei', setCount: 2, orders: [] },
  { id: 4, number: '4', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
  { id: 5, number: '5', status: 'occupied', guestCount: 2, startTime: '22:00', castNames: ['ゆい'], nomination: 'free', setCount: 1, orders: [] },
  { id: 6, number: '6', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
  { id: 7, number: '7', status: 'alert', guestCount: 5, startTime: '20:30', castNames: ['りさ', 'あいり'], nomination: 'douhan', setCount: 1, orders: [] },
  { id: 8, number: '8', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
  { id: 9, number: 'VIP1', status: 'occupied', guestCount: 3, startTime: '22:30', castNames: ['みく', 'ゆい'], nomination: 'shimei', setCount: 1, orders: [] },
  { id: 10, number: 'VIP2', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0, orders: [] },
]

export const nominationLabels: Record<string, string> = {
  shimei: '本指名',
  banai: '場内指名',
  free: 'フリー',
  douhan: '同伴',
}
