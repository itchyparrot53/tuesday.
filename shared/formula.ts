import {
  cellToText,
  formatDuration,
  type CellValue,
  type ColumnSettings,
  type ColumnType,
} from './columns';
import type { Column, Item } from './types';

export type FormulaValue = number | string | boolean | null;

export class FormulaError extends Error {
  constructor(
    message: string,
    public position = 0,
  ) {
    super(message);
    this.name = 'FormulaError';
  }
}

type Ast =
  | { type: 'num'; value: number }
  | { type: 'str'; value: string }
  | { type: 'bool'; value: boolean }
  | { type: 'ref'; title: string }
  | { type: 'binary'; op: string; left: Ast; right: Ast }
  | { type: 'unary'; op: string; operand: Ast }
  | { type: 'call'; name: string; args: Ast[] };

type Token =
  | { type: 'num'; value: number; pos: number }
  | { type: 'str'; value: string; pos: number }
  | { type: 'ref'; value: string; pos: number }
  | { type: 'id'; value: string; pos: number }
  | { type: 'op'; value: string; pos: number }
  | { type: 'eof'; pos: number };

function tokenize(src: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '{') {
      const end = src.indexOf('}', i + 1);
      if (end < 0) throw new FormulaError('Missing }', i);
      tokens.push({ type: 'ref', value: src.slice(i + 1, end).trim(), pos: i });
      i = end + 1;
      continue;
    }
    if (ch === '"') {
      let value = '';
      let j = i + 1;
      let closed = false;
      while (j < src.length) {
        if (src[j] === '\\' && j + 1 < src.length) {
          value += src[j + 1];
          j += 2;
          continue;
        }
        if (src[j] === '"') {
          closed = true;
          j++;
          break;
        }
        value += src[j++];
      }
      if (!closed) throw new FormulaError('Unterminated string', i);
      tokens.push({ type: 'str', value, pos: i });
      i = j;
      continue;
    }
    if (/\d/.test(ch) || (ch === '.' && /\d/.test(src[i + 1] ?? ''))) {
      const match = src.slice(i).match(/^\d+(\.\d+)?/);
      if (!match) throw new FormulaError('Invalid number', i);
      tokens.push({ type: 'num', value: Number(match[0]), pos: i });
      i += match[0].length;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const match = src.slice(i).match(/^[A-Za-z_][A-Za-z0-9_]*/);
      if (!match) throw new FormulaError('Invalid identifier', i);
      const upper = match[0].toUpperCase();
      if (upper === 'TRUE' || upper === 'FALSE') {
        tokens.push({ type: 'id', value: upper, pos: i });
      } else {
        tokens.push({ type: 'id', value: match[0], pos: i });
      }
      i += match[0].length;
      continue;
    }
    const two = src.slice(i, i + 2);
    if (['<=', '>=', '!=', '=='].includes(two)) {
      tokens.push({ type: 'op', value: two, pos: i });
      i += 2;
      continue;
    }
    if ('=<>+-*/%&(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch, pos: i });
      i++;
      continue;
    }
    throw new FormulaError(`Unexpected character "${ch}"`, i);
  }
  tokens.push({ type: 'eof', pos: src.length });
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private peekOp(): string | null {
    const token = this.peek();
    return token.type === 'op' ? token.value : null;
  }

  private nextOp(): string {
    const token = this.next();
    if (token.type !== 'op') throw new FormulaError('Expected an operator', token.pos);
    return token.value;
  }

  private expect(value: string): Token {
    const token = this.next();
    if (token.type !== 'op' || token.value !== value) {
      throw new FormulaError(`Expected "${value}"`, token.pos);
    }
    return token;
  }

  parse(): Ast {
    const ast = this.parseConcat();
    if (this.peek().type !== 'eof') throw new FormulaError('Unexpected token', this.peek().pos);
    return ast;
  }

  private parseConcat(): Ast {
    let left = this.parseCompare();
    while (this.peekOp() === '&') {
      this.next();
      left = { type: 'binary', op: '&', left, right: this.parseCompare() };
    }
    return left;
  }

  private parseCompare(): Ast {
    const left = this.parseAdditive();
    const token = this.peek();
    if (token.type === 'op' && ['=', '==', '!=', '<', '>', '<=', '>='].includes(token.value)) {
      this.next();
      return { type: 'binary', op: token.value, left, right: this.parseAdditive() };
    }
    return left;
  }

  private parseAdditive(): Ast {
    let left = this.parseTerm();
    while (['+', '-'].includes(this.peekOp() ?? '')) {
      const op = this.nextOp();
      left = { type: 'binary', op, left, right: this.parseTerm() };
    }
    return left;
  }

  private parseTerm(): Ast {
    let left = this.parseUnary();
    while (['*', '/', '%'].includes(this.peekOp() ?? '')) {
      const op = this.nextOp();
      left = { type: 'binary', op, left, right: this.parseUnary() };
    }
    return left;
  }

  private parseUnary(): Ast {
    if (this.peekOp() === '-') {
      this.next();
      return { type: 'unary', op: '-', operand: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Ast {
    if (++this.depth > 50) throw new FormulaError('Formula is too deeply nested');
    try {
      const token = this.next();
      if (token.type === 'num') return { type: 'num', value: token.value };
      if (token.type === 'str') return { type: 'str', value: token.value };
      if (token.type === 'ref') return { type: 'ref', title: token.value };
      if (token.type === 'id') {
        if (token.value === 'TRUE' || token.value === 'FALSE') {
          return { type: 'bool', value: token.value === 'TRUE' };
        }
        const next = this.peek();
        if (next.type !== 'op' || next.value !== '(') {
          throw new FormulaError(`Unknown name "${token.value}"`, token.pos);
        }
        this.next();
        const args: Ast[] = [];
        if (this.peekOp() !== ')') {
          for (;;) {
            args.push(this.parseConcat());
            if (this.peekOp() === ',') {
              this.next();
              continue;
            }
            break;
          }
        }
        this.expect(')');
        return { type: 'call', name: token.value.toUpperCase(), args };
      }
      if (token.type === 'op' && token.value === '(') {
        const expr = this.parseConcat();
        this.expect(')');
        return expr;
      }
      throw new FormulaError('Expected a value', token.pos);
    } finally {
      this.depth--;
    }
  }
}

export function parseFormula(src: string): Ast {
  if (src.length > 2000) throw new FormulaError('Formula is too long');
  return new Parser(tokenize(src)).parse();
}

export function columnRefs(ast: Ast): string[] {
  const refs = new Set<string>();
  const walk = (node: Ast) => {
    if (node.type === 'ref') refs.add(node.title);
    else if (node.type === 'binary') {
      walk(node.left);
      walk(node.right);
    } else if (node.type === 'unary') walk(node.operand);
    else if (node.type === 'call') node.args.forEach(walk);
  };
  walk(ast);
  return [...refs];
}

function asNumber(value: FormulaValue): number {
  if (value === null) return 0;
  if (typeof value === 'number') return value;
  if (typeof value === 'boolean') return value ? 1 : 0;
  const number = Number(value);
  if (!Number.isFinite(number)) throw new FormulaError('#TYPE');
  return number;
}

function asString(value: FormulaValue): string {
  if (value === null) return '';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  return String(value);
}

function truthy(value: FormulaValue): boolean {
  return Boolean(value);
}

export function evaluate(
  ast: Ast,
  ctx: { ref(title: string): FormulaValue; today: string },
): FormulaValue {
  if (ast.type === 'num' || ast.type === 'str' || ast.type === 'bool') return ast.value;
  if (ast.type === 'ref') return ctx.ref(ast.title);
  if (ast.type === 'unary') {
    const value = evaluate(ast.operand, ctx);
    return value === null ? null : -asNumber(value);
  }
  if (ast.type === 'binary') {
    if (ast.op === '&') {
      return asString(evaluate(ast.left, ctx)) + asString(evaluate(ast.right, ctx));
    }
    const left = evaluate(ast.left, ctx);
    const right = evaluate(ast.right, ctx);
    if (ast.op === '=' || ast.op === '==') return left === right;
    if (ast.op === '!=') return left !== right;
    if (ast.op === '<') return asNumber(left) < asNumber(right);
    if (ast.op === '>') return asNumber(left) > asNumber(right);
    if (ast.op === '<=') return asNumber(left) <= asNumber(right);
    if (ast.op === '>=') return asNumber(left) >= asNumber(right);
    if (left === null || right === null) return null;
    const a = asNumber(left);
    const b = asNumber(right);
    if (ast.op === '+') return a + b;
    if (ast.op === '-') return a - b;
    if (ast.op === '*') return a * b;
    if (ast.op === '/') {
      if (b === 0) throw new FormulaError('#DIV/0');
      return a / b;
    }
    if (ast.op === '%') {
      if (b === 0) throw new FormulaError('#DIV/0');
      return a % b;
    }
  }
  if (ast.type === 'call') {
    const values = ast.args.map((arg) => evaluate(arg, ctx));
    const name = ast.name;
    if (name === 'IF') {
      if (values.length < 2) throw new FormulaError('#TYPE');
      return truthy(values[0]) ? values[1] : (values[2] ?? null);
    }
    if (name === 'AND') return values.every(truthy);
    if (name === 'OR') return values.some(truthy);
    if (name === 'NOT') return !truthy(values[0] ?? null);
    if (name === 'SUM') return values.reduce<number>((sum, value) => sum + asNumber(value), 0);
    if (name === 'AVERAGE') {
      const numbers = values.map(asNumber);
      return numbers.length ? numbers.reduce((a, b) => a + b, 0) / numbers.length : null;
    }
    if (name === 'MIN') {
      const numbers = values.map(asNumber);
      return numbers.length ? Math.min(...numbers) : null;
    }
    if (name === 'MAX') {
      const numbers = values.map(asNumber);
      return numbers.length ? Math.max(...numbers) : null;
    }
    if (name === 'ROUND') {
      const digits = values[1] === undefined ? 0 : asNumber(values[1]);
      return Math.round(asNumber(values[0]) * 10 ** digits) / 10 ** digits;
    }
    if (name === 'ABS') return Math.abs(asNumber(values[0]));
    if (name === 'CONCAT') return values.map(asString).join('');
    if (name === 'LEN') return asString(values[0] ?? null).length;
    if (name === 'UPPER') return asString(values[0] ?? null).toUpperCase();
    if (name === 'LOWER') return asString(values[0] ?? null).toLowerCase();
    if (name === 'TODAY') return ctx.today;
    if (name === 'DAYS') {
      const a = new Date(`${asString(values[0])}T00:00:00Z`).getTime();
      const b = new Date(`${asString(values[1])}T00:00:00Z`).getTime();
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new FormulaError('#TYPE');
      return Math.round((b - a) / 86_400_000);
    }
    if (name === 'ADD_DAYS') {
      const date = new Date(`${asString(values[0])}T00:00:00Z`);
      if (!Number.isFinite(date.getTime())) throw new FormulaError('#TYPE');
      date.setUTCDate(date.getUTCDate() + asNumber(values[1]));
      return date.toISOString().slice(0, 10);
    }
    throw new FormulaError('#REF');
  }
  throw new FormulaError('#ERROR');
}

export interface FormulaContext {
  userName: (id: number) => string;
  itemName?: (id: number) => string;
}

export function refValue(
  column: Column,
  value: CellValue | undefined,
  ctx: FormulaContext,
): FormulaValue {
  if (!value) return null;
  switch (column.type as ColumnType) {
    case 'number':
      return (value as { number: number }).number;
    case 'rating':
      return (value as { rating: number }).rating;
    case 'date':
      return (value as { date: string }).date;
    case 'timeline':
      return (value as { from: string }).from;
    case 'checkbox':
      return (value as { checked: boolean }).checked;
    case 'status':
      return (
        column.settings.labels?.find((label) => label.id === (value as { labelId: string }).labelId)
          ?.name ?? null
      );
    case 'dropdown':
      return ((value as { optionIds: string[] }).optionIds ?? [])
        .map((id) => column.settings.options?.find((option) => option.id === id)?.name)
        .filter(Boolean)
        .join(', ');
    case 'people':
      return ((value as { userIds: number[] }).userIds ?? []).map(ctx.userName).join(', ');
    case 'time_tracking':
      return Math.round(((value as { totalSeconds: number }).totalSeconds / 3600) * 100) / 100;
    case 'formula':
      return (value as { formula: FormulaValue }).formula;
    case 'mirror':
      return (value as { mirror: FormulaValue }).mirror;
    default:
      return cellToText(column.type, column.settings, value, ctx.userName, ctx.itemName);
  }
}

export function computeFormulas(
  columns: Column[],
  item: Item,
  ctx: FormulaContext & { today: string },
): Record<number, { formula: FormulaValue; error?: string }> {
  const byTitle = new Map(columns.map((column) => [column.title.toLowerCase(), column]));
  const memo = new Map<number, { formula: FormulaValue; error?: string }>();
  const visiting = new Set<number>();

  const resolve = (column: Column): { formula: FormulaValue; error?: string } => {
    const cached = memo.get(column.id);
    if (cached) return cached;
    if (visiting.has(column.id)) return { formula: null, error: '#CYCLE' };
    visiting.add(column.id);
    try {
      const ast = parseFormula(column.settings.expression ?? '');
      const result = evaluate(ast, {
        today: ctx.today,
        ref: (title) => {
          const target = byTitle.get(title.toLowerCase());
          if (!target) throw new FormulaError('#REF');
          if (target.type === 'formula') {
            const resolved = resolve(target);
            if (resolved.error) throw new FormulaError(resolved.error);
            return resolved.formula;
          }
          return refValue(target, item.values[String(target.id)] as CellValue | undefined, ctx);
        },
      });
      const value = { formula: result };
      memo.set(column.id, value);
      return value;
    } catch (err) {
      const error =
        err instanceof FormulaError
          ? err.message.startsWith('#')
            ? err.message
            : '#ERROR'
          : '#ERROR';
      const value = { formula: null, error };
      memo.set(column.id, value);
      return value;
    } finally {
      visiting.delete(column.id);
    }
  };

  const output: Record<number, { formula: FormulaValue; error?: string }> = {};
  for (const column of columns) {
    if (column.type === 'formula') output[column.id] = resolve(column);
  }
  return output;
}

export { formatDuration };
export type { ColumnSettings };
