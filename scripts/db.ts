// Quan ly migration database.
//   npm run db:status            xem migration da chay / chua chay
//   npm run db:migrate           ap cac migration chua chay
//   npm run db:new -- ten_moi    tao file migration moi (so thu tu tu tang)
// Can DATABASE_URL trong .env (Supabase > Connect > Session pooler).
// `migrate --if-configured`: khong co DATABASE_URL thi bo qua (dung trong npm run dev / build Vercel).
import fs from "node:fs";
import path from "node:path";
import { Config } from "../lib/config.ts";
import { loadEnvFile } from "../lib/infra/env.ts";
import { loadMigrations, MigrationRunner } from "../lib/infra/migrations/MigrationRunner.ts";
import { PgSqlClient } from "../lib/infra/migrations/PgSqlClient.ts";
import { PROJECT_ROOT } from "../lib/paths.ts";

const MIGRATIONS_DIR = path.join(PROJECT_ROOT, "database", "migrations");

loadEnvFile(path.join(PROJECT_ROOT, ".env"));
const config = new Config();
const [command = "status", ...args] = process.argv.slice(2);

function fail(message: string): never {
  console.error(`✖ ${message}`);
  process.exit(1);
}

// Che mat khau khi in chuoi ket noi
const redact = (url: string): string => url.replace(/\/\/([^:/]+):[^@]*@/, "//$1:***@");

async function withRunner<T>(fn: (runner: MigrationRunner) => Promise<T>): Promise<T> {
  const url = config.databaseUrl;
  if (!url) fail("Chưa có DATABASE_URL trong .env (Supabase > Connect > Session pooler).");
  console.log(`Database: ${redact(url)}`);
  let client: PgSqlClient;
  try {
    client = await PgSqlClient.connect({ connectionString: url, sslCaFile: config.databaseSslCaFile });
  } catch (err) {
    fail(`Không kết nối được database: ${err instanceof Error ? err.message : String(err)}`);
  }
  try {
    return await fn(new MigrationRunner(client, loadMigrations(MIGRATIONS_DIR), msg => console.log(msg)));
  } finally {
    await client.close();
  }
}

async function status(): Promise<void> {
  await withRunner(async runner => {
    const s = await runner.status();
    for (const a of s.applied) console.log(`  ✔ ${a.version}_${a.name}  (${a.applied_at.slice(0, 19)})`);
    for (const m of s.pending) console.log(`  · ${m.file}  (chưa chạy)`);
    for (const m of s.modified) console.log(`  ! ${m.file}  ĐÃ BỊ SỬA sau khi chạy`);
    for (const u of s.unknown) console.log(`  ? ${u.version}_${u.name}  có trong database nhưng không còn file`);
    console.log(s.pending.length ? `${s.pending.length} migration chưa chạy → npm run db:migrate` : "Database đã cập nhật mới nhất.");
  });
}

async function migrate(): Promise<void> {
  if (!config.databaseUrl && args.includes("--if-configured")) {
    console.log("[db] Bỏ qua migration (chưa đặt DATABASE_URL).");
    return;
  }
  await withRunner(async runner => {
    const applied = await runner.migrate();
    console.log(applied.length ? `✔ Đã áp ${applied.length} migration.` : "✔ Database đã cập nhật mới nhất, không có gì để chạy.");
  });
}

function create(): void {
  const name = (args[0] ?? "").toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
  if (!name) fail("Thiếu tên: npm run db:new -- them_cot_abc");
  const last = loadMigrations(MIGRATIONS_DIR).at(-1);
  const version = String(Number(last?.version ?? 0) + 1).padStart(4, "0");
  const file = path.join(MIGRATIONS_DIR, `${version}_${name}.sql`);
  fs.writeFileSync(file, `-- ${name.replace(/_/g, " ")}\n-- Viet lenh co the chay lai an toan (if not exists / if exists).\n\n`);
  console.log(`✔ Đã tạo ${path.relative(PROJECT_ROOT, file)}`);
}

try {
  if (command === "status") await status();
  else if (command === "migrate") await migrate();
  else if (command === "new") create();
  else fail(`Lệnh không hợp lệ: ${command} (status | migrate | new)`);
} catch (err) {
  fail(err instanceof Error ? err.message : String(err));
}
