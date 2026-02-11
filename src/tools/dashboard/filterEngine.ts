/**
 * Filter Engine — Evaluates AND/OR filter conditions on data rows
 */

import type {
  Row,
  Column,
  FilterCondition,
  FilterGroup,
  FilterOperator,
} from './types.ts'

/**
 * Get the value from a row for a given column
 */
function getColumnValue(row: Row, columns: Column[], columnId: string): unknown {
  if (columnId in row) {
    return row[columnId]
  }

  const column = columns.find((c) => c.name === columnId || c.id === columnId)
  if (column) {
    return row[column.id]
  }

  return undefined
}

/**
 * Convert value to string for comparison
 */
function toString(value: unknown): string {
  if (value == null) return ''
  return String(value)
}

/**
 * Convert value to number for comparison
 */
function toNumber(value: unknown): number {
  if (value == null) return NaN
  if (typeof value === 'number') return value
  const str = String(value).replace(/[,$%\s]/g, '')
  return parseFloat(str)
}

/**
 * Check if a value is empty (null, undefined, empty string)
 */
function isEmpty(value: unknown): boolean {
  return value == null || value === '' || (typeof value === 'string' && value.trim() === '')
}

/**
 * Evaluate a single filter condition against a row
 */
export function evaluateCondition(
  condition: FilterCondition,
  row: Row,
  columns: Column[],
): boolean {
  const rowValue = getColumnValue(row, columns, condition.column)
  const targetValue = condition.value
  const targetValues = condition.values ?? []

  switch (condition.operator) {
    case '=':
      if (isEmpty(rowValue) && isEmpty(targetValue)) return true
      if (typeof rowValue === 'number' || typeof targetValue === 'number') {
        return toNumber(rowValue) === toNumber(targetValue)
      }
      return toString(rowValue).toLowerCase() === toString(targetValue).toLowerCase()

    case '!=':
      if (isEmpty(rowValue) && isEmpty(targetValue)) return false
      if (typeof rowValue === 'number' || typeof targetValue === 'number') {
        return toNumber(rowValue) !== toNumber(targetValue)
      }
      return toString(rowValue).toLowerCase() !== toString(targetValue).toLowerCase()

    case '>':
      return toNumber(rowValue) > toNumber(targetValue)

    case '>=':
      return toNumber(rowValue) >= toNumber(targetValue)

    case '<':
      return toNumber(rowValue) < toNumber(targetValue)

    case '<=':
      return toNumber(rowValue) <= toNumber(targetValue)

    case 'contains':
      return toString(rowValue).toLowerCase().includes(toString(targetValue).toLowerCase())

    case 'not_contains':
      return !toString(rowValue).toLowerCase().includes(toString(targetValue).toLowerCase())

    case 'starts_with':
      return toString(rowValue).toLowerCase().startsWith(toString(targetValue).toLowerCase())

    case 'ends_with':
      return toString(rowValue).toLowerCase().endsWith(toString(targetValue).toLowerCase())

    case 'is_empty':
      return isEmpty(rowValue)

    case 'is_not_empty':
      return !isEmpty(rowValue)

    case 'in': {
      if (targetValues.length === 0) return true
      const rowStr = toString(rowValue).toLowerCase()
      return targetValues.some((v) => toString(v).toLowerCase() === rowStr)
    }

    case 'not_in': {
      if (targetValues.length === 0) return true
      const rowStr = toString(rowValue).toLowerCase()
      return !targetValues.some((v) => toString(v).toLowerCase() === rowStr)
    }

    default:
      return true
  }
}

/**
 * Evaluate a filter group (with nested AND/OR logic) against a row
 */
export function evaluateFilterGroup(
  group: FilterGroup,
  row: Row,
  columns: Column[],
): boolean {
  if (group.children.length === 0) {
    return true
  }

  const results = group.children.map((child) => {
    if (child.type === 'condition') {
      return evaluateCondition(child, row, columns)
    }
    return evaluateFilterGroup(child, row, columns)
  })

  if (group.logic === 'AND') {
    return results.every(Boolean)
  }
  return results.some(Boolean)
}

/**
 * Filter rows based on a filter group
 */
export function filterRows(
  rows: Row[],
  columns: Column[],
  filter: FilterGroup | null | undefined,
): Row[] {
  if (!filter || filter.children.length === 0) {
    return rows
  }
  return rows.filter((row) => evaluateFilterGroup(filter, row, columns))
}

/**
 * Count how many rows match a filter
 */
export function countMatchingRows(
  rows: Row[],
  columns: Column[],
  filter: FilterGroup | null | undefined,
): number {
  if (!filter || filter.children.length === 0) {
    return rows.length
  }
  return rows.filter((row) => evaluateFilterGroup(filter, row, columns)).length
}

/**
 * Get unique values from a column (for filter dropdowns)
 */
export function getColumnUniqueValues(
  rows: Row[],
  columns: Column[],
  columnId: string,
  limit = 100,
): unknown[] {
  const seen = new Set<string>()
  const values: unknown[] = []

  for (const row of rows) {
    if (values.length >= limit) break

    const value = getColumnValue(row, columns, columnId)
    const key = JSON.stringify(value)

    if (!seen.has(key)) {
      seen.add(key)
      values.push(value)
    }
  }

  return values.sort((a, b) => {
    if (a == null) return 1
    if (b == null) return -1
    if (typeof a === 'number' && typeof b === 'number') return a - b
    return toString(a).localeCompare(toString(b))
  })
}

/**
 * Create an empty filter group
 */
export function createEmptyFilterGroup(): FilterGroup {
  return {
    id: crypto.randomUUID(),
    type: 'group',
    logic: 'AND',
    children: [],
  }
}

/**
 * Create a new filter condition
 */
export function createFilterCondition(
  column: string,
  operator: FilterOperator = '=',
  value: string | number | null = '',
): FilterCondition {
  return {
    id: crypto.randomUUID(),
    type: 'condition',
    column,
    operator,
    value,
  }
}

/**
 * Create a nested filter group
 */
export function createNestedFilterGroup(logic: 'AND' | 'OR' = 'OR'): FilterGroup {
  return {
    id: crypto.randomUUID(),
    type: 'group',
    logic,
    children: [],
  }
}

/**
 * Add a condition to a filter group
 */
export function addConditionToGroup(
  group: FilterGroup,
  condition: FilterCondition,
): FilterGroup {
  return {
    ...group,
    children: [...group.children, condition],
  }
}

/**
 * Add a nested group to a filter group
 */
export function addGroupToGroup(
  parent: FilterGroup,
  child: FilterGroup,
): FilterGroup {
  return {
    ...parent,
    children: [...parent.children, child],
  }
}

/**
 * Remove a child from a filter group by ID
 */
export function removeFromGroup(group: FilterGroup, childId: string): FilterGroup {
  return {
    ...group,
    children: group.children.filter((child) => child.id !== childId),
  }
}

/**
 * Update a condition in a filter group (recursively searches)
 */
export function updateConditionInGroup(
  group: FilterGroup,
  conditionId: string,
  updates: Partial<FilterCondition>,
): FilterGroup {
  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === 'condition' && child.id === conditionId) {
        return { ...child, ...updates }
      }
      if (child.type === 'group') {
        return updateConditionInGroup(child, conditionId, updates)
      }
      return child
    }),
  }
}

/**
 * Update a group's logic in a filter tree
 */
export function updateGroupLogic(
  group: FilterGroup,
  groupId: string,
  logic: 'AND' | 'OR',
): FilterGroup {
  if (group.id === groupId) {
    return { ...group, logic }
  }

  return {
    ...group,
    children: group.children.map((child) => {
      if (child.type === 'group') {
        return updateGroupLogic(child, groupId, logic)
      }
      return child
    }),
  }
}

/**
 * Serialize a filter group to a human-readable string
 */
export function filterToString(
  filter: FilterGroup | FilterCondition,
  columns: Column[],
): string {
  if (filter.type === 'condition') {
    const cond = filter as FilterCondition
    const column = columns.find((c) => c.id === cond.column || c.name === cond.column)
    const colName = column?.name ?? cond.column

    switch (cond.operator) {
      case 'is_empty':
        return `${colName} is empty`
      case 'is_not_empty':
        return `${colName} is not empty`
      case 'in':
        return `${colName} is one of [${cond.values?.join(', ')}]`
      case 'not_in':
        return `${colName} is not one of [${cond.values?.join(', ')}]`
      case 'contains':
        return `${colName} contains "${cond.value}"`
      case 'not_contains':
        return `${colName} does not contain "${cond.value}"`
      case 'starts_with':
        return `${colName} starts with "${cond.value}"`
      case 'ends_with':
        return `${colName} ends with "${cond.value}"`
      default:
        return `${colName} ${cond.operator} ${cond.value}`
    }
  }

  const group = filter as FilterGroup
  if (group.children.length === 0) return '(no filters)'
  if (group.children.length === 1) return filterToString(group.children[0], columns)

  const childStrings = group.children.map((child) => filterToString(child, columns))
  return `(${childStrings.join(` ${group.logic} `)})`
}

/**
 * Deep clone a filter group
 */
export function cloneFilterGroup(group: FilterGroup): FilterGroup {
  return {
    id: crypto.randomUUID(),
    type: 'group',
    logic: group.logic,
    children: group.children.map((child) => {
      if (child.type === 'condition') {
        return { ...child, id: crypto.randomUUID() }
      }
      return cloneFilterGroup(child)
    }),
  }
}
