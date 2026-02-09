import type { FormDocument } from './types.ts'

const KEY_PREFIX = 'lwt-form-'
const INDEX_KEY = 'lwt-form-index'

// ── Index entry (stored separately for fast listing) ─────────

interface FormIndexEntry {
  id: string
  title: string
  pageCount: number
  elementCount: number
  updatedAt: number
}

// ── CRUD ─────────────────────────────────────────────────────

export function saveForm(doc: FormDocument): void {
  const json = JSON.stringify(doc)
  localStorage.setItem(KEY_PREFIX + doc.id, json)

  // Update index
  const index = listFormIndex()
  const existing = index.findIndex(e => e.id === doc.id)
  const entry: FormIndexEntry = {
    id: doc.id,
    title: doc.title,
    pageCount: doc.pageCount,
    elementCount: doc.elements.length,
    updatedAt: doc.updatedAt,
  }
  if (existing >= 0) {
    index[existing] = entry
  } else {
    index.push(entry)
  }
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

export function loadForm(id: string): FormDocument | null {
  const raw = localStorage.getItem(KEY_PREFIX + id)
  if (!raw) return null
  try {
    return JSON.parse(raw) as FormDocument
  } catch {
    return null
  }
}

export function deleteForm(id: string): void {
  localStorage.removeItem(KEY_PREFIX + id)
  const index = listFormIndex().filter(e => e.id !== id)
  localStorage.setItem(INDEX_KEY, JSON.stringify(index))
}

export function listFormIndex(): FormIndexEntry[] {
  const raw = localStorage.getItem(INDEX_KEY)
  if (!raw) return []
  try {
    const arr = JSON.parse(raw)
    if (!Array.isArray(arr)) return []
    return arr as FormIndexEntry[]
  } catch {
    return []
  }
}

export function listForms(): FormIndexEntry[] {
  return listFormIndex().sort((a, b) => b.updatedAt - a.updatedAt)
}

// ── Storage usage ───────────────────────────────────────────

export function getStorageUsage(): { usedBytes: number; formCount: number } {
  let usedBytes = 0
  let formCount = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(KEY_PREFIX)) {
      usedBytes += (localStorage.getItem(key) ?? '').length * 2 // UTF-16
      formCount++
    }
  }
  return { usedBytes, formCount }
}

export function isStorageNearLimit(): boolean {
  const { usedBytes } = getStorageUsage()
  return usedBytes > 4 * 1024 * 1024 // warn at 4MB
}
