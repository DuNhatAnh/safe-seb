// Cai dat Database trong bo nho, cung hanh vi voi SupabaseDatabase. Dung cho test nghiep vu
// (chay repository + service that, khong can mang / Supabase).
import type { Database, Filter, SelectOptions, TableName } from "./Database.ts";

type Row = Record<string, unknown>;

export class MemoryDatabase implements Database {
  private readonly tables = new Map<TableName, Row[]>();
  private nextId = 1;

  constructor(seed: Partial<Record<TableName, readonly object[]>> = {}) {
    for (const [table, rows] of Object.entries(seed) as [TableName, object[]][]) {
      for (const row of rows) this.insertRow(table, row as Row);
    }
  }

  rows(table: TableName): Row[] {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return this.tables.get(table)!;
  }

  async select<T>(table: TableName, { columns, filter, orderBy, limit }: SelectOptions = {}): Promise<T[]> {
    let rows = this.rows(table).filter(MemoryDatabase.matches(filter));
    if (orderBy) {
      const dir = orderBy.ascending === false ? -1 : 1;
      rows = [...rows].sort((a, b) => MemoryDatabase.compare(a[orderBy.column], b[orderBy.column]) * dir);
    }
    if (limit !== undefined) rows = rows.slice(0, limit);
    return rows.map(r => structuredClone(columns?.length ? Object.fromEntries(columns.map(c => [c, r[c]])) : r) as T);
  }

  async insert<T>(table: TableName, row: object): Promise<T> {
    return structuredClone(this.insertRow(table, row as Row)) as T;
  }

  async update<T>(table: TableName, filter: Filter, patch: object): Promise<T[]> {
    return this.rows(table).filter(MemoryDatabase.matches(filter)).map(r => structuredClone(Object.assign(r, patch)) as T);
  }

  async remove(table: TableName, filter: Filter): Promise<void> {
    const keep = this.rows(table).filter(r => !MemoryDatabase.matches(filter)(r));
    this.tables.set(table, keep);
  }

  private insertRow(table: TableName, row: Row): Row {
    const saved: Row = { id: this.nextId++, created_at: new Date().toISOString(), ...structuredClone(row) };
    this.rows(table).push(saved);
    return saved;
  }

  private static matches(filter: Filter = {}): (r: Row) => boolean {
    return r => Object.entries(filter).every(([k, v]) => (v === null ? r[k] == null : String(r[k]) === String(v)));
  }

  private static compare(a: unknown, b: unknown): number {
    if (typeof a === "number" && typeof b === "number") return a - b;
    return String(a ?? "").localeCompare(String(b ?? ""));
  }
}
