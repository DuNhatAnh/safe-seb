// Chay migration: database/migrations/NNNN_ten.sql, theo thu tu so, moi file 1 lan.
//  - Bang schema_migrations ghi file nao da chay (+ checksum noi dung)
//  - Moi file chay trong 1 transaction: loi -> rollback, khong ghi nua voi
//  - Khoa advisory: 2 noi chay cung luc (vd: 2 lan deploy) khong ap trung
//  - File da chay ma bi sua noi dung -> bao loi (muon doi schema thi tao file migration MOI)
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { SqlClient } from "./SqlClient.ts";

export interface Migration {
  version: string;   // "0003"
  name: string;      // "exam_proctor_code"
  file: string;
  sql: string;
  checksum: string;
}

export interface AppliedMigration {
  version: string;
  name: string;
  checksum: string;
  applied_at: string;
}

export interface MigrationStatus {
  applied: AppliedMigration[];
  pending: Migration[];
  modified: Migration[];   // da chay nhung noi dung file da bi sua
  unknown: AppliedMigration[]; // co trong DB nhung khong con file
}

const FILE_PATTERN = /^(\d{4})_([a-z0-9_]+)\.sql$/;
const LOCK_KEY = 72_041_997; // so bat ky, rieng cho migration cua du an

export function checksum(sql: string): string {
  // Chuan hoa xuong dong: cung file tren Windows (CRLF) / Linux (LF) cho cung checksum
  return crypto.createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

export function loadMigrations(dir: string): Migration[] {
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();
  const seen = new Set<string>();
  return files.map(file => {
    const m = FILE_PATTERN.exec(file);
    if (!m) throw new Error(`Tên file migration sai mẫu NNNN_ten_viet_thuong.sql: ${file}`);
    if (seen.has(m[1])) throw new Error(`Trùng số thứ tự migration ${m[1]}`);
    seen.add(m[1]);
    const sql = fs.readFileSync(path.join(dir, file), "utf8");
    return { version: m[1], name: m[2], file, sql, checksum: checksum(sql) };
  });
}

export class MigrationRunner {
  private readonly db: SqlClient;
  private readonly migrations: Migration[];
  private readonly log: (msg: string) => void;

  constructor(db: SqlClient, migrations: Migration[], log: (msg: string) => void = () => { }) {
    this.db = db;
    this.migrations = migrations;
    this.log = log;
  }

  async status(): Promise<MigrationStatus> {
    await this.ensureTable();
    const applied = await this.db.query<AppliedMigration>(
      "select version, name, checksum, applied_at::text as applied_at from schema_migrations order by version"
    );
    const byVersion = new Map(applied.map(a => [a.version, a]));
    const files = new Set(this.migrations.map(m => m.version));
    return {
      applied,
      pending: this.migrations.filter(m => !byVersion.has(m.version)),
      modified: this.migrations.filter(m => byVersion.has(m.version) && byVersion.get(m.version)!.checksum !== m.checksum),
      unknown: applied.filter(a => !files.has(a.version))
    };
  }

  // Ap cac migration chua chay. Tra ve danh sach vua ap.
  async migrate(): Promise<Migration[]> {
    await this.ensureTable();
    await this.db.query("select pg_advisory_lock($1)", [LOCK_KEY]);
    try {
      const { pending, modified } = await this.status();
      if (modified.length) {
        throw new Error(`Migration đã chạy nhưng file bị sửa: ${modified.map(m => m.file).join(", ")}. ` +
          "Không sửa migration cũ; hãy tạo file migration mới.");
      }
      for (const m of pending) {
        this.log(`→ ${m.file}`);
        await this.db.exec("begin");
        try {
          await this.db.exec(m.sql);
          await this.db.query("insert into schema_migrations (version, name, checksum) values ($1, $2, $3)", [m.version, m.name, m.checksum]);
          await this.db.exec("commit");
        } catch (err) {
          await this.db.exec("rollback");
          throw new Error(`Migration ${m.file} lỗi, đã rollback: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
      return pending;
    } finally {
      await this.db.query("select pg_advisory_unlock($1)", [LOCK_KEY]);
    }
  }

  private async ensureTable(): Promise<void> {
    await this.db.exec(`
      create table if not exists schema_migrations (
        version text primary key,
        name text not null,
        checksum text not null,
        applied_at timestamp with time zone not null default now()
      );
      alter table schema_migrations enable row level security;
      do $$
      begin
        if exists (select 1 from pg_roles where rolname = 'anon') then
          revoke all on schema_migrations from anon, authenticated;
        end if;
      end $$;
    `);
  }
}
