import { useState } from 'react'
import { useStore } from '../store'
import type { Cast, BackType, GuestMenuItem, CastMenuItem } from '../data/mock'

type AdminTab = 'menu' | 'cast' | 'price'

const backTypes: BackType[] = ['FD', '本D', 'Fカク', '本カク', '本カクW', '同伴', '本指名', '場内指名', 'ボトルバック', 'その他']

export default function AdminPage() {
  const {
    guestMenu, castMenu, casts, setPrices, chargeItems,
    setGuestMenu, setCastMenu, setCasts, setSetPrices, setChargeItems,
  } = useStore()

  const [activeTab, setActiveTab] = useState<AdminTab>('menu')

  return (
    <div className="p-4">
      <h2 className="text-lg font-bold mb-4 text-[#d4af37]">管理メニュー</h2>

      <div className="flex border-b border-gray-700 mb-4">
        {([
          { key: 'menu' as const, label: 'ドリンクメニュー' },
          { key: 'cast' as const, label: 'キャスト管理' },
          { key: 'price' as const, label: 'セット料金' },
        ]).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 text-sm font-bold transition-colors ${
              activeTab === tab.key ? 'text-[#d4af37] border-b-2 border-[#d4af37]' : 'text-gray-400'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'menu' && <MenuManager guestMenu={guestMenu} castMenu={castMenu} setGuestMenu={setGuestMenu} setCastMenu={setCastMenu} />}
      {activeTab === 'cast' && <CastManager casts={casts} setCasts={setCasts} />}
      {activeTab === 'price' && <PriceManager setPrices={setPrices} chargeItems={chargeItems} setSetPrices={setSetPrices} setChargeItems={setChargeItems} />}
    </div>
  )
}

function MenuManager({ guestMenu, castMenu, setGuestMenu, setCastMenu }: {
  guestMenu: GuestMenuItem[]; castMenu: CastMenuItem[]
  setGuestMenu: React.Dispatch<React.SetStateAction<GuestMenuItem[]>>
  setCastMenu: React.Dispatch<React.SetStateAction<CastMenuItem[]>>
}) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editPrice, setEditPrice] = useState('')

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-300 mb-2">ゲスト用ドリンク</h3>
        <div className="space-y-1">
          {guestMenu.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
              <span className="text-sm">{item.name}</span>
              {editingId === item.id ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/10 border border-gray-600 rounded px-2 py-1 text-sm text-right" />
                  <button onClick={() => { setGuestMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice) } : m)); setEditingId(null) }} className="text-xs bg-[#d4af37] text-black px-2 py-1 rounded font-bold">保存</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#d4af37]">{item.price === 0 ? 'セット内' : `¥${item.price.toLocaleString()}`}</span>
                  <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)) }} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">編集</button>
                  <button onClick={() => setGuestMenu((prev) => prev.filter((m) => m.id !== item.id))} className="text-xs bg-red-900/50 px-2 py-1 rounded text-red-400">削除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-bold text-gray-300 mb-2">キャスト用ドリンク</h3>
        <div className="space-y-1">
          {castMenu.map((item) => (
            <div key={item.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
              <div>
                <span className="text-sm">{item.name}</span>
                <span className="text-xs text-purple-400 ml-2">Back: {item.backType}</span>
              </div>
              {editingId === item.id ? (
                <div className="flex items-center gap-2">
                  <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-20 bg-white/10 border border-gray-600 rounded px-2 py-1 text-sm text-right" />
                  <button onClick={() => { setCastMenu((prev) => prev.map((m) => m.id === item.id ? { ...m, price: Number(editPrice) } : m)); setEditingId(null) }} className="text-xs bg-[#d4af37] text-black px-2 py-1 rounded font-bold">保存</button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-[#d4af37]">¥{item.price.toLocaleString()}</span>
                  <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)) }} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">編集</button>
                  <button onClick={() => setCastMenu((prev) => prev.filter((m) => m.id !== item.id))} className="text-xs bg-red-900/50 px-2 py-1 rounded text-red-400">削除</button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function CastManager({ casts, setCasts }: { casts: Cast[]; setCasts: React.Dispatch<React.SetStateAction<Cast[]>> }) {
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editName, setEditName] = useState('')
  const [editRate, setEditRate] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [newName, setNewName] = useState('')
  const [newRate, setNewRate] = useState('2000')

  const handleSave = (id: number) => {
    setCasts((prev) => prev.map((c) => c.id === id ? { ...c, name: editName, hourlyRate: Number(editRate) } : c))
    setEditingId(null)
  }

  const handleAdd = () => {
    if (!newName) return
    const maxId = Math.max(...casts.map((c) => c.id), 0)
    const defaultBackRates: Partial<Record<BackType, number>> = {}
    backTypes.forEach((bt) => { defaultBackRates[bt] = 0 })
    setCasts((prev) => [...prev, { id: maxId + 1, name: newName, hourlyRate: Number(newRate), backRates: defaultBackRates, active: true }])
    setNewName('')
    setNewRate('2000')
    setShowAdd(false)
  }

  return (
    <div className="space-y-3">
      {casts.map((cast) => (
        <div key={cast.id} className="bg-white/5 rounded-lg p-3">
          {editingId === cast.id ? (
            <div className="space-y-2">
              <input value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm" placeholder="名前" />
              <input type="number" value={editRate} onChange={(e) => setEditRate(e.target.value)} className="w-full bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm" placeholder="時給" />
              <div className="flex gap-2">
                <button onClick={() => handleSave(cast.id)} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">保存</button>
                <button onClick={() => setEditingId(null)} className="flex-1 bg-white/10 py-2 rounded-lg text-sm text-gray-400">キャンセル</button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div>
                <span className="font-bold">{cast.name}</span>
                <span className="text-sm text-gray-400 ml-2">¥{cast.hourlyRate.toLocaleString()}/h</span>
                {!cast.active && <span className="text-xs text-red-400 ml-2">非アクティブ</span>}
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setEditingId(cast.id); setEditName(cast.name); setEditRate(String(cast.hourlyRate)) }} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">編集</button>
                <button onClick={() => setCasts((prev) => prev.map((c) => c.id === cast.id ? { ...c, active: !c.active } : c))} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">{cast.active ? '無効化' : '有効化'}</button>
                <button onClick={() => setCasts((prev) => prev.filter((c) => c.id !== cast.id))} className="text-xs bg-red-900/50 px-2 py-1 rounded text-red-400">削除</button>
              </div>
            </div>
          )}
        </div>
      ))}

      {showAdd ? (
        <div className="bg-white/5 rounded-lg p-3 space-y-2">
          <input value={newName} onChange={(e) => setNewName(e.target.value)} className="w-full bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm" placeholder="キャスト名" />
          <input type="number" value={newRate} onChange={(e) => setNewRate(e.target.value)} className="w-full bg-white/10 border border-gray-600 rounded px-3 py-1.5 text-sm" placeholder="時給" />
          <div className="flex gap-2">
            <button onClick={handleAdd} className="flex-1 bg-[#d4af37] text-black py-2 rounded-lg text-sm font-bold">追加</button>
            <button onClick={() => setShowAdd(false)} className="flex-1 bg-white/10 py-2 rounded-lg text-sm text-gray-400">キャンセル</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setShowAdd(true)} className="w-full bg-white/5 border border-dashed border-gray-600 rounded-lg py-3 text-sm text-gray-400">+ キャスト追加</button>
      )}
    </div>
  )
}

function PriceManager({ setPrices, chargeItems, setSetPrices, setChargeItems }: {
  setPrices: { id: string; label: string; price: number }[]
  chargeItems: { id: string; label: string; price: number }[]
  setSetPrices: React.Dispatch<React.SetStateAction<{ id: string; label: string; price: number }[]>>
  setChargeItems: React.Dispatch<React.SetStateAction<{ id: string; label: string; price: number }[]>>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editPrice, setEditPrice] = useState('')

  const handleSave = (id: string, isCharge: boolean) => {
    const setter = isCharge ? setChargeItems : setSetPrices
    setter((prev) => prev.map((p) => p.id === id ? { ...p, price: Number(editPrice) } : p))
    setEditingId(null)
  }

  const renderRow = (item: { id: string; label: string; price: number }, isCharge: boolean) => (
    <div key={item.id} className="flex items-center justify-between bg-white/5 rounded-lg px-3 py-2">
      <span className="text-sm">{item.label}</span>
      {editingId === item.id ? (
        <div className="flex items-center gap-2">
          <input type="number" value={editPrice} onChange={(e) => setEditPrice(e.target.value)} className="w-24 bg-white/10 border border-gray-600 rounded px-2 py-1 text-sm text-right" />
          <button onClick={() => handleSave(item.id, isCharge)} className="text-xs bg-[#d4af37] text-black px-2 py-1 rounded font-bold">保存</button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <span className="text-sm text-[#d4af37]">¥{item.price.toLocaleString()}</span>
          <button onClick={() => { setEditingId(item.id); setEditPrice(String(item.price)) }} className="text-xs bg-white/10 px-2 py-1 rounded text-gray-400">編集</button>
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-bold text-gray-300 mb-2">セット料金（時間帯別）</h3>
        <div className="space-y-1">{setPrices.map((item) => renderRow(item, false))}</div>
      </div>
      <div>
        <h3 className="text-sm font-bold text-gray-300 mb-2">チャージ・指名料</h3>
        <div className="space-y-1">{chargeItems.map((item) => renderRow(item, true))}</div>
      </div>
      <div className="bg-white/5 rounded-lg p-3">
        <div className="text-xs text-gray-500 space-y-1">
          <div>セット時間: 60分</div>
          <div>延長: 30分 or 60分</div>
          <div>中間チェック: 50分で自動表示</div>
          <div>カード決済: 外部端末(S1EP)使用、金額手入力</div>
        </div>
      </div>
    </div>
  )
}
