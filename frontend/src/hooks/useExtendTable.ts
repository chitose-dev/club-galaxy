import { useCallback } from 'react'
import { useStore } from '../store'
import { getSetPriceForTime } from '../data/mock'
import type { Table, ExtensionEntry } from '../data/mock'
import { getExLabel } from '../utils/setCountLabel'

/**
 * 卓の延長確定処理（FloorPage / OrderPage 共通フック）。
 *
 * ISSUE-004 / ビデオレビュー B7 準拠:
 *   - 本指名キャストのみ assignedCasts に継承、それ以外は待機戻し
 *   - 同伴・場内指名フラグは解除
 *   - orders はクリアして「本指名料 × 継承人数 + 延長料金」だけを再計上
 *     (セットごとに orders を切り出す既存設計に合わせる)
 *   - 延長料金 = 時間帯セット料金 × 人数(60分時)、30分時は半額
 */
export function useExtendTable() {
  const { updateTable, moveCast, chargeItems, setPrices } = useStore()
  return useCallback(
    (table: Table, minutes: 30 | 60, castNames: ReadonlyArray<string>) => {
      const setUnit = table.startTime ? getSetPriceForTime(table.startTime, setPrices) : 0
      const setUnitAdjusted = Math.max(0, setUnit - (table.setDiscountPerSet ?? 0))
      const fullSetCharge = setUnitAdjusted * table.guestCount
      const charge = minutes === 60 ? fullSetCharge : Math.round(fullSetCharge / 2)
      const entryId = Date.now()
      const orderId = 2000 + entryId
      // 注文行の castName は単一フィールドのため代表 1 名を入れる（バック計算は集計側で
      // ExtensionEntry.nominatedCastNames を読み、均等按分する想定）。
      const primaryCast = castNames[0]
      const newEntry: ExtensionEntry = {
        id: entryId,
        minutes,
        timestamp: new Date().toISOString(),
        nominatedCastName: primaryCast,           // 後方互換
        nominatedCastNames: [...castNames],       // 新規: 複数指名
        orderMenuItemId: orderId,
      }
      // 注文/利用/会計明細に出る延長行の表示名は EX(n) / EX(n)半 形式に統一する
      // (旧 `延長 +N分` 表記は廃止)。n は今回追加する EX のシリアル番号 (1-based)。
      const exIndex = (table.extensionHistory ?? []).length + 1
      const extensionOrder = {
        menuItem: {
          id: orderId,
          name: getExLabel(exIndex, minutes),
          price: charge,
          cost: 0,
          castBack: 0,
          category: 'guest' as const,
          subcategory: 'warimono' as const,
        },
        quantity: 1,
        castName: primaryCast,
      }
      const continuing = table.mainNominationCastNames
      const leaving = table.assignedCasts.filter((n) => !continuing.includes(n))
      for (const name of leaving) {
        moveCast(name, null)
      }
      const shimei = chargeItems.find((c) => c.id === 'shimei')
      const newOrders: Table['orders'] = []
      let nextChargeId = Date.now()
      if (shimei) {
        continuing.forEach((name) => {
          newOrders.push({
            menuItem: {
              id: nextChargeId++,
              name: shimei.label,
              price: shimei.price,
              cost: shimei.cost ?? 300,
              castBack: 0,
              category: 'guest' as const,
              subcategory: 'warimono' as const,
            },
            quantity: 1,
            castName: name,
          })
        })
      }
      newOrders.push(extensionOrder)
      updateTable(table.id, {
        status: 'occupied' as const,
        extensionHistory: [...(table.extensionHistory ?? []), newEntry],
        orders: newOrders,
        assignedCasts: continuing,
        // JSON.stringify は undefined キーを落とすため、PATCH で確実にクリアするには
        // false を明示送出する必要がある（undefined だとバック側で値が残り、
        // リロード後に同伴/場内指名フラグが復活してしまう）。
        isDouhan: false,
        isBanaiShimei: false,
      })
    },
    [updateTable, moveCast, chargeItems, setPrices],
  )
}
