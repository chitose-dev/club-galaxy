/**
 * attendanceConvert の単体テスト（テストランナー非依存・スタンドアロン）。
 *
 * 実行（frontend ディレクトリで）:
 *   node_modules/.bin/tsc src/utils/attendanceConvert.ts \
 *     src/utils/attendanceConvert.test.ts \
 *     --outDir /tmp/acv --module commonjs --target es2020 \
 *     --moduleResolution node --skipLibCheck
 *   node /tmp/acv/utils/attendanceConvert.test.js
 */
import {
  hhmmToIsoJst,
  clockOutHhmmToIsoJst,
  isoToHhmmJst,
  isoToDateJst,
  addDaysToDateString,
  toBackendCreate,
  toBackendPatch,
  fromBackend,
} from './attendanceConvert'
import type { AttendanceRecord } from '../data/mock'

let failures = 0
function check(name: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`PASS: ${name}`)
  } else {
    console.log(`FAIL: ${name}${detail ? ` — ${detail}` : ''}`)
    failures += 1
  }
}

// ─── hhmmToIsoJst (cutoff-aware) ───
check(
  'hhmmToIsoJst: HH >= 5 → businessDate のまま ISO 化',
  hhmmToIsoJst('2026-06-04', '21:30') === '2026-06-04T21:30:00+09:00',
  `got ${hhmmToIsoJst('2026-06-04', '21:30')}`,
)
check(
  'hhmmToIsoJst: cutoff 境界 05:00 → businessDate のまま',
  hhmmToIsoJst('2026-06-04', '05:00') === '2026-06-04T05:00:00+09:00',
  `got ${hhmmToIsoJst('2026-06-04', '05:00')}`,
)
// JST 深夜〜朝の核心ケース: businessDate=06-04, clockIn=02:30 → 実カレンダーは 06-05
check(
  'hhmmToIsoJst: HH=02 (< 5 cutoff) → +1 day (深夜出勤の cutoff 補正)',
  hhmmToIsoJst('2026-06-04', '02:30') === '2026-06-05T02:30:00+09:00',
  `got ${hhmmToIsoJst('2026-06-04', '02:30')}`,
)
check(
  'hhmmToIsoJst: HH=04:59 → +1 day (cutoff 直前まで前営業日扱い)',
  hhmmToIsoJst('2026-06-04', '04:59') === '2026-06-05T04:59:00+09:00',
  `got ${hhmmToIsoJst('2026-06-04', '04:59')}`,
)
check(
  'hhmmToIsoJst: 月跨ぎ + cutoff 補正',
  hhmmToIsoJst('2026-06-30', '03:00') === '2026-07-01T03:00:00+09:00',
  `got ${hhmmToIsoJst('2026-06-30', '03:00')}`,
)
check(
  'hhmmToIsoJst: 空入力 → 空文字',
  hhmmToIsoJst('', '21:30') === '' && hhmmToIsoJst('2026-06-04', '') === '',
)

// ─── isoToHhmmJst ───
check(
  'isoToHhmmJst: JST timezone 付き ISO → HH:MM (JST)',
  isoToHhmmJst('2026-06-04T21:30:00+09:00') === '21:30',
  `got ${isoToHhmmJst('2026-06-04T21:30:00+09:00')}`,
)
check(
  'isoToHhmmJst: UTC Z 付き ISO → JST に補正 (12:30Z = 21:30 JST)',
  isoToHhmmJst('2026-06-04T12:30:00Z') === '21:30',
  `got ${isoToHhmmJst('2026-06-04T12:30:00Z')}`,
)
check(
  'isoToHhmmJst: malformed (HH:MM 文字列) → そのまま返す (legacy 救済)',
  isoToHhmmJst('21:30') === '21:30',
  `got ${isoToHhmmJst('21:30')}`,
)
check(
  'isoToHhmmJst: null / 空 / undefined → null',
  isoToHhmmJst(null) === null && isoToHhmmJst('') === null && isoToHhmmJst(undefined) === null,
)
check(
  'isoToHhmmJst: 完全な不正値 → null',
  isoToHhmmJst('garbage') === null,
  `got ${isoToHhmmJst('garbage')}`,
)

// ─── isoToDateJst ───
check(
  'isoToDateJst: JST ISO → YYYY-MM-DD (JST)',
  isoToDateJst('2026-06-04T21:30:00+09:00') === '2026-06-04',
  `got ${isoToDateJst('2026-06-04T21:30:00+09:00')}`,
)
check(
  'isoToDateJst: UTC 23:30 → JST 翌日 08:30 → 翌日の日付',
  isoToDateJst('2026-06-04T23:30:00Z') === '2026-06-05',
  `got ${isoToDateJst('2026-06-04T23:30:00Z')}`,
)
check(
  'isoToDateJst: malformed → 空文字',
  isoToDateJst('garbage') === '' && isoToDateJst(null) === '',
)

// ─── addDaysToDateString ───
check(
  'addDaysToDateString: +1 day 通常',
  addDaysToDateString('2026-06-04', 1) === '2026-06-05',
  `got ${addDaysToDateString('2026-06-04', 1)}`,
)
check(
  'addDaysToDateString: 月跨ぎ',
  addDaysToDateString('2026-06-30', 1) === '2026-07-01',
  `got ${addDaysToDateString('2026-06-30', 1)}`,
)

// ─── clockOutHhmmToIsoJst (clockIn 基準で day-cross 判定) ───
check(
  'clockOutHhmmToIsoJst: 同日 (20:00 → 22:00)',
  clockOutHhmmToIsoJst('2026-06-04', '20:00', '22:00') === '2026-06-04T22:00:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04', '20:00', '22:00')}`,
)
check(
  'clockOutHhmmToIsoJst: 日跨ぎ (20:00 → 02:00) → 翌日',
  clockOutHhmmToIsoJst('2026-06-04', '20:00', '02:00') === '2026-06-05T02:00:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04', '20:00', '02:00')}`,
)
// 一番大事な深夜越え＋朝退勤ケース: 単純 cutoff 単独だと失敗する
check(
  'clockOutHhmmToIsoJst: 深夜越え＋朝退勤 (20:00 → 06:00) → 翌日 06:00',
  clockOutHhmmToIsoJst('2026-06-04', '20:00', '06:00') === '2026-06-05T06:00:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04', '20:00', '06:00')}`,
)
// 深夜出勤の record: clockIn が cutoff で 06-05 に上がり、clockOut も同日 06-05
check(
  'clockOutHhmmToIsoJst: 深夜出勤 record (businessDate=06-04, clockIn=02:30) + clockOut 04:30 → 06-05T04:30',
  clockOutHhmmToIsoJst('2026-06-04', '02:30', '04:30') === '2026-06-05T04:30:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04', '02:30', '04:30')}`,
)
check(
  'clockOutHhmmToIsoJst: 深夜出勤 + 朝退勤 (02:30 → 06:00) → 同 06-05',
  clockOutHhmmToIsoJst('2026-06-04', '02:30', '06:00') === '2026-06-05T06:00:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04', '02:30', '06:00')}`,
)
check(
  'clockOutHhmmToIsoJst: 月跨ぎ深夜退勤 (06-30 23:00 → 02:00) → 07-01',
  clockOutHhmmToIsoJst('2026-06-30', '23:00', '02:00') === '2026-07-01T02:00:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-30', '23:00', '02:00')}`,
)
check(
  'clockOutHhmmToIsoJst: clockIn 空（旧データ）→ cutoff のみで clockOut ISO 化',
  clockOutHhmmToIsoJst('2026-06-04', '', '03:30') === '2026-06-05T03:30:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04', '', '03:30')}`,
)

// ─── toBackendCreate ───
{
  const front: AttendanceRecord = {
    id: 100,
    staffId: 1,
    staffName: 'みく',
    staffType: 'cast',
    date: '2026-06-04',
    clockIn: '19:30',
    clockOut: null,
    breakMinutes: 0,
    workHours: 0,
  }
  const body = toBackendCreate(front)
  check(
    'toBackendCreate: clockIn HH:MM → ISO 8601 JST',
    body.clockIn === '2026-06-04T19:30:00+09:00' && body.id === 100 && body.staffName === 'みく',
    `got ${JSON.stringify(body)}`,
  )
  check(
    'toBackendCreate: workHours は body に含めない (backend 無視)',
    !('workHours' in body),
  )
}
{
  const front: AttendanceRecord = {
    id: 101, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '19:30', clockOut: null,
    breakMinutes: 30, workHours: 0,
    scheduledClockIn: '19:00',
  }
  const body = toBackendCreate(front)
  check(
    'toBackendCreate: scheduledClockIn HH:MM → ISO 8601 JST',
    body.scheduledClockIn === '2026-06-04T19:00:00+09:00' && body.breakMinutes === 30,
    `got ${JSON.stringify(body)}`,
  )
}

// ─── toBackendPatch ───
{
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '19:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockOut: '22:30' }, base)
  check(
    'toBackendPatch: 同日退勤 → 同日 ISO',
    body.clockOut === '2026-06-04T22:30:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}
{
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '23:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockOut: '01:30' }, base)
  check(
    'toBackendPatch: 日跨ぎ退勤 → 翌日 ISO',
    body.clockOut === '2026-06-05T01:30:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}
{
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '19:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ breakMinutes: 45 }, base)
  check(
    'toBackendPatch: breakMinutes のみ patch → clockOut/clockIn は含まない',
    body.breakMinutes === 45 && !('clockOut' in body) && !('clockIn' in body),
    `got ${JSON.stringify(body)}`,
  )
}

// 出勤時刻の事後修正: clockIn のみ patch → ISO 化、clockOut/breakMinutes は含まない
{
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '19:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '19:00' }, base)
  check(
    'toBackendPatch: clockIn のみ patch → clockIn を ISO 化、他フィールドは含まない',
    body.clockIn === '2026-06-04T19:00:00+09:00' &&
      !('clockOut' in body) && !('breakMinutes' in body),
    `got ${JSON.stringify(body)}`,
  )
}

// clockIn + clockOut 同時 patch: businessDate ベース cutoff で両方独立に補正
{
  // businessDate=06-04 の record で「clockIn を 22:30、clockOut 01:30」と patch。
  // clockIn: HH=22 >= 5 → 06-04
  // clockOut: HH=01 < 5 → 06-05 (cutoff で +1 day)
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '23:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '22:30', clockOut: '01:30' }, base)
  check(
    'toBackendPatch: businessDate=06-04 + clockIn 22:30 + clockOut 01:30 → 日跨ぎ自動補正',
    body.clockIn === '2026-06-04T22:30:00+09:00' &&
      body.clockOut === '2026-06-05T01:30:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// 深夜帯 record: businessDate=06-04 + clockIn 00:30 + clockOut 02:00 → 両方 06-05
{
  // businessDate=06-04 (前日扱い) で実 clockIn=00:30。HH<5 なので新ロジックでは
  // clockIn も clockOut も翌カレンダー日 06-05 に補正される。
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '23:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '00:30', clockOut: '02:00' }, base)
  check(
    'toBackendPatch: businessDate=06-04 + 00:30/02:00 patch → 両方 06-05 (cutoff 補正)',
    body.clockIn === '2026-06-05T00:30:00+09:00' &&
      body.clockOut === '2026-06-05T02:00:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// ─── 核心バグ再現 (Crow ブロッカー 1): 深夜出勤の再読込後 PATCH ───
// backend: businessDate=2026-06-04, clockIn=2026-06-05T02:30:00+09:00
// fromBackend → date=2026-06-04, clockIn='02:30'
// toBackendPatch({clockOut: '04:30'}) → 旧実装: 2026-06-04T04:30 (clockOut < clockIn で 400)
//                                       新実装: 2026-06-05T04:30 (cutoff 補正)
{
  const back = {
    id: 999, staffId: 1, staffName: 'みく', staffType: 'cast',
    businessDate: '2026-06-04',
    clockIn: '2026-06-05T02:30:00+09:00',
    clockOut: null, breakMinutes: 0, workMinutes: 0, paidMinutes: 0,
  }
  const front = fromBackend(back)
  // fromBackend は date=businessDate を維持しつつ HH:MM を JST で抽出
  check(
    'バグ再現セットアップ: fromBackend(深夜出勤) → date=businessDate, clockIn=HH:MM',
    front.date === '2026-06-04' && front.clockIn === '02:30',
    `got ${JSON.stringify(front)}`,
  )
  const body = toBackendPatch({ clockOut: '04:30' }, front)
  check(
    '核心バグ再現: 深夜 record + clockOut 04:30 patch → 06-05T04:30 (06-04 ではない)',
    body.clockOut === '2026-06-05T04:30:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// 同条件で clockIn 修正
{
  const front: AttendanceRecord = {
    id: 999, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '02:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '03:00' }, front)
  check(
    '深夜 record + clockIn 03:00 patch → 06-05T03:00 (cutoff 補正)',
    body.clockIn === '2026-06-05T03:00:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// 同条件で clockIn+clockOut 同時修正
{
  const front: AttendanceRecord = {
    id: 999, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '02:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '03:00', clockOut: '06:00' }, front)
  // clockIn HH=03 < 5 → 06-05、clockOut は新 clockIn を基準にして同 06-05 6:00
  // （clockOutHhmmToIsoJst が clockIn 以降になるよう調整するため）
  check(
    '深夜 record + clockIn 03:00 + clockOut 06:00 → 両方 06-05 (clockIn 基準)',
    body.clockIn === '2026-06-05T03:00:00+09:00' &&
      body.clockOut === '2026-06-05T06:00:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// 通常の評夜越えシフト: businessDate=06-04 で 20:00→06:00
{
  const front: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '20:00', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockOut: '06:00' }, front)
  check(
    '通常評夜越え: businessDate=06-04 + clockIn=20:00 + clockOut patch 06:00 → 06-05T06:00',
    body.clockOut === '2026-06-05T06:00:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// 全 3 フィールド同時 patch
{
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '19:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch(
    { clockIn: '19:00', clockOut: '22:30', breakMinutes: 30 },
    base,
  )
  check(
    'toBackendPatch: 全フィールド同時 patch → 全 ISO 化 + breakMinutes',
    body.clockIn === '2026-06-04T19:00:00+09:00' &&
      body.clockOut === '2026-06-04T22:30:00+09:00' &&
      body.breakMinutes === 30,
    `got ${JSON.stringify(body)}`,
  )
}

// 空 patch (何も含まれない) → 空 body
{
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '19:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({}, base)
  check(
    'toBackendPatch: 空 patch → 空 body (呼出側で no-op 判定)',
    Object.keys(body).length === 0,
    `got ${JSON.stringify(body)}`,
  )
}

// ─── fromBackend ───
{
  const back = {
    id: 100,
    staffId: 1,
    staffName: 'みく',
    staffType: 'cast',
    businessDate: '2026-06-04',
    clockIn: '2026-06-04T19:30:00+09:00',
    clockOut: '2026-06-04T22:30:00+09:00',
    breakMinutes: 30,
    workMinutes: 150,
    paidMinutes: 150,
  }
  const front = fromBackend(back)
  check(
    'fromBackend: ISO 8601 → HH:MM + date + workHours',
    front.date === '2026-06-04' &&
      front.clockIn === '19:30' &&
      front.clockOut === '22:30' &&
      front.workHours === 2.5 &&
      front.breakMinutes === 30,
    `got ${JSON.stringify(front)}`,
  )
}
{
  // legacy: clockIn が HH:MM 文字列で保存された旧データ
  const back = {
    id: 200,
    staffId: 2,
    staffName: 'あいり',
    staffType: 'cast',
    businessDate: '2026-06-04',
    clockIn: '19:30',   // HH:MM 文字列（malformed）
    clockOut: null,
    breakMinutes: 0,
    workMinutes: 0,
  }
  const front = fromBackend(back)
  check(
    'fromBackend: legacy HH:MM 文字列 → fallback で HH:MM のまま',
    front.clockIn === '19:30' && front.date === '2026-06-04',
    `got ${JSON.stringify(front)}`,
  )
}
{
  // workMinutes 端数（90 分 = 1.5h）
  const back = {
    id: 300, staffId: 3, staffName: 'a', staffType: 'cast',
    businessDate: '2026-06-04',
    clockIn: '2026-06-04T19:00:00+09:00',
    clockOut: '2026-06-04T20:30:00+09:00',
    breakMinutes: 0, workMinutes: 90, paidMinutes: 90,
  }
  const front = fromBackend(back)
  check(
    'fromBackend: workMinutes 90 → workHours 1.5',
    front.workHours === 1.5,
    `got ${front.workHours}`,
  )
}

if (failures > 0) {
  console.error(`\n${failures} test(s) failed`)
} else {
  console.log('\nAll attendanceConvert tests passed')
}
