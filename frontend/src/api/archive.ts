import { api } from './client'

export interface ArchivedRefSummary {
  collection: string
  documentId: string | number
  archivedAt: string
}

export const archiveApi = {
  archive: (beforeDate: string) =>
    api.post<{ archived: number; collections: Record<string, number> }>('/api/archive', {
      beforeDate,
    }),
  list: (collection?: string) => {
    const qs = collection ? `?collection=${encodeURIComponent(collection)}` : ''
    return api.get<ArchivedRefSummary[]>(`/api/archive${qs}`)
  },
}
