// Interface truy cap du lieu. Repository CHI biet interface nay, khong biet Supabase / PostgREST / SQL.
// Ban cai dat:
//   - SupabaseDatabase: Supabase REST bang khoa service_role (chay that)
//   - MemoryDatabase:   trong bo nho (test nghiep vu)
// Doi sang database khac = viet them 1 lop cai dat interface nay, khong sua repository / service.

export type TableName = "exams" | "exam_results" | "exam_events" | "app_settings";

export type Scalar = string | number | boolean;

// Gia tri loc 1 cot:
//   gia tri      -> cot = gia tri
//   null         -> cot IS NULL
//   [a, b, c]    -> cot IN (a, b, c)
//   { gte, lt }  -> gte <= cot < lt (vd: loc theo ngay)
export type FilterValue = Scalar | null | readonly Scalar[] | { gte?: Scalar; lt?: Scalar };
export type Filter = Record<string, FilterValue>;

// Tim gan dung (khong phan biet hoa / thuong) trong 1 cot
export interface Search {
  column: string;
  term: string;
}

export interface SelectOptions {
  columns?: readonly string[];                       // mac dinh: tat ca
  filter?: Filter;
  search?: Search;
  orderBy?: { column: string; ascending?: boolean }; // ascending mac dinh true
  limit?: number;
  offset?: number;                                   // bo qua n dong dau (phan trang)
}

export interface Database {
  select<T>(table: TableName, options?: SelectOptions): Promise<T[]>;
  // Dem so dong khop dieu kien (tong so de / ket qua cho phan trang)
  count(table: TableName, options?: Pick<SelectOptions, "filter" | "search">): Promise<number>;
  // Tra ve dong vua them (kem id, cot mac dinh)
  insert<T>(table: TableName, row: object): Promise<T>;
  // Tra ve cac dong da sua
  update<T>(table: TableName, filter: Filter, patch: object): Promise<T[]>;
  remove(table: TableName, filter: Filter): Promise<void>;
}

// Trang ket qua phan trang
export interface Page<T> {
  items: T[];
  total: number;
  page: number;   // bat dau tu 1
  size: number;
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
  // GET kem tong so dong (Prefer: count=exact) - de admin phan trang
  restWithCount<T = unknown>(pathAndQuery: string): Promise<{ rows: T[]; total: number }>;
}
