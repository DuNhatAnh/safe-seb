// Phien ban dang chay + phien ban app Android toi thieu (app cu hon -> trang web chan, yeu cau tai ban moi).
//   min_app_version = phien ban bat buoc cai lai app moi nhat (bang app_versions), nhung CHI khi file .apk
//   ban do da build xong (tranh chan hoc sinh ma bam tai van ra ban cu). Loi bat ky -> null (khong chan ai).
import type { Database } from "../infra/database/Database.ts";
import { requiredAppVersion } from "../changelog.ts";
import { APP_VERSION } from "../version.ts";

export interface VersionInfo {
  version: string;               // phien ban he thong dang chay (file VERSION)
  commit: string;                // ma commit (Vercel), may ca nhan: "dev"
  min_app_version: string | null; // app Android phai >= ban nay, null = khong chan
}

export interface VersionServiceDeps {
  db: Database;
  // Phien ban file .apk moi nhat (AppDownloadService.latestVersion); null = chua biet
  latestApkVersion: () => Promise<string | null>;
  version?: string;
  commit?: () => string;
  now?: () => number;
}

const CACHE_MS = 60 * 1000;

export class VersionService {
  private readonly db: Database;
  private readonly latestApkVersion: () => Promise<string | null>;
  private readonly version: string;
  private readonly commit: () => string;
  private readonly now: () => number;
  private cache: { value: string | null; at: number } | null = null;

  constructor({ db, latestApkVersion, version = APP_VERSION, commit, now = Date.now }: VersionServiceDeps) {
    this.db = db;
    this.latestApkVersion = latestApkVersion;
    this.version = version;
    this.commit = commit ?? (() => (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev");
    this.now = now;
  }

  async info(): Promise<VersionInfo> {
    return { version: this.version, commit: this.commit(), min_app_version: await this.minAppVersion() };
  }

  private async minAppVersion(): Promise<string | null> {
    if (this.cache && this.now() - this.cache.at < CACHE_MS) return this.cache.value;
    let value: string | null = null;
    try {
      const [rows, apk] = await Promise.all([
        this.db.select<{ version: string }>("app_versions", { columns: ["version"], filter: { requires_app_update: true } }),
        this.latestApkVersion()
      ]);
      value = requiredAppVersion(rows.map(r => r.version), this.version, apk);
    } catch {
      value = null; // chua chay migration / database loi -> khong chan
    }
    this.cache = { value, at: this.now() };
    return value;
  }
}
