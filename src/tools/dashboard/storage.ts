/**
 * Dashboard localStorage persistence
 * Key prefix: lwt-dashboard-
 * All operations wrapped in try-catch for Safari private browsing / quota exceeded.
 */

import type { Dashboard, Widget } from './types.ts'

const PREFIX = 'lwt-dashboard-'

// ── Dashboard list ─────────────────────────────

interface StoredDashboardEntry {
  dashboard: Dashboard
  widgets: Widget[]
}

function storageKey(dashboardId: string): string {
  return `${PREFIX}${dashboardId}`
}

const INDEX_KEY = `${PREFIX}index`

/** Get list of all saved dashboard IDs */
export function listDashboardIds(): string[] {
  try {
    const raw = localStorage.getItem(INDEX_KEY)
    if (!raw) return []
    return JSON.parse(raw) as string[]
  } catch {
    return []
  }
}

/** Update the dashboard index */
function setDashboardIndex(ids: string[]): void {
  try {
    localStorage.setItem(INDEX_KEY, JSON.stringify(ids))
  } catch {
    // quota exceeded or private browsing — silently fail
  }
}

/** Save a dashboard and its widgets */
export function saveDashboard(dashboard: Dashboard, widgets: Widget[]): void {
  try {
    const entry: StoredDashboardEntry = { dashboard, widgets }
    localStorage.setItem(storageKey(dashboard.id), JSON.stringify(entry))

    // Update index
    const ids = listDashboardIds()
    if (!ids.includes(dashboard.id)) {
      ids.push(dashboard.id)
      setDashboardIndex(ids)
    }
  } catch {
    // quota exceeded or private browsing
  }
}

/** Load a dashboard and its widgets */
export function loadDashboard(dashboardId: string): StoredDashboardEntry | null {
  try {
    const raw = localStorage.getItem(storageKey(dashboardId))
    if (!raw) return null
    return JSON.parse(raw) as StoredDashboardEntry
  } catch {
    return null
  }
}

/** Load all saved dashboards */
export function loadAllDashboards(): StoredDashboardEntry[] {
  const ids = listDashboardIds()
  const results: StoredDashboardEntry[] = []

  for (const id of ids) {
    const entry = loadDashboard(id)
    if (entry) results.push(entry)
  }

  return results
}

/** Delete a dashboard from storage */
export function deleteDashboard(dashboardId: string): void {
  try {
    localStorage.removeItem(storageKey(dashboardId))
    const ids = listDashboardIds().filter(id => id !== dashboardId)
    setDashboardIndex(ids)
  } catch {
    // ignore
  }
}

/** Clear all dashboard storage */
export function clearAllDashboards(): void {
  try {
    const ids = listDashboardIds()
    for (const id of ids) {
      localStorage.removeItem(storageKey(id))
    }
    localStorage.removeItem(INDEX_KEY)
  } catch {
    // ignore
  }
}
