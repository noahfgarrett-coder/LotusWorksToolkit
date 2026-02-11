/**
 * Formula Engine — PowerBI-like formula parser and evaluator
 *
 * Supported functions:
 * - Aggregations: SUM, AVG, COUNT, MIN, MAX, DISTINCT
 * - Conditional: IF, SWITCH, COALESCE
 * - Text: CONCATENATE, LEFT, RIGHT, MID, LEN, UPPER, LOWER, TRIM, REPLACE, SUBSTITUTE
 * - Math: ROUND, FLOOR, CEIL, ABS, POWER, SQRT, MOD, LOG, EXP
 * - Date: YEAR, MONTH, DAY, TODAY, NOW, DATEDIFF
 * - Type conversion: TEXT, VALUE, INT, FLOAT
 * - Logical: AND, OR, NOT, TRUE, FALSE
 * - Operators: +, -, *, /, %, ^, &, =, <>, <, >, <=, >=
 */

import type { Row, Column } from './types.ts'

const DEBUG_FORMULA = false

// ── Token types ─────────────────────────────────

type TokenType =
  | 'NUMBER'
  | 'STRING'
  | 'IDENTIFIER'
  | 'FUNCTION'
  | 'OPERATOR'
  | 'LPAREN'
  | 'RPAREN'
  | 'COMMA'
  | 'COLUMN_REF'
  | 'EOF'

interface Token {
  type: TokenType
  value: string | number
  position: number
}

// ── AST Node types ──────────────────────────────

type ASTNode =
  | NumberNode
  | StringNode
  | ColumnRefNode
  | BinaryOpNode
  | UnaryOpNode
  | FunctionCallNode
  | ConditionalNode

interface NumberNode { type: 'number'; value: number }
interface StringNode { type: 'string'; value: string }
interface ColumnRefNode { type: 'column_ref'; columnName: string }
interface BinaryOpNode { type: 'binary_op'; operator: string; left: ASTNode; right: ASTNode }
interface UnaryOpNode { type: 'unary_op'; operator: string; operand: ASTNode }
interface FunctionCallNode { type: 'function_call'; name: string; args: ASTNode[] }
interface ConditionalNode { type: 'conditional'; condition: ASTNode; trueValue: ASTNode; falseValue: ASTNode }

// ── Constants ───────────────────────────────────

const FUNCTIONS = new Set([
  'SUM', 'AVG', 'COUNT', 'MIN', 'MAX', 'DISTINCT',
  'IF', 'SWITCH', 'COALESCE',
  'CONCATENATE', 'CONCAT', 'LEFT', 'RIGHT', 'MID', 'LEN', 'UPPER', 'LOWER', 'TRIM', 'REPLACE', 'SUBSTITUTE',
  'ROUND', 'FLOOR', 'CEIL', 'CEILING', 'ABS', 'POWER', 'POW', 'SQRT', 'MOD', 'LOG', 'LOG10', 'EXP',
  'YEAR', 'MONTH', 'DAY', 'TODAY', 'NOW', 'DATEDIFF', 'DATEADD',
  'TEXT', 'VALUE', 'INT', 'FLOAT',
  'AND', 'OR', 'NOT', 'TRUE', 'FALSE',
])

const OPERATORS = new Set(['+', '-', '*', '/', '%', '^', '&', '=', '<>', '<', '>', '<=', '>='])

// ── Tokenizer ───────────────────────────────────

function tokenize(formula: string): Token[] {
  const tokens: Token[] = []
  let pos = 0

  while (pos < formula.length) {
    const char = formula[pos]

    // Skip whitespace
    if (/\s/.test(char)) { pos++; continue }

    // Number
    if (/[0-9]/.test(char) || (char === '.' && /[0-9]/.test(formula[pos + 1] ?? ''))) {
      let numStr = ''
      while (pos < formula.length && /[0-9.]/.test(formula[pos])) {
        numStr += formula[pos]
        pos++
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr), position: pos - numStr.length })
      continue
    }

    // String literal
    if (char === '"' || char === "'") {
      const quote = char
      pos++
      let str = ''
      while (pos < formula.length && formula[pos] !== quote) {
        if (formula[pos] === '\\' && pos + 1 < formula.length) {
          pos++
          str += formula[pos]
        } else {
          str += formula[pos]
        }
        pos++
      }
      pos++ // closing quote
      tokens.push({ type: 'STRING', value: str, position: pos - str.length - 2 })
      continue
    }

    // Column reference [Column Name]
    if (char === '[') {
      pos++
      let colName = ''
      while (pos < formula.length && formula[pos] !== ']') {
        colName += formula[pos]
        pos++
      }
      pos++ // closing bracket
      tokens.push({ type: 'COLUMN_REF', value: colName, position: pos - colName.length - 2 })
      continue
    }

    // Parentheses
    if (char === '(') { tokens.push({ type: 'LPAREN', value: '(', position: pos }); pos++; continue }
    if (char === ')') { tokens.push({ type: 'RPAREN', value: ')', position: pos }); pos++; continue }

    // Comma
    if (char === ',') { tokens.push({ type: 'COMMA', value: ',', position: pos }); pos++; continue }

    // Two-character operators
    if (pos + 1 < formula.length) {
      const twoChar = formula.slice(pos, pos + 2)
      if (['<>', '<=', '>='].includes(twoChar)) {
        tokens.push({ type: 'OPERATOR', value: twoChar, position: pos })
        pos += 2
        continue
      }
    }

    // Single-character operators
    if (OPERATORS.has(char)) {
      tokens.push({ type: 'OPERATOR', value: char, position: pos })
      pos++
      continue
    }

    // Identifier or function name
    if (/[a-zA-Z_]/.test(char)) {
      let ident = ''
      while (pos < formula.length && /[a-zA-Z0-9_]/.test(formula[pos])) {
        ident += formula[pos]
        pos++
      }
      const upper = ident.toUpperCase()
      if (FUNCTIONS.has(upper)) {
        tokens.push({ type: 'FUNCTION', value: upper, position: pos - ident.length })
      } else if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'NUMBER', value: upper === 'TRUE' ? 1 : 0, position: pos - ident.length })
      } else {
        tokens.push({ type: 'COLUMN_REF', value: ident, position: pos - ident.length })
      }
      continue
    }

    // Unknown character — skip
    pos++
  }

  tokens.push({ type: 'EOF', value: '', position: pos })
  return tokens
}

// ── Parser ──────────────────────────────────────

class Parser {
  private tokens: Token[]
  private pos = 0

  constructor(tokens: Token[]) {
    this.tokens = tokens
  }

  private current(): Token { return this.tokens[this.pos] }

  private advance(): Token {
    const token = this.current()
    this.pos++
    return token
  }

  private expect(type: TokenType): Token {
    const token = this.current()
    if (token.type !== type) {
      throw new Error(`Expected ${type} but got ${token.type} at position ${token.position}`)
    }
    return this.advance()
  }

  parse(): ASTNode { return this.parseExpression() }

  private parseExpression(): ASTNode { return this.parseOr() }

  private parseOr(): ASTNode {
    let left = this.parseAnd()
    while (this.current().type === 'FUNCTION' && this.current().value === 'OR') {
      this.advance()
      this.expect('LPAREN')
      const args: ASTNode[] = [left]
      args.push(this.parseExpression())
      while (this.current().type === 'COMMA') { this.advance(); args.push(this.parseExpression()) }
      this.expect('RPAREN')
      left = { type: 'function_call', name: 'OR', args }
    }
    return left
  }

  private parseAnd(): ASTNode {
    let left = this.parseComparison()
    while (this.current().type === 'FUNCTION' && this.current().value === 'AND') {
      this.advance()
      this.expect('LPAREN')
      const args: ASTNode[] = [left]
      args.push(this.parseExpression())
      while (this.current().type === 'COMMA') { this.advance(); args.push(this.parseExpression()) }
      this.expect('RPAREN')
      left = { type: 'function_call', name: 'AND', args }
    }
    return left
  }

  private parseComparison(): ASTNode {
    let left = this.parseAddSub()
    while (
      this.current().type === 'OPERATOR' &&
      ['=', '<>', '<', '>', '<=', '>='].includes(this.current().value as string)
    ) {
      const op = this.advance().value as string
      const right = this.parseAddSub()
      left = { type: 'binary_op', operator: op, left, right }
    }
    return left
  }

  private parseAddSub(): ASTNode {
    let left = this.parseMulDiv()
    while (
      this.current().type === 'OPERATOR' &&
      ['+', '-', '&'].includes(this.current().value as string)
    ) {
      const op = this.advance().value as string
      const right = this.parseMulDiv()
      left = { type: 'binary_op', operator: op, left, right }
    }
    return left
  }

  private parseMulDiv(): ASTNode {
    let left = this.parsePower()
    while (
      this.current().type === 'OPERATOR' &&
      ['*', '/', '%'].includes(this.current().value as string)
    ) {
      const op = this.advance().value as string
      const right = this.parsePower()
      left = { type: 'binary_op', operator: op, left, right }
    }
    return left
  }

  private parsePower(): ASTNode {
    let left = this.parseUnary()
    while (this.current().type === 'OPERATOR' && this.current().value === '^') {
      this.advance()
      const right = this.parseUnary()
      left = { type: 'binary_op', operator: '^', left, right }
    }
    return left
  }

  private parseUnary(): ASTNode {
    if (this.current().type === 'OPERATOR' && this.current().value === '-') {
      this.advance()
      const operand = this.parseUnary()
      return { type: 'unary_op', operator: '-', operand }
    }
    if (this.current().type === 'FUNCTION' && this.current().value === 'NOT') {
      this.advance()
      this.expect('LPAREN')
      const operand = this.parseExpression()
      this.expect('RPAREN')
      return { type: 'unary_op', operator: 'NOT', operand }
    }
    return this.parsePrimary()
  }

  private parsePrimary(): ASTNode {
    const token = this.current()

    if (token.type === 'NUMBER') {
      this.advance()
      return { type: 'number', value: token.value as number }
    }

    if (token.type === 'STRING') {
      this.advance()
      return { type: 'string', value: token.value as string }
    }

    if (token.type === 'COLUMN_REF') {
      this.advance()
      return { type: 'column_ref', columnName: token.value as string }
    }

    if (token.type === 'FUNCTION') {
      const funcName = this.advance().value as string

      // Special handling for IF
      if (funcName === 'IF') {
        this.expect('LPAREN')
        const condition = this.parseExpression()
        this.expect('COMMA')
        const trueValue = this.parseExpression()
        this.expect('COMMA')
        const falseValue = this.parseExpression()
        this.expect('RPAREN')
        return { type: 'conditional', condition, trueValue, falseValue }
      }

      // Regular function call
      this.expect('LPAREN')
      const args: ASTNode[] = []
      if (this.current().type !== 'RPAREN') {
        args.push(this.parseExpression())
        while (this.current().type === 'COMMA') { this.advance(); args.push(this.parseExpression()) }
      }
      this.expect('RPAREN')
      return { type: 'function_call', name: funcName, args }
    }

    if (token.type === 'LPAREN') {
      this.advance()
      const expr = this.parseExpression()
      this.expect('RPAREN')
      return expr
    }

    throw new Error(`Unexpected token ${token.type} at position ${token.position}`)
  }
}

// ── Evaluation Context ──────────────────────────

interface EvalContext {
  row: Row
  columns: Column[]
  allRows?: Row[]
}

function getColumnId(columns: Column[], name: string): string | null {
  const col = columns.find((c) => c.name === name || c.id === name)
  if (col) return col.id

  const lowerName = name.toLowerCase()
  const colLower = columns.find(
    (c) => c.name.toLowerCase() === lowerName || c.id.toLowerCase() === lowerName,
  )
  return colLower?.id ?? null
}

// ── Evaluator ───────────────────────────────────

function evaluate(node: ASTNode, ctx: EvalContext): unknown {
  switch (node.type) {
    case 'number':
      return node.value

    case 'string':
      return node.value

    case 'column_ref': {
      const colId = getColumnId(ctx.columns, node.columnName)
      if (!colId) throw new Error(`Unknown column: ${node.columnName}`)
      return ctx.row[colId]
    }

    case 'binary_op': {
      const left = evaluate(node.left, ctx)
      const right = evaluate(node.right, ctx)

      switch (node.operator) {
        case '+': return toNumber(left) + toNumber(right)
        case '-': return toNumber(left) - toNumber(right)
        case '*': return toNumber(left) * toNumber(right)
        case '/': return toNumber(left) / toNumber(right)
        case '%': return toNumber(left) % toNumber(right)
        case '^': return Math.pow(toNumber(left), toNumber(right))
        case '&': return String(left ?? '') + String(right ?? '')
        case '=': return left === right ? 1 : 0
        case '<>': return left !== right ? 1 : 0
        case '<': return toNumber(left) < toNumber(right) ? 1 : 0
        case '>': return toNumber(left) > toNumber(right) ? 1 : 0
        case '<=': return toNumber(left) <= toNumber(right) ? 1 : 0
        case '>=': return toNumber(left) >= toNumber(right) ? 1 : 0
        default: throw new Error(`Unknown operator: ${node.operator}`)
      }
    }

    case 'unary_op': {
      const operand = evaluate(node.operand, ctx)
      switch (node.operator) {
        case '-': return -toNumber(operand)
        case 'NOT': return toBool(operand) ? 0 : 1
        default: throw new Error(`Unknown unary operator: ${node.operator}`)
      }
    }

    case 'conditional': {
      const condition = toBool(evaluate(node.condition, ctx))
      return condition ? evaluate(node.trueValue, ctx) : evaluate(node.falseValue, ctx)
    }

    case 'function_call':
      return evaluateFunction(node.name, node.args, ctx)

    default:
      throw new Error(`Unknown node type: ${(node as ASTNode).type}`)
  }
}

// ── Built-in Functions ──────────────────────────

function evaluateFunction(name: string, args: ASTNode[], ctx: EvalContext): unknown {
  switch (name) {
    // Aggregations
    case 'SUM': {
      if (!ctx.allRows) return evaluate(args[0], ctx)
      return ctx.allRows.reduce((sum, row) => sum + toNumber(evaluate(args[0], { ...ctx, row })), 0)
    }
    case 'AVG': {
      if (!ctx.allRows) return evaluate(args[0], ctx)
      const sum = ctx.allRows.reduce((s, row) => s + toNumber(evaluate(args[0], { ...ctx, row })), 0)
      return sum / ctx.allRows.length
    }
    case 'COUNT': {
      if (!ctx.allRows) return 1
      if (args.length === 0) return ctx.allRows.length
      return ctx.allRows.filter((row) => {
        const val = evaluate(args[0], { ...ctx, row })
        return val != null && val !== ''
      }).length
    }
    case 'MIN': {
      if (!ctx.allRows) return evaluate(args[0], ctx)
      return Math.min(...ctx.allRows.map((row) => toNumber(evaluate(args[0], { ...ctx, row }))))
    }
    case 'MAX': {
      if (!ctx.allRows) return evaluate(args[0], ctx)
      return Math.max(...ctx.allRows.map((row) => toNumber(evaluate(args[0], { ...ctx, row }))))
    }
    case 'DISTINCT': {
      if (!ctx.allRows) return 1
      const values = new Set(ctx.allRows.map((row) => String(evaluate(args[0], { ...ctx, row }))))
      return values.size
    }

    // Conditional
    case 'COALESCE': {
      for (const arg of args) {
        const val = evaluate(arg, ctx)
        if (val != null && val !== '') return val
      }
      return null
    }
    case 'SWITCH': {
      const value = evaluate(args[0], ctx)
      for (let i = 1; i < args.length - 1; i += 2) {
        const caseVal = evaluate(args[i], ctx)
        if (value === caseVal) return evaluate(args[i + 1], ctx)
      }
      if (args.length % 2 === 0) return evaluate(args[args.length - 1], ctx)
      return null
    }

    // Text functions
    case 'CONCATENATE':
    case 'CONCAT':
      return args.map((arg) => String(evaluate(arg, ctx) ?? '')).join('')
    case 'LEFT': {
      const str = String(evaluate(args[0], ctx) ?? '')
      return str.slice(0, toNumber(evaluate(args[1], ctx)))
    }
    case 'RIGHT': {
      const str = String(evaluate(args[0], ctx) ?? '')
      return str.slice(-toNumber(evaluate(args[1], ctx)))
    }
    case 'MID': {
      const str = String(evaluate(args[0], ctx) ?? '')
      const start = toNumber(evaluate(args[1], ctx)) - 1
      const count = toNumber(evaluate(args[2], ctx))
      return str.slice(start, start + count)
    }
    case 'LEN':
      return String(evaluate(args[0], ctx) ?? '').length
    case 'UPPER':
      return String(evaluate(args[0], ctx) ?? '').toUpperCase()
    case 'LOWER':
      return String(evaluate(args[0], ctx) ?? '').toLowerCase()
    case 'TRIM':
      return String(evaluate(args[0], ctx) ?? '').trim()
    case 'REPLACE': {
      const str = String(evaluate(args[0], ctx) ?? '')
      const start = toNumber(evaluate(args[1], ctx)) - 1
      const count = toNumber(evaluate(args[2], ctx))
      const replacement = String(evaluate(args[3], ctx) ?? '')
      return str.slice(0, start) + replacement + str.slice(start + count)
    }
    case 'SUBSTITUTE': {
      const str = String(evaluate(args[0], ctx) ?? '')
      const find = String(evaluate(args[1], ctx) ?? '')
      const replacement = String(evaluate(args[2], ctx) ?? '')
      return str.split(find).join(replacement)
    }

    // Math functions
    case 'ROUND': {
      const num = toNumber(evaluate(args[0], ctx))
      const decimals = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 0
      const factor = Math.pow(10, decimals)
      return Math.round(num * factor) / factor
    }
    case 'FLOOR': {
      const num = toNumber(evaluate(args[0], ctx))
      const decimals = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 0
      const factor = Math.pow(10, decimals)
      return Math.floor(num * factor) / factor
    }
    case 'CEIL':
    case 'CEILING': {
      const num = toNumber(evaluate(args[0], ctx))
      const decimals = args.length > 1 ? toNumber(evaluate(args[1], ctx)) : 0
      const factor = Math.pow(10, decimals)
      return Math.ceil(num * factor) / factor
    }
    case 'ABS': return Math.abs(toNumber(evaluate(args[0], ctx)))
    case 'POWER':
    case 'POW': return Math.pow(toNumber(evaluate(args[0], ctx)), toNumber(evaluate(args[1], ctx)))
    case 'SQRT': return Math.sqrt(toNumber(evaluate(args[0], ctx)))
    case 'MOD': return toNumber(evaluate(args[0], ctx)) % toNumber(evaluate(args[1], ctx))
    case 'LOG': return Math.log(toNumber(evaluate(args[0], ctx)))
    case 'LOG10': return Math.log10(toNumber(evaluate(args[0], ctx)))
    case 'EXP': return Math.exp(toNumber(evaluate(args[0], ctx)))

    // Date functions
    case 'YEAR': { const d = toDate(evaluate(args[0], ctx)); return d ? d.getFullYear() : null }
    case 'MONTH': { const d = toDate(evaluate(args[0], ctx)); return d ? d.getMonth() + 1 : null }
    case 'DAY': { const d = toDate(evaluate(args[0], ctx)); return d ? d.getDate() : null }
    case 'TODAY': return new Date().toISOString().split('T')[0]
    case 'NOW': return new Date().toISOString()
    case 'DATEDIFF': {
      const d1 = toDate(evaluate(args[0], ctx))
      const d2 = toDate(evaluate(args[1], ctx))
      if (!d1 || !d2) return null
      return Math.floor((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24))
    }

    // Type conversion
    case 'TEXT': return String(evaluate(args[0], ctx) ?? '')
    case 'VALUE':
    case 'FLOAT': return toNumber(evaluate(args[0], ctx))
    case 'INT': return Math.floor(toNumber(evaluate(args[0], ctx)))

    // Logical
    case 'AND': return args.every((arg) => toBool(evaluate(arg, ctx))) ? 1 : 0
    case 'OR': return args.some((arg) => toBool(evaluate(arg, ctx))) ? 1 : 0
    case 'TRUE': return 1
    case 'FALSE': return 0

    default:
      throw new Error(`Unknown function: ${name}`)
  }
}

// ── Type Conversion Helpers ─────────────────────

function toNumber(val: unknown): number {
  if (val == null) return 0
  if (typeof val === 'number') return isNaN(val) ? 0 : val
  if (typeof val === 'boolean') return val ? 1 : 0
  const num = parseFloat(String(val).replace(/[,$%]/g, ''))
  return isNaN(num) ? 0 : num
}

function toBool(val: unknown): boolean {
  if (val == null) return false
  if (typeof val === 'boolean') return val
  if (typeof val === 'number') return val !== 0
  if (typeof val === 'string') {
    const lower = val.toLowerCase()
    return lower !== '' && lower !== 'false' && lower !== '0' && lower !== 'no'
  }
  return Boolean(val)
}

function toDate(val: unknown): Date | null {
  if (val == null) return null
  if (val instanceof Date) return val
  const date = new Date(String(val))
  return isNaN(date.getTime()) ? null : date
}

// ── Public API ──────────────────────────────────

/** Parse and compile a formula */
export function compileFormula(formula: string): { ast: ASTNode; error?: string } {
  try {
    const tokens = tokenize(formula)
    const parser = new Parser(tokens)
    const ast = parser.parse()
    return { ast }
  } catch (error) {
    return { ast: { type: 'number', value: 0 }, error: (error as Error).message }
  }
}

/** Evaluate a compiled formula for a single row */
export function evaluateFormula(
  ast: ASTNode,
  row: Row,
  columns: Column[],
  allRows?: Row[],
): unknown {
  try {
    return evaluate(ast, { row, columns, allRows })
  } catch (error) {
    if (DEBUG_FORMULA) console.error('[formula] evaluation error:', error)
    return null
  }
}

/** Evaluate a formula string for a single row */
export function evaluateFormulaString(
  formula: string,
  row: Row,
  columns: Column[],
  allRows?: Row[],
): unknown {
  const { ast, error } = compileFormula(formula)
  if (error) {
    if (DEBUG_FORMULA) console.error('[formula] compilation error:', error)
    return null
  }
  return evaluateFormula(ast, row, columns, allRows)
}

/** Evaluate a formula for all rows and return computed values */
export function computeColumn(
  formula: string,
  rows: Row[],
  columns: Column[],
): { values: unknown[]; error?: string } {
  const { ast, error } = compileFormula(formula)
  if (error) {
    return { values: rows.map(() => null), error }
  }
  const values = rows.map((row) => evaluateFormula(ast, row, columns, rows))
  return { values }
}

/** Validate a formula without evaluating it */
export function validateFormula(
  formula: string,
  columns: Column[],
): { valid: boolean; error?: string } {
  try {
    const tokens = tokenize(formula)
    const parser = new Parser(tokens)
    const ast = parser.parse()

    const checkNode = (node: ASTNode): void => {
      switch (node.type) {
        case 'column_ref':
          if (!getColumnId(columns, node.columnName)) {
            throw new Error(`Unknown column: ${node.columnName}`)
          }
          break
        case 'binary_op':
          checkNode(node.left)
          checkNode(node.right)
          break
        case 'unary_op':
          checkNode(node.operand)
          break
        case 'function_call':
          node.args.forEach(checkNode)
          break
        case 'conditional':
          checkNode(node.condition)
          checkNode(node.trueValue)
          checkNode(node.falseValue)
          break
      }
    }

    checkNode(ast)
    return { valid: true }
  } catch (error) {
    return { valid: false, error: (error as Error).message }
  }
}

/** Get suggested column type for a formula result */
export function inferFormulaType(
  formula: string,
  columns: Column[],
  sampleRows: Row[],
): 'string' | 'number' | 'date' | 'boolean' {
  if (sampleRows.length === 0) return 'string'

  const { ast, error } = compileFormula(formula)
  if (error) return 'string'

  const sampleValues = sampleRows.slice(0, 10).map((row) => {
    try {
      return evaluateFormula(ast, row, columns)
    } catch {
      return null
    }
  })

  const nonNullValues = sampleValues.filter((v) => v != null)
  if (nonNullValues.length === 0) return 'string'

  if (nonNullValues.every((v) => typeof v === 'number')) return 'number'
  if (nonNullValues.every((v) => v === 0 || v === 1)) return 'boolean'
  if (nonNullValues.every((v) => {
    if (typeof v !== 'string') return false
    return !isNaN(new Date(v).getTime())
  })) return 'date'

  return 'string'
}
