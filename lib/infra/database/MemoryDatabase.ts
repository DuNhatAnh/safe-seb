// Cai dat Database trong bo nho, cung hanh vi voi SupabaseDatabase. Dung cho test nghiep vu
// (chay repository + service that, khong can mang / Supabase).
import type { Database, Filter, FilterValue, Scalar, Search, SelectOptions, TableName } from "./Database.ts";

type Row = Record<string, unknown>;

export class MemoryDatabase implements Database {
  private readonly tables = new Map<TableName, Row[]>();
  private nextId = 1;
  private clock = 0; // created_at tang dan theo thu tu them (sap xep "moi nhat" on dinh)

  constructor(seed: Partial<Record<TableName, readonly object[]>> = {}) {
    for (const [table, rows] of Object.entries(seed) as [TableName, object[]][]) {
      for (const row of rows) this.insertRow(table, row as Row);
    }
  }

  rows(table: TableName): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  async select<T>(table: TableName, { columns, filter, search, orderBy, limit, offset = 0 }: SelectOptions = {}): Promise<T[]> {
    let rows = this.find(table, filter, search);
    if (orderBy) {
      const dir = orderBy.ascending === false ? -1 : 1;
      rows = [...rows].sort((a, b) => MemoryDatabase.compare(a[orderBy.column], b[orderBy.column]) * dir);
    }
    rows = rows.slice(offset, limit !== undefined ? offset + limit : undefined);
    return rows.map(r => structuredClone(columns?.length ? Object.fromEntries(columns.map(c => [c, r[c]])) : r) as T);
  }

  async count(table: TableName, { filter, search }: Pick<SelectOptions, "filter" | "search"> = {}): Promise<number> {
    return this.find(table, filter, search).length;
  }

  async insert<T>(table: TableName, row: object): Promise<T> {
    return structuredClone(this.insertRow(table, row as Row)) as T;
  }

  async update<T>(table: TableName, filter: Filter, patch: object): Promise<T[]> {
    return this.find(table, filter).map(r => structuredClone(Object.assign(r, patch)) as T);
  }

  async remove(table: TableName, filter: Filter): Promise<void> {
    const drop = new Set(this.find(table, filter));
    this.tables.set(table, this.rows(table).filter(r => !drop.has(r)));
  }

  private find(table: TableName, filter: Filter = {}, search?: Search): Row[] {
    const term = search?.term.trim().toLowerCase();
    return this.rows(table).filter(r =>
      Object.entries(filter).every(([k, v]) => MemoryDatabase.matches(r[k], v)) &&
      (!search || !term || String(r[search.column] ?? "").toLowerCase().includes(term)));
  }

  private insertRow(table: TableName, row: Row): Row {
    const createdAt = new Date(Date.UTC(2026, 0, 1) + this.clock++ * 1000).toISOString();
    const saved: Row = { id: this.nextId++, created_at: createdAt, ...structuredClone(row) };
    this.rows(table).push(saved);
    return saved;
  }

  private static matches(actual: unknown, expected: FilterValue): boolean {
    if (expected === null) return actual == null;
    if (Array.isArray(expected)) return expected.some(v => String(v) === String(actual));
    if (typeof expected === "object") {
      const { gte, lt } = expected as { gte?: Scalar; lt?: Scalar };
      return (gte === undefined || MemoryDatabase.compare(actual, gte) >= 0) && (lt === undefined || MemoryDatabase.compare(actual, lt) < 0);
    }
    return String(actual) === String(expected);
  }

  private static compare(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a ?? "").localeCompare(String(b ?? ""));
  }
}
