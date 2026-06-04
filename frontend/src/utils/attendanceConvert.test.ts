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

// ─── hhmmToIsoJst ───
check(
  'hhmmToIsoJst: 通常 → JST timezone 付き ISO',
  hhmmToIsoJst('2026-06-04', '21:30') === '2026-06-04T21:30:00+09:00',
  `got ${hhmmToIsoJst('2026-06-04', '21:30')}`,
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

// ─── clockOutHhmmToIsoJst ───
check(
  'clockOutHhmmToIsoJst: 同日 (clockIn 19:00 → clockOut 22:30)',
  clockOutHhmmToIsoJst('2026-06-04T19:00:00+09:00', '22:30') === '2026-06-04T22:30:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04T19:00:00+09:00', '22:30')}`,
)
check(
  'clockOutHhmmToIsoJst: 日跨ぎ (clockIn 23:30 → clockOut 01:30) → +1 day',
  clockOutHhmmToIsoJst('2026-06-04T23:30:00+09:00', '01:30') === '2026-06-05T01:30:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-04T23:30:00+09:00', '01:30')}`,
)
check(
  'clockOutHhmmToIsoJst: 月跨ぎ深夜退勤',
  clockOutHhmmToIsoJst('2026-06-30T23:00:00+09:00', '02:00') === '2026-07-01T02:00:00+09:00',
  `got ${clockOutHhmmToIsoJst('2026-06-30T23:00:00+09:00', '02:00')}`,
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

// clockIn + clockOut 同時 patch: clockOut の日跨ぎ判定は新 clockIn が基準
{
  // 旧 clockIn=23:30 の record で「clockIn を 22:30 に下げて、clockOut 01:30」と patch。
  // 新 clockIn (22:30) を基準にすれば 01:30 は日跨ぎ → 翌日 ISO。
  // 旧 clockIn (23:30) を基準にすると 01:30 もやはり日跨ぎだが、
  // テストとして「新 clockIn 基準」が効いていることを別ケースで確認する。
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '23:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '22:30', clockOut: '01:30' }, base)
  check(
    'toBackendPatch: clockIn+clockOut 同時 patch → 新 clockIn 基準で日跨ぎ判定',
    body.clockIn === '2026-06-04T22:30:00+09:00' &&
      body.clockOut === '2026-06-05T01:30:00+09:00',
    `got ${JSON.stringify(body)}`,
  )
}

// 新 clockIn 基準が「同日」になるケース (旧 clockIn を使うと別の判定になる)
{
  // 旧 clockIn=23:30 (前日 record) → 新 clockIn=00:30 + clockOut 02:00
  // 新 clockIn 基準: 同日 → clockOut も同日 ISO
  // (もし旧 23:30 基準で判定すると clockOut 02:00 を「日跨ぎ」と誤判定して
  //  翌日にしてしまうため、新 clockIn 基準で計算しなければならない)
  const base: AttendanceRecord = {
    id: 100, staffId: 1, staffName: 'みく', staffType: 'cast',
    date: '2026-06-04', clockIn: '23:30', clockOut: null,
    breakMinutes: 0, workHours: 0,
  }
  const body = toBackendPatch({ clockIn: '00:30', clockOut: '02:00' }, base)
  check(
    'toBackendPatch: 新 clockIn=00:30 基準、clockOut=02:00 は同日 ISO (旧 clockIn 基準だと誤判定)',
    body.clockIn === '2026-06-04T00:30:00+09:00' &&
      body.clockOut === '2026-06-04T02:00:00+09:00',
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
