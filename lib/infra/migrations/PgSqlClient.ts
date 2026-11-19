// SqlClient tren Postgres that (Supabase) bang thu vien `pg`.
// DATABASE_URL: Supabase > Connect > "Session pooler" (IPv4), dang
//   postgresql://postgres.<ref>:<mat-khau>@aws-0-<vung>.pooler.supabase.com:5432/postgres
import fs from "node:fs";
import pg from "pg";
import type { SqlClient } from "./SqlClient.ts";

export interface PgOptions {
  connectionString: string;
  // File CA cua Supabase (Database Settings > SSL > Download certificate) de xac thuc may chu.
  // Khong co -> van ma hoa SSL nhung khong kiem tra chung chi.
  sslCaFile?: string;
}

export class PgSqlClient implements SqlClient {
  private readonly client: pg.Client;

  private constructor(client: pg.Client) {
    this.client = client;
  }

  static async connect({ connectionString, sslCaFile }: PgOptions): Promise<PgSqlClient> {
    const isLocal = /@(localhost|127\.0\.0\.1)[:/]/.test(connectionString);
    const ssl = isLocal ? false : sslCaFile ? { ca: fs.readFileSync(sslCaFile, "utf8") } : { rejectUnauthorized: false };
    // Bo sslmode trong URL de cau hinh ssl o tren duoc dung (pg uu tien tham so URL)
    const client = new pg.Client({ connectionString: connectionString.replace(/([?&])sslmode=[^&]*&?/, "$1").replace(/[?&]$/, ""), ssl });
    await client.connect();
    return new PgSqlClient(client);
  }

  async exec(sql: string): Promise<void> {
    await this.client.query(sql); // khong tham so -> giao thuc "simple query", chay duoc nhieu cau lenh
  }

  async query<T>(sql: string, params: unknown[] = []): Promise<T[]> {
    return (await this.client.query(sql, params)).rows as T[];
  }

  async close(): Promise<void> {
    await this.client.end();
  }
}
