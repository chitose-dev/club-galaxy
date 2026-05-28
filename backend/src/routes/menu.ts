import { Router } from 'express'
import { storeCollection } from '../firebase'
import { sendError } from '../lib/errors'

export const menuRouter = Router()

// Helper for simple collection CRUD (R9 反映: 全ハンドラ try/sendError 包囲)
function collectionCrud(path: string) {
  const router = Router()
  const col = () => storeCollection(path)

  router.get('/', async (_req, res) => {
    try {
      const snap = await col().orderBy('id').get()
      res.json(snap.docs.map((d) => d.data()))
    } catch (e) {
      sendError(res, e)
    }
  })

  router.put('/', async (req, res) => {
    try {
      const items: { id: string | number }[] = req.body
      const batch = col().firestore.batch()
      const existing = await col().get()
      existing.docs.forEach((d) => batch.delete(d.ref))
      items.forEach((item) => {
        batch.set(col().doc(String(item.id)), item)
      })
      await batch.commit()
      res.json(items)
    } catch (e) {
      sendError(res, e)
    }
  })

  return router
}

menuRouter.use('/categories', collectionCrud('menuCategories')) // M10: MenuCategory + allowsBottleKeep
menuRouter.use('/guest', collectionCrud('guestMenu'))
menuRouter.use('/cast', collectionCrud('castMenu'))
menuRouter.use('/set-prices', collectionCrud('setPrices'))
menuRouter.use('/charges', collectionCrud('chargeItems'))
