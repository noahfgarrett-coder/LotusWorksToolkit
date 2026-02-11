/**
 * useFileHandle — File System Access API hook.
 * Provides persistent file handles for auto-reconnecting to data files.
 * Uses IndexedDB (lwt-dashboard-files) for handle storage.
 */

import { useState, useCallback, useEffect } from 'react'

// ── File System Access API types ────────────────

interface FileSystemHandle {
  kind: 'file' | 'directory'
  name: string
  queryPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied' | 'prompt'>
  requestPermission(options?: { mode?: 'read' | 'readwrite' }): Promise<'granted' | 'denied'>
}

interface FileSystemFileHandle extends FileSystemHandle {
  kind: 'file'
  getFile(): Promise<File>
}

// ── Capabilities ────────────────────────────────

export function isFileSystemAccessSupported(): boolean {
  return 'showOpenFilePicker' in window
}

// ── IndexedDB helpers ───────────────────────────

const DB_NAME = 'lwt-dashboard-files'
const STORE_NAME = 'file-handles'
const DB_VERSION = 1

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' })
      }
    }
  })
}

export async function storeFileHandle(id: string, handle: FileSystemFileHandle, metadata: {
  name: string
  type: string
  lastModified: number
}): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.put({ id, handle, metadata, storedAt: new Date().toISOString() })
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getFileHandle(id: string): Promise<{
  handle: FileSystemFileHandle
  metadata: { name: string; type: string; lastModified: number }
} | null> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.get(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      if (request.result) {
        resolve({ handle: request.result.handle, metadata: request.result.metadata })
      } else {
        resolve(null)
      }
    }
  })
}

export async function removeFileHandle(id: string): Promise<void> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readwrite')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.delete(id)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getAllFileHandles(): Promise<Array<{
  id: string
  handle: FileSystemFileHandle
  metadata: { name: string; type: string; lastModified: number }
}>> {
  const db = await openDatabase()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, 'readonly')
    const store = transaction.objectStore(STORE_NAME)
    const request = store.getAll()
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      resolve(request.result.map((item: {
        id: string
        handle: FileSystemFileHandle
        metadata: { name: string; type: string; lastModified: number }
      }) => ({ id: item.id, handle: item.handle, metadata: item.metadata })))
    }
  })
}

export async function requestFilePermission(handle: FileSystemFileHandle): Promise<boolean> {
  try {
    const permission = await handle.queryPermission({ mode: 'read' })
    if (permission === 'granted') return true
    const result = await handle.requestPermission({ mode: 'read' })
    return result === 'granted'
  } catch {
    return false
  }
}

export async function readFileFromHandle(handle: FileSystemFileHandle): Promise<File | null> {
  try {
    const hasPermission = await requestFilePermission(handle)
    if (!hasPermission) return null
    return await handle.getFile()
  } catch {
    return null
  }
}

// ── Hook ────────────────────────────────────────

interface UseFileHandleState {
  isSupported: boolean
  storedHandles: Array<{
    id: string
    name: string
    type: string
    needsPermission: boolean
  }>
  loading: boolean
  error: string | null
}

export interface UseFileHandleResult extends UseFileHandleState {
  storeHandle: (id: string, file: File, handle: FileSystemFileHandle) => Promise<void>
  requestPermission: (id: string) => Promise<File | null>
  removeHandle: (id: string) => Promise<void>
  refreshHandles: () => Promise<void>
  openFilePicker: () => Promise<{ file: File; handle: FileSystemFileHandle } | null>
}

export function useFileHandle(): UseFileHandleResult {
  const [state, setState] = useState<UseFileHandleState>({
    isSupported: isFileSystemAccessSupported(),
    storedHandles: [],
    loading: true,
    error: null,
  })

  const refreshHandles = useCallback(async () => {
    if (!isFileSystemAccessSupported()) {
      setState((prev) => ({ ...prev, loading: false }))
      return
    }

    try {
      const handles = await getAllFileHandles()

      const storedHandles = await Promise.all(
        handles.map(async ({ id, handle, metadata }) => {
          let needsPermission = true
          try {
            const permission = await handle.queryPermission({ mode: 'read' })
            needsPermission = permission !== 'granted'
          } catch {
            // Handle might be invalid
          }

          return { id, name: metadata.name, type: metadata.type, needsPermission }
        }),
      )

      setState((prev) => ({ ...prev, storedHandles, loading: false, error: null }))
    } catch {
      setState((prev) => ({ ...prev, loading: false, error: 'Failed to load stored file handles' }))
    }
  }, [])

  useEffect(() => {
    refreshHandles()
  }, [refreshHandles])

  const storeHandleCb = useCallback(async (id: string, file: File, handle: FileSystemFileHandle) => {
    await storeFileHandle(id, handle, {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
    })
    await refreshHandles()
  }, [refreshHandles])

  const requestPermissionCb = useCallback(async (id: string): Promise<File | null> => {
    const stored = await getFileHandle(id)
    if (!stored) return null
    const file = await readFileFromHandle(stored.handle)
    if (file) await refreshHandles()
    return file
  }, [refreshHandles])

  const removeHandleCb = useCallback(async (id: string) => {
    await removeFileHandle(id)
    await refreshHandles()
  }, [refreshHandles])

  const openFilePicker = useCallback(async (): Promise<{ file: File; handle: FileSystemFileHandle } | null> => {
    if (!isFileSystemAccessSupported()) return null

    try {
      // @ts-expect-error File System Access API not in standard types
      const [handle] = await window.showOpenFilePicker({
        types: [
          {
            description: 'Spreadsheet files',
            accept: {
              'text/csv': ['.csv'],
              'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
              'application/vnd.ms-excel': ['.xls'],
            },
          },
        ],
        multiple: false,
      })

      const file = await handle.getFile()
      return { file, handle }
    } catch {
      return null
    }
  }, [])

  return {
    ...state,
    storeHandle: storeHandleCb,
    requestPermission: requestPermissionCb,
    removeHandle: removeHandleCb,
    refreshHandles,
    openFilePicker,
  }
}
