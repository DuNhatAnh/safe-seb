// Interface toi thieu de chay SQL. MigrationRunner chi biet interface nay:
//   - PgSqlClient: Postgres that (Supabase) qua thu vien `pg`
//   - PGlite trong test (Postgres chay trong bo nho)
export interface SqlClient {
  // Chay nhieu cau lenh SQL lien tiep (noi dung 1 file migration)
  exec(sql: string): Promise<void>;
  // 1 cau lenh co tham so ($1, $2...) -> cac dong ket qua
  query<T>(sql: string, params?: unknown[]): Promise<T[]>;
  close(): Promise<void>;
}
