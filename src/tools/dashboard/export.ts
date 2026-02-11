/**
 * Dashboard export utilities — PNG (html2canvas), JSON import/export, CSV data export.
 */

import { downloadBlob, downloadText } from '../../utils/download.ts'
import { exportToCSV } from './xlsxParser.ts'
import type { Column, Row, DashboardExport, Dashboard, Widget, DataSource } from './types.ts'

// ── PNG Export ──────────────────────────────────

/**
 * Capture the dashboard grid as a PNG image.
 * Uses html2canvas for high-fidelity rendering.
 */
export async function exportDashboardPNG(
  gridElement: HTMLElement,
  filename = 'dashboard.png',
): Promise<void> {
  const html2canvas = (await import('html2canvas')).default
  const canvas = await html2canvas(gridElement, {
    backgroundColor: '#0a0a14',
    scale: 2,
    useCORS: true,
    logging: false,
  })

  return new Promise<void>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          downloadBlob(blob, filename)
          resolve()
        } else {
          reject(new Error('Failed to create PNG blob'))
        }
        // Release memory
        canvas.width = 0
        canvas.height = 0
      },
      'image/png',
    )
  })
}

// ── JSON Export ─────────────────────────────────

/**
 * Build a DashboardExport object from the current dashboard state.
 * Does NOT include raw row data — only metadata for data sources.
 */
export function buildDashboardExport(
  dashboard: Dashboard,
  widgets: Widget[],
  dataSources: Map<string, DataSource>,
): DashboardExport {
  // Collect unique data source IDs from widgets
  const dsIds = new Set<string>()
  for (const w of widgets) {
    if (w.dataSourceId) dsIds.add(w.dataSourceId)
  }

  const dsMetaList = Array.from(dsIds)
    .map((dsId) => {
      const ds = dataSources.get(dsId)
      if (!ds) return null
      return {
        id: ds.id,
        name: ds.name,
        fileName: ds.fileName,
        columns: ds.columns.map((c) => ({ id: c.id, name: c.name, type: c.type })),
        rowCount: ds.rows.length,
      }
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)

  return {
    version: 1,
    dashboard,
    widgets,
    dataSourcesMeta: dsMetaList,
    exportedAt: new Date().toISOString(),
  }
}

/**
 * Export a dashboard as a JSON file.
 */
export function exportDashboardJSON(
  dashboard: Dashboard,
  widgets: Widget[],
  dataSources: Map<string, DataSource>,
  filename = 'dashboard.json',
): void {
  const exportData = buildDashboardExport(dashboard, widgets, dataSources)
  downloadText(JSON.stringify(exportData, null, 2), filename, 'application/json')
}

/**
 * Parse and validate a dashboard JSON import.
 * Returns the parsed data or throws on invalid format.
 */
export function parseDashboardJSON(json: string): {
  dashboard: Dashboard
  widgets: Widget[]
} {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    throw new Error('Invalid JSON: failed to parse')
  }

  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Invalid dashboard JSON: expected an object')
  }

  const obj = parsed as Record<string, unknown>
  if (!obj.dashboard || typeof obj.dashboard !== 'object') {
    throw new Error('Invalid dashboard JSON: missing dashboard field')
  }
  if (!Array.isArray(obj.widgets)) {
    throw new Error('Invalid dashboard JSON: missing widgets array')
  }

  return {
    dashboard: obj.dashboard as Dashboard,
    widgets: obj.widgets as Widget[],
  }
}

// ── CSV Data Export ─────────────────────────────

/**
 * Export the raw data from a data source as CSV.
 */
export function exportDataCSV(
  columns: Column[],
  rows: Row[],
  filename = 'data.csv',
): void {
  const csvContent = exportToCSV(columns, rows)
  downloadText(csvContent, filename, 'text/csv')
}
