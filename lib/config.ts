// Doc bien moi truong. Doc luc goi (khong doc luc khoi dong) de thieu bien chi lam hong API can no.
//   SUPABASE_URL               https://xxx.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  khoa service_role / sb_secret_... KHONG dua vao trinh duyet.
//   ADMIN_PASSWORD             mat khau quan tri
//   PROCTOR_PASSWORD           mat khau giam thi (thoat khan cap / thoat ung dung)
//   SESSION_SECRET             chuoi ngau nhien dai, de ky token admin
//   DATABASE_URL               (tuy chon) Postgres de chay migration: Supabase > Connect > Session pooler
import { ConfigError } from "./errors.ts";

export type Env = Record<string, string | undefined>;

export class Config {
  private readonly env: Env;

  constructor(env: Env = process.env) {
    this.env = env;
  }

  require(name: string): string {
    const value = this.env[name];
    if (!value) throw new ConfigError(`Máy chủ chưa cấu hình biến môi trường ${name}.`);
    return value;
  }

  get supabaseUrl(): string { return this.require("SUPABASE_URL").replace(/\/$/, ""); }
  get supabaseServiceKey(): string { return this.require("SUPABASE_SERVICE_ROLE_KEY"); }
  get adminPassword(): string { return this.require("ADMIN_PASSWORD"); }
  get proctorPassword(): string { return this.require("PROCTOR_PASSWORD"); }
  get sessionSecret(): string { return this.require("SESSION_SECRET"); }
  // Ket noi Postgres truc tiep, CHI dung cho migration (khong can khi chay app)
  get databaseUrl(): string | undefined { return this.env.DATABASE_URL || undefined; }
  get databaseSslCaFile(): string | undefined { return this.env.DATABASE_SSL_CA || undefined; }
}
