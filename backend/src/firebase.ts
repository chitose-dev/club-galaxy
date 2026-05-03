import { initializeApp, cert, type ServiceAccount } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

const serviceAccount = process.env.FIREBASE_SERVICE_ACCOUNT
  ? JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT) as ServiceAccount
  : undefined

const app = serviceAccount
  ? initializeApp({ credential: cert(serviceAccount) })
  : initializeApp()

export const db = getFirestore(app)
export const STORE_ID = 'default'

/** Helper: get a subcollection under the store doc */
export function storeCollection(name: string) {
  return db.collection('stores').doc(STORE_ID).collection(name)
}

/** Helper: get the store doc itself (for settings) */
export function storeDoc() {
  return db.collection('stores').doc(STORE_ID)
}
