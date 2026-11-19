// Interface truy cap du lieu. Repository CHI biet interface nay, khong biet Supabase / PostgREST / SQL.
// Ban cai dat:
//   - SupabaseDatabase: Supabase REST bang khoa service_role (chay that)
//   - MemoryDatabase:   trong bo nho (test nghiep vu)
// Doi sang database khac = viet them 1 lop cai dat interface nay, khong sua repository / service.

export type TableName = "exams" | "exam_results" | "exam_events" | "app_settings";

// Loc bang (cot = gia tri). null -> "cot IS NULL"
export type Filter = Record<string, string | number | boolean | null>;

export interface SelectOptions {
  columns?: readonly string[];                       // mac dinh: tat ca
  filter?: Filter;
  orderBy?: { column: string; ascending?: boolean }; // ascending mac dinh true
  limit?: number;
}

export interface Database {
  select<T>(table: TableName, options?: SelectOptions): Promise<T[]>;
  // Tra ve dong vua them (kem id, cot mac dinh)
  insert<T>(table: TableName, row: object): Promise<T>;
  // Tra ve cac dong da sua
  update<T>(table: TableName, filter: Filter, patch: object): Promise<T[]>;
  remove(table: TableName, filter: Filter): Promise<void>;
}

// Rieng trang admin: chuyen tiep truy van REST tho (admin.js dang dung cu phap PostgREST).
// Tach khoi Database de nghiep vu khong phu thuoc chi tiet REST.
export type RestMethod = "GET" | "POST" | "PATCH" | "DELETE";

export interface RestRequestOptions {
  method?: RestMethod;
  body?: unknown;
  prefer?: string;
}

export interface RestGateway {
  rest<T = unknown>(pathAndQuery: string, options?: RestRequestOptions): Promise<T | null>;
}
