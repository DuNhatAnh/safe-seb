// Cai dat Database bang Supabase REST (PostgREST) + khoa service_role (bo qua RLS).
// Day la noi DUY NHAT trong backend biet cu phap PostgREST (eq., in., ilike., order=..., Prefer...).
import type { Config } from "../../config.ts";
import { UpstreamError } from "../../errors.ts";
import type { Database, Filter, FilterValue, RestGateway, RestRequestOptions, Scalar, Search, SelectOptions, TableName } from "./Database.ts";

type Param = [string, string];

export class SupabaseDatabase implements Database, RestGateway {
  private readonly config: Config;
  private readonly fetchImpl: typeof fetch;

  constructor(config: Config, fetchImpl: typeof fetch = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async select<T>(table: TableName, { columns, filter, search, orderBy, limit, offset }: SelectOptions = {}): Promise<T[]> {
    const params = [...SupabaseDatabase.filterParams(filter), ...SupabaseDatabase.searchParams(search)];
    params.push(["select", columns?.length ? columns.join(",") : "*"]);
    if (orderBy) params.push(["order", `${orderBy.column}.${orderBy.ascending === false ? "desc" : "asc"}`]);
    if (limit !== undefined) params.push(["limit", String(limit)]);
    if (offset) params.push(["offset", String(offset)]);
    return (await this.rest<T[]>(`${table}?${SupabaseDatabase.query(params)}`)) ?? [];
  }

  async count(table: TableName, { filter, search }: Pick<SelectOptions, "filter" | "search"> = {}): Promise<number> {
    const params = [...SupabaseDatabase.filterParams(filter), ...SupabaseDatabase.searchParams(search), ["select", "id"] as Param];
    return (await this.restWithCount(`${table}?${SupabaseDatabase.query(params)}`)).total;
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
  async rest<T = unknown>(pathAndQuery: string, options: RestRequestOptions = {}): Promise<T | null> {
    const { text } = await this.send(pathAndQuery, options);
    return text ? (JSON.parse(text) as T) : null;
  }

  // GET + tong so dong khop (header Content-Range: "0-2/57" hoac "*/0")
  async restWithCount<T = unknown>(pathAndQuery: string): Promise<{ rows: T[]; total: number }> {
    const { text, headers } = await this.send(pathAndQuery, { prefer: "count=exact" });
    const total = Number((headers.get("content-range") ?? "").split("/")[1]);
    const rows = text ? (JSON.parse(text) as T[]) : [];
    return { rows, total: Number.isFinite(total) ? total : rows.length };
  }

  private async send(pathAndQuery: string, { method = "GET", body, prefer }: RestRequestOptions): Promise<{ text: string; headers: Headers }> {
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
    return { text, headers: res.headers };
  }

  // { exam_id: 5, name: null, id: [1, 2], created_at: { gte: "2026-11-20" } }
  //   -> exam_id=eq.5 & name=is.null & id=in.(1,2) & created_at=gte.2026-11-20
  static filterParams(filter: Filter = {}): Param[] {
    return Object.entries(filter).flatMap(([column, value]) => SupabaseDatabase.condition(column, value));
  }

  private static condition(column: string, value: FilterValue): Param[] {
    if (value === null) return [[column, "is.null"]];
    if (Array.isArray(value)) return [[column, `in.(${value.map(SupabaseDatabase.listItem).join(",")})`]];
    if (typeof value === "object") {
      const range = value as { gte?: Scalar; lt?: Scalar };
      const out: Param[] = [];
      if (range.gte !== undefined) out.push([column, `gte.${range.gte}`]);
      if (range.lt !== undefined) out.push([column, `lt.${range.lt}`]);
      return out;
    }
    return [[column, `eq.${value}`]];
  }

  // Phan tu trong in.(...): chuoi boc nhay kep (de dau phay / ngoac trong ten khong lam vo cu phap)
  private static listItem(v: Scalar): string {
    return typeof v === "string" ? `"${v.replace(/["\\]/g, "\\$&")}"` : String(v);
  }

  // Tim gan dung: ilike.*tu khoa* (bo ky tu dac biet cua PostgREST trong tu khoa)
  static searchParams(search?: Search): Param[] {
    const term = search?.term.replace(/[*%,()"\\]/g, " ").trim();
    return search && term ? [[search.column, `ilike.*${term}*`]] : [];
  }

  // Ma hoa bang encodeURIComponent (dau cach -> %20, khong dung "+" nhu URLSearchParams)
  static query(params: Param[]): string {
    return params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
  }

  // Khong cho PATCH / DELETE ca bang vi quen dieu kien
  private static assertFilter(filter: Filter): void {
    if (!Object.keys(filter).length) throw new Error("update/remove bắt buộc có điều kiện lọc.");
  }
}
