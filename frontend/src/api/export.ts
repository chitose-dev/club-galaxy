// CSV エクスポートは fetch を直接呼んで Blob で受け取る。
// `api.get()` ヘルパーは JSON 前提のため使わない。

import { resolveApiBase } from './apiBase'

function getToken(): string | null {
  return localStorage.getItem('authToken')
}

async function fetchCsv(path: string): Promise<Blob> {
  const token = getToken()
  const res = await fetch(`${resolveApiBase()}${path}`, {
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`CSV export GET ${path} → ${res.status}: ${text}`)
  }
  return res.blob()
}

export const exportApi = {
  payrollCsv: (from: string, to: string) => {
    const q = new URLSearchParams({ from, to }).toString()
    return fetchCsv(`/api/export/payroll-csv?${q}`)
  },
  castLedger: (castId: number, month: string) => {
    const q = new URLSearchParams({ month }).toString()
    return fetchCsv(`/api/export/cast-ledger/${castId}?${q}`)
  },
}

/** Blob をダウンロード（ブラウザで保存ダイアログ）。 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
