// Cai dat Database bang Supabase REST (PostgREST) + khoa service_role (bo qua RLS).
// Day la noi DUY NHAT trong backend biet cu phap PostgREST (eq., is.null, order=..., Prefer...).
import type { Config } from "../../config.ts";
import { UpstreamError } from "../../errors.ts";
import type { Database, Filter, RestGateway, RestRequestOptions, SelectOptions, TableName } from "./Database.ts";

export class SupabaseDatabase implements Database, RestGateway {
  private readonly config: Config;
  private readonly fetchImpl: typeof fetch;

  constructor(config: Config, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async select<T>(table: TableName, { columns, filter, orderBy, limit }: SelectOptions = {}): Promise<T[]> {
    const params = SupabaseDatabase.filterParams(filter);
    params.push(["select", columns?.length ? columns.join(",") : "*"]);
    if (orderBy) params.push(["order", `${orderBy.column}.${orderBy.ascending === false ? "desc" : "asc"}`]);
    if (limit !== undefined) params.push(["limit", String(limit)]);
    return (await this.rest<T[]>(`${table}?${SupabaseDatabase.query(params)}`)) ?? [];
  }

  async insert<T>(table: TableName, row: object): Promise<T> {
    const rows = await this.rest<T[]>(table, { method: "POST", body: row, prefer: "return=representation" });
    if (!rows?.[0]) throw new UpstreamError(`Supabase không trả về dòng vừa thêm vào ${table}.`);
    return rows[0];
  }

  async update<T>(table: TableName, filter: Filter, patch: object): Promise<T[]> {
    SupabaseDatabase.assertFilter(filter);
    const query = SupabaseDatabase.query(SupabaseDatabase.filterParams(filter));
    return (await this.rest<T[]>(`${table}?${query}`, { method: "PATCH", body: patch, prefer: "return=representation" })) ?? [];
  }

  async remove(table: TableName, filter: Filter): Promise<void> {
    SupabaseDatabase.assertFilter(filter);
    await this.rest(`${table}?${SupabaseDatabase.query(SupabaseDatabase.filterParams(filter))}`, { method: "DELETE" });
  }

  // pathAndQuery: "exams?id=eq.1&select=*"
  async rest<T = unknown>(pathAndQuery: string, { method = "GET", body, prefer }: RestRequestOptions = {}): Promise<T | null> {
    const key = this.config.supabaseServiceKey;
    const res = await this.fetchImpl(`${this.config.supabaseUrl}/rest/v1/${pathAndQuery}`, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        ...(prefer ? { Prefer: prefer } : {})
      },
      body: body === undefined ? undefined : JSON.stringify(body)
    });
    const text = await res.text();
    if (!res.ok) throw new UpstreamError(`Lỗi Supabase (${res.status}): ${text}`);
    return text ? (JSON.parse(text) as T) : null;
  }

  // { exam_id: 5, student_name: "An", proctor_code: null } -> [["exam_id","eq.5"], ["student_name","eq.An"], ["proctor_code","is.null"]]
  static filterParams(filter: Filter = {}): [string, string][] {
    return Object.entries(filter).map(([column, value]) => [column, value === null ? "is.null" : `eq.${value}`]);
  }

  // Ma hoa bang encodeURIComponent (dau cach -> %20, khong dung "+" nhu URLSearchParams)
  static query(params: [string, string][]): string {
    return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  }

  // Khong cho PATCH / DELETE ca bang vi quen dieu kien
  private static assertFilter(filter: Filter): void {
    if (!Object.keys(filter).length) throw new Error("update/remove bắt buộc có điều kiện lọc.");
  }
}
