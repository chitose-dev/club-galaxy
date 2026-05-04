/**
 * ワンショット: Firestore 上のダミーアカウント（cast1 / cast2 / staff）を soft-delete する。
 *
 * 実行方法（必ず --dry-run で確認 → --apply で実行）:
 *   npx tsx scripts/delete-dummy-users.ts --dry-run
 *   FIREBASE_SERVICE_ACCOUNT=... npx tsx scripts/delete-dummy-users.ts --apply
 *
 * 認証:
 *   - FIREBASE_SERVICE_ACCOUNT 環境変数 (JSON 文字列) があればそれを使用
 *   - なければ ADC (`gcloud auth application-default login`) を使用
 *
 * 動作:
 *   - 対象 username: cast1 / cast2 / staff
 *   - 既に deletedAt がセットされていれば skip
 *   - role が owner のドキュメントは安全のため強制 skip（誤指定時のフェイルセーフ）
 */
import { storeCollection } from '../src/firebase'
import { nowJstIso } from '../src/lib/businessDate'

const TARGET_USERNAMES = ['cast1', 'cast2', 'staff'] as const
const PERFORMER = 'cleanup-script-2026-05-04'

async function main() {
  const args = new Set(process.argv.slice(2))
  const apply = args.has('--apply')
  const dryRun = args.has('--dry-run') || !apply

  console.log(`[delete-dummy-users] mode=${dryRun ? 'DRY-RUN' : 'APPLY'}`)
  console.log(`[delete-dummy-users] targets=${TARGET_USERNAMES.join(', ')}`)
  console.log(`[delete-dummy-users] performer=${PERFORMER}`)

  const col = storeCollection('userAccounts')
  const now = nowJstIso()

  let willUpdate = 0
  let skippedNotFound = 0
  let skippedAlreadyDeleted = 0
  let skippedOwner = 0

  for (const username of TARGET_USERNAMES) {
    const ref = col.doc(username)
    const snap = await ref.get()
    if (!snap.exists) {
      console.log(`  - ${username}: NOT FOUND (skip)`)
      skippedNotFound++
      continue
    }
    const data = snap.data() as { role?: string; deletedAt?: string; displayName?: string }
    if (data.role === 'owner') {
      console.log(`  - ${username}: role=owner — refusing to delete (skip)`)
      skippedOwner++
      continue
    }
    if (data.deletedAt) {
      console.log(`  - ${username}: already deleted at ${data.deletedAt} (skip)`)
      skippedAlreadyDeleted++
      continue
    }
    console.log(
      `  - ${username}: role=${data.role} displayName=${data.displayName} → soft-delete${dryRun ? ' (DRY-RUN)' : ''}`,
    )
    if (apply) {
      await ref.update({ deletedAt: now, deletedBy: PERFORMER })
    }
    willUpdate++
  }

  console.log(
    `[delete-dummy-users] summary: ${apply ? 'updated' : 'will-update'}=${willUpdate} skippedNotFound=${skippedNotFound} skippedAlreadyDeleted=${skippedAlreadyDeleted} skippedOwner=${skippedOwner}`,
  )
  if (dryRun) {
    console.log('[delete-dummy-users] DRY-RUN — re-run with --apply to actually update Firestore.')
  }
}

main().catch((e) => {
  console.error('[delete-dummy-users] FAILED:', e)
  process.exit(1)
})
