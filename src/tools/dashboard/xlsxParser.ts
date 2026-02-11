/**
 * XLSX/CSV Parser utility using SheetJS
 */

import * as XLSX from 'xlsx'
import type { DataSource, Column, ColumnType, Row } from './types.ts'

/** Supported file types */
export const SUPPORTED_FILE_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
  'text/plain',
  'application/csv',
]

/** Supported file extensions */
export const SUPPORTED_EXTENSIONS = ['.xlsx', '.xls', '.csv', '.txt']

/** Check if a file is supported */
export function isFileSupported(file: File): boolean {
  const extension = '.' + file.name.split('.').pop()?.toLowerCase()
  return (
    SUPPORTED_FILE_TYPES.includes(file.type) ||
    SUPPORTED_EXTENSIONS.includes(extension)
  )
}

/** Infer column type from sample values */
function inferColumnType(values: unknown[]): ColumnType {
  const samples = values.filter((v) => v != null && v !== '').slice(0, 100)
  if (samples.length === 0) return 'string'

  // Check for boolean
  const booleanValues = ['true', 'false', 'yes', 'no', '1', '0']
  const allBoolean = samples.every(
    (v) =>
      typeof v === 'boolean' ||
      booleanValues.includes(String(v).toLowerCase()),
  )
  if (allBoolean) return 'boolean'

  // Check for number
  const allNumbers = samples.every((v) => {
    if (typeof v === 'number') return !isNaN(v)
    const str = String(v).trim()
    const cleaned = str.replace(/[$,%\s]/g, '').replace(/,/g, '')
    return !isNaN(parseFloat(cleaned)) && isFinite(parseFloat(cleaned))
  })
  if (allNumbers) return 'number'

  // Check for date
  const datePatterns = [
    /^\d{4}-\d{2}-\d{2}/,
    /^\d{1,2}\/\d{1,2}\/\d{2,4}/,
    /^\d{1,2}-\d{1,2}-\d{2,4}/,
  ]
  const allDates = samples.every((v) => {
    if (v instanceof Date) return !isNaN(v.getTime())
    const str = String(v)
    if (datePatterns.some((p) => p.test(str))) {
      const d = new Date(str)
      return !isNaN(d.getTime())
    }
    return false
  })
  if (allDates) return 'date'

  return 'string'
}

/** Parse a value according to its column type */
function parseValue(value: unknown, type: ColumnType): unknown {
  if (value == null || value === '') return null

  switch (type) {
    case 'number': {
      if (typeof value === 'number') return value
      const str = String(value).trim().replace(/[$,%\s]/g, '').replace(/,/g, '')
      const num = parseFloat(str)
      return isNaN(num) ? null : num
    }
    case 'boolean': {
      if (typeof value === 'boolean') return value
      const str = String(value).toLowerCase()
      if (['true', 'yes', '1'].includes(str)) return true
      if (['false', 'no', '0'].includes(str)) return false
      return null
    }
    case 'date': {
      if (value instanceof Date) return value.toISOString()
      const d = new Date(String(value))
      return isNaN(d.getTime()) ? null : d.toISOString()
    }
    default:
      return String(value)
  }
}

/** Parse a file and return a DataSource */
export async function parseFile(file: File): Promise<DataSource> {
  const buffer = await file.arrayBuffer()
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true })

  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rawData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false,
  })

  if (rawData.length === 0) {
    throw new Error('File contains no data')
  }

  const columnNames = Object.keys(rawData[0])

  const columns: Column[] = columnNames.map((name, index) => {
    const values = rawData.map((row) => row[name])
    const type = inferColumnType(values)

    return {
      id: `col_${index}_${name.replace(/\W/g, '_').toLowerCase()}`,
      name,
      type,
      isComputed: false,
      sourceIndex: index,
    }
  })

  const rows: Row[] = rawData.map((rawRow) => {
    const row: Row = {}
    columns.forEach((col) => {
      row[col.id] = parseValue(rawRow[col.name], col.type)
    })
    return row
  })

  const name = file.name.replace(/\.[^.]+$/, '')

  const dataSource: DataSource = {
    id: crypto.randomUUID(),
    name,
    fileName: file.name,
    columns,
    rows,
    rowCount: rows.length,
    createdAt: new Date().toISOString(),
  }

  return dataSource
}

/** Parse multiple files */
export async function parseFiles(files: File[]): Promise<DataSource[]> {
  const results: DataSource[] = []

  for (const file of files) {
    if (isFileSupported(file)) {
      const dataSource = await parseFile(file)
      results.push(dataSource)
    }
  }

  return results
}

/** Get column statistics for a numeric column */
export function getColumnStats(
  rows: Row[],
  columnId: string,
): { min: number; max: number; sum: number; avg: number; count: number } | null {
  const values = rows
    .map((r) => r[columnId])
    .filter((v): v is number => typeof v === 'number' && !isNaN(v))

  if (values.length === 0) return null

  const sum = values.reduce((a, b) => a + b, 0)
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    sum,
    avg: sum / values.length,
    count: values.length,
  }
}

/** Get unique values for a column (for filters) */
export function getUniqueValues(rows: Row[], columnId: string, limit = 100): unknown[] {
  const seen = new Set<string>()
  const result: unknown[] = []

  for (const row of rows) {
    if (result.length >= limit) break
    const value = row[columnId]
    const key = JSON.stringify(value)
    if (!seen.has(key)) {
      seen.add(key)
      result.push(value)
    }
  }

  return result.sort((a, b) => {
    if (a == null) return 1
    if (b == null) return -1
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return String(a).localeCompare(String(b))
  })
}

/** Export data to CSV string */
export function exportToCSV(columns: Column[], rows: Row[]): string {
  const headers = columns.map((c) => c.name).join(',')
  const dataRows = rows.map((row) =>
    columns
      .map((col) => {
        const value = row[col.id]
        if (value == null) return ''
        const str = String(value)
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`
        }
        return str
      })
      .join(','),
  )
  return [headers, ...dataRows].join('\n')
}
