import express from 'express'

const app = express()
const port = parseInt(process.env.PORT || '3001', 10)

app.use(express.json())

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() })
})

const guestMenu = [
  { id: 101, name: '焼酎', price: 0, category: 'guest', subcategory: 'shochu' },
  { id: 102, name: 'ウイスキー', price: 0, category: 'guest', subcategory: 'whisky' },
  { id: 103, name: 'ブランデー', price: 0, category: 'guest', subcategory: 'brandy' },
  { id: 104, name: 'シャンパン', price: 0, category: 'guest', subcategory: 'champagne' },
  { id: 105, name: 'ゲストショット', price: 2000, category: 'guest', subcategory: 'shot' },
  { id: 106, name: 'ピッチャー', price: 2000, category: 'guest', subcategory: 'pitcher' },
  { id: 107, name: 'ゲストビール', price: 1500, category: 'guest', subcategory: 'beer' },
  { id: 108, name: '割物', price: 600, category: 'guest', subcategory: 'warimono' },
]

const castMenu = [
  { id: 201, name: 'レディースドリンク (FD)', price: 1000, category: 'cast', subcategory: 'fd', backType: 'FD' },
  { id: 202, name: 'レディースカクテル (本カク)', price: 1500, category: 'cast', subcategory: 'honkaku', backType: '本カク' },
  { id: 203, name: 'レディースショット (本D)', price: 2000, category: 'cast', subcategory: 'hond', backType: '本D' },
]

app.get('/api/menu', (_req, res) => {
  res.json({ guest: guestMenu, cast: castMenu })
})

const tables = [
  { id: 1, number: '1', status: 'occupied', guestCount: 3, startTime: '21:00', castNames: ['あいり'], nomination: 'shimei', setCount: 1 },
  { id: 2, number: '2', status: 'occupied', guestCount: 2, startTime: '21:30', castNames: ['みく'], nomination: 'free', setCount: 1 },
  { id: 3, number: '3', status: 'ending', guestCount: 4, startTime: '20:15', castNames: ['れな'], nomination: 'shimei', setCount: 2 },
  { id: 4, number: '4', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0 },
  { id: 5, number: '5', status: 'occupied', guestCount: 2, startTime: '22:00', castNames: ['ゆい'], nomination: 'free', setCount: 1 },
  { id: 6, number: '6', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0 },
  { id: 7, number: '7', status: 'alert', guestCount: 5, startTime: '20:30', castNames: ['りさ', 'あいり'], nomination: 'douhan', setCount: 1 },
  { id: 8, number: '8', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0 },
  { id: 9, number: 'VIP1', status: 'occupied', guestCount: 3, startTime: '22:30', castNames: ['みく', 'ゆい'], nomination: 'shimei', setCount: 1 },
  { id: 10, number: 'VIP2', status: 'empty', guestCount: 0, startTime: null, castNames: [], nomination: null, setCount: 0 },
]

app.get('/api/tables', (_req, res) => {
  res.json(tables)
})

const staff = [
  { id: 1, name: 'あいり', hourlyRate: 2500, active: true },
  { id: 2, name: 'みく', hourlyRate: 2000, active: true },
  { id: 3, name: 'れな', hourlyRate: 2500, active: true },
  { id: 4, name: 'ゆい', hourlyRate: 2000, active: true },
  { id: 5, name: 'りさ', hourlyRate: 3000, active: true },
]

app.get('/api/staff', (_req, res) => {
  res.json(staff)
})

app.listen(port, () => {
  console.log(`Server running on port ${port}`)
})
