import { Router } from 'express'
import { storeCollection } from '../firebase'
import { getAuthedUser } from '../middleware/auth'
import { nowJstIso } from '../lib/businessDate'
import { sendError, throwBadRequest, throwNotFound } from '../lib/errors'
import type { Table, OrderEmbedded } from '../types'

export const tablesRouter = Router()
const col = () => storeCollection('tables')

// ---------------------------------------------------------------------------
// GET /api/tables
// ---------------------------------------------------------------------------
tablesRouter.get('/', async (_req, res) => {
  try {
    const snap = await col().orderBy('id').get()
    const tables = snap.docs.map((d) => d.data() as Table)
    res.json(tables)
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// POST /api/tables/move-cast — キャスト移動（transaction で全卓を一括更新）
// must be before /:id routes
// ---------------------------------------------------------------------------
tablesRouter.post('/move-cast', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const { castName, toTableId } = req.body ?? {}
    if (typeof castName !== 'string' || castName.trim() === '') {
      throwBadRequest('castName は文字列')
    }

    const now = nowJstIso()
    await col().firestore.runTransaction(async (tx) => {
      const allSnap = await tx.get(col())
      allSnap.docs.forEach((doc) => {
        const table = doc.data() as Table
        const hasCast = table.assignedCasts.includes(castName)
        const isTarget = toTableId != null && table.id === toTableId

        if (isTarget && !hasCast) {
          tx.update(doc.ref, {
            assignedCasts: [...table.assignedCasts, castName],
            updatedBy: user.username,
            updatedAt: now,
          })
        } else if (!isTarget && hasCast) {
          tx.update(doc.ref, {
            assignedCasts: table.assignedCasts.filter((n) => n !== castName),
            updatedBy: user.username,
            updatedAt: now,
          })
        }
      })
    })

    res.json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// PUT /api/tables/reorder — must be before /:id routes
// ---------------------------------------------------------------------------
tablesRouter.put('/reorder', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const { fromIndex, toIndex } = req.body ?? {}
    if (typeof fromIndex !== 'number' || typeof toIndex !== 'number') {
      throwBadRequest('fromIndex / toIndex は数値')
    }
    const snap = await col().orderBy('id').get()
    const tables = snap.docs.map((d) => d.data() as Table)
    if (fromIndex < 0 || fromIndex >= tables.length || toIndex < 0 || toIndex >= tables.length) {
      throwBadRequest('index が範囲外')
    }
    const [moved] = tables.splice(fromIndex, 1)
    tables.splice(toIndex, 0, moved)

    const now = nowJstIso()
    const batch = col().firestore.batch()
    tables.forEach((t, i) => {
      batch.update(col().doc(String(t.id)), {
        id: i + 1,
        updatedBy: user.username,
        updatedAt: now,
      })
    })
    await batch.commit()
    res.json({ ok: true })
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// GET /api/tables/:id
// ---------------------------------------------------------------------------
tablesRouter.get('/:id', async (req, res) => {
  try {
    const doc = await col().doc(String(req.params.id)).get()
    if (!doc.exists) throwNotFound('卓が見つかりません')
    res.json(doc.data())
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// PATCH /api/tables/:id
// ---------------------------------------------------------------------------
tablesRouter.patch('/:id', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const ref = col().doc(String(req.params.id))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('卓が見つかりません')
    await ref.update({
      ...(req.body ?? {}),
      updatedBy: user.username,
      updatedAt: nowJstIso(),
    })
    const updated = await ref.get()
    res.json(updated.data())
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// POST /api/tables/:id/reset — 卓を空席に戻す（Rev.4.1 Table 構造刷新）
// ---------------------------------------------------------------------------
tablesRouter.post('/:id/reset', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const ref = col().doc(String(req.params.id))
    const doc = await ref.get()
    if (!doc.exists) throwNotFound('卓が見つかりません')
    await ref.update({
      status: 'empty',
      guestCount: 0,
      startTime: null,
      businessDate: null,
      assignedCasts: [],
      mainNominationCastNames: [],
      isDouhan: false,
      isBanaiShimei: false,
      setCount: 0,
      orders: [],
      checkTicketPrintedAt: null,
      setDiscountPerSet: null,
      timeAdjustmentMinutes: null,
      extensionHistory: [],
      updatedBy: user.username,
      updatedAt: nowJstIso(),
    })
    const updated = await ref.get()
    res.json(updated.data())
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// POST /api/tables/:id/orders — 注文追加（★ 致命① OrderEmbedded.id を tx 内で連番採番）
//
// ★ クロウ R1 致命: 配列インデックスは不安定。`Table.orders[].id` を tx 内で
//    `max(existing.id) + 1` の連番採番で埋め、Table.orders 内で一意保証。
//
// 入力 (Rev.4.1 §3.7):
//   {
//     menuItem: { id, name, price, cost, castBack, category, subcategory, backType? },
//     quantity: number,
//     castName?: string,
//     bonusCastName?: string, bonusAmount?: number,
//     splitCastIds?: number[],
//     isExtension?: boolean
//   }
//
// 暫定: menuItem スナップショットはクライアント送信値を信頼（フロントが mock.ts から作る）
// TODO P1: サーバー側で `guestMenu` / `castMenu` から menuItem を取得しスナップショット化
// TODO P1: dailyAggregates 同梱更新、calcChampagneSplit による splitCastIds の自動算出
// ---------------------------------------------------------------------------
tablesRouter.post('/:id/orders', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const tableId = String(req.params.id)
    const body = req.body ?? {}
    if (typeof body.menuItem !== 'object' || body.menuItem === null) {
      throwBadRequest('menuItem オブジェクトが必要です')
    }
    const mi = body.menuItem as Record<string, unknown>
    if (
      typeof mi.id !== 'number' ||
      typeof mi.name !== 'string' ||
      typeof mi.price !== 'number' ||
      typeof mi.cost !== 'number' ||
      typeof mi.castBack !== 'number' ||
      (mi.category !== 'guest' && mi.category !== 'cast') ||
      typeof mi.subcategory !== 'string'
    ) {
      throwBadRequest('menuItem の id/name/price/cost/castBack/category/subcategory が不正')
    }
    if (typeof body.quantity !== 'number' || body.quantity <= 0) {
      throwBadRequest('quantity は正の数値')
    }

    const newOrder = await col().firestore.runTransaction(async (tx) => {
      const ref = col().doc(tableId)
      const snap = await tx.get(ref)
      if (!snap.exists) throwNotFound('卓が見つかりません')
      const table = snap.data() as Table

      // Fix C (ふうや指摘): 同一 menuItem.id + castName の order が既に存在する場合は
      //   新規 order を追加せず quantity を加算してマージ。複数端末で同卓に同じ
      //   メニューを並列で投入しても orders の行数が増えず、tx 内 merge により
      //   counter race も防げる。
      const existingIdx = table.orders.findIndex(
        (o) => o.menuItem.id === (mi.id as number) && o.castName === body.castName,
      )
      if (existingIdx >= 0) {
        const merged: OrderEmbedded = {
          ...table.orders[existingIdx],
          quantity: table.orders[existingIdx].quantity + (body.quantity as number),
        }
        const newOrders = [...table.orders]
        newOrders[existingIdx] = merged
        tx.update(ref, {
          orders: newOrders,
          updatedBy: user.username,
          updatedAt: nowJstIso(),
        })
        return merged
      }

      // ★ 致命① 連番採番: 既存 orders の最大 id + 1（空配列なら 1 から開始）
      const maxId = table.orders.reduce((m, o) => (o.id > m ? o.id : m), 0)
      const order: OrderEmbedded = {
        id: maxId + 1,
        menuItem: {
          id: mi.id as number,
          name: mi.name as string,
          price: mi.price as number,
          cost: mi.cost as number,
          castBack: mi.castBack as number,
          category: mi.category as 'guest' | 'cast',
          subcategory: mi.subcategory as string,
          ...(typeof mi.backType === 'string' ? { backType: mi.backType as OrderEmbedded['menuItem']['backType'] } : {}),
        },
        quantity: body.quantity as number,
        ...(typeof body.castName === 'string' ? { castName: body.castName as string } : {}),
        ...(typeof body.bonusCastName === 'string' ? { bonusCastName: body.bonusCastName as string } : {}),
        ...(typeof body.bonusAmount === 'number' ? { bonusAmount: body.bonusAmount as number } : {}),
        ...(Array.isArray(body.splitCastIds)
          ? { splitCastIds: (body.splitCastIds as unknown[]).filter((v): v is number => typeof v === 'number') }
          : {}),
        ...(typeof body.isExtension === 'boolean' ? { isExtension: body.isExtension as boolean } : {}),
        addedAt: nowJstIso(),
        addedBy: user.username,
      }

      tx.update(ref, {
        orders: [...table.orders, order],
        updatedBy: user.username,
        updatedAt: nowJstIso(),
      })
      return order
    })

    res.status(201).json(newOrder)
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// POST /api/tables/:id/orders/decrement — menuItem.id + castName で 1 減算
//   Fix C: frontend が orderId を知らずに削除できる atomic エンドポイント。
//   quantity が 1 以下なら order ごと削除、>1 なら quantity-1 で更新。
//   複数端末から同時に呼んでも tx 内で読み込み + 書き込みが atomic。
// ---------------------------------------------------------------------------
tablesRouter.post('/:id/orders/decrement', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const tableId = String(req.params.id)
    const body = req.body ?? {}
    if (typeof body.menuItemId !== 'number') {
      throwBadRequest('menuItemId は数値')
    }
    const castName = typeof body.castName === 'string' ? body.castName : undefined

    const result = await col().firestore.runTransaction(async (tx) => {
      const ref = col().doc(tableId)
      const snap = await tx.get(ref)
      if (!snap.exists) throwNotFound('卓が見つかりません')
      const table = snap.data() as Table
      const idx = table.orders.findIndex(
        (o) => o.menuItem.id === body.menuItemId && o.castName === castName,
      )
      if (idx < 0) throwNotFound('注文が見つかりません')
      const newOrders = [...table.orders]
      if (newOrders[idx].quantity > 1) {
        newOrders[idx] = { ...newOrders[idx], quantity: newOrders[idx].quantity - 1 }
      } else {
        newOrders.splice(idx, 1)
      }
      tx.update(ref, {
        orders: newOrders,
        updatedBy: user.username,
        updatedAt: nowJstIso(),
      })
      return { ok: true, removedOrderId: table.orders[idx].id }
    })

    res.json(result)
  } catch (e) {
    sendError(res, e)
  }
})

// ---------------------------------------------------------------------------
// DELETE /api/tables/:id/orders/:orderId — 注文削除（orderId ベース、R1 連番に対応）
// 旧 `:menuItemId` 路線は廃止（OrderEmbedded.id で一意化されたため）
// ---------------------------------------------------------------------------
tablesRouter.delete('/:id/orders/:orderId', async (req, res) => {
  try {
    const user = getAuthedUser(req)
    const tableId = String(req.params.id)
    const orderId = Number(req.params.orderId)
    if (!Number.isFinite(orderId)) throwBadRequest('orderId は数値')

    const result = await col().firestore.runTransaction(async (tx) => {
      const ref = col().doc(tableId)
      const snap = await tx.get(ref)
      if (!snap.exists) throwNotFound('卓が見つかりません')
      const table = snap.data() as Table
      const newOrders = table.orders.filter((o) => o.id !== orderId)
      if (newOrders.length === table.orders.length) {
        throwNotFound('注文が見つかりません')
      }
      tx.update(ref, {
        orders: newOrders,
        updatedBy: user.username,
        updatedAt: nowJstIso(),
      })
      return { ok: true, removedOrderId: orderId }
    })

    res.json(result)
  } catch (e) {
    sendError(res, e)
  }
})
