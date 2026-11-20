// Link tai app Android co dinh (/tai-app) -> chuyen toi file .apk MOI NHAT co ten kem phien ban
// (vd: safe-exam-v1.1.apk), de nhin ten file la biet dang tai ban may.
// File do GitHub Actions dang len release "apk-latest" (.github/workflows/android-apk.yml).
// Hoi GitHub API it nhat co the (cache 5 phut) vi GitHub gioi han so lan hoi khong dang nhap.

export interface AppDownloadServiceDeps {
  repo?: string;              // "chu/repo" tren GitHub
  fetchImpl?: typeof fetch;
  now?: () => number;
}

interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  updated_at?: string;
}

const CACHE_MS = 5 * 60 * 1000;
const VERSIONED_APK = /^safe-exam-v.+\.apk$/;

export class AppDownloadService {
  readonly repo: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private cache: { url: string; at: number } | null = null;

  constructor({ repo = "DuNhatAnh/safe-seb", fetchImpl = fetch, now = Date.now }: AppDownloadServiceDeps = {}) {
    this.repo = repo;
    this.fetchImpl = fetchImpl;
    this.now = now;
  }

  // Link file co ten kem phien ban dang dung (khong ten file nen ten co dinh cu)
  get fallbackUrl(): string {
    return `https://github.com/${this.repo}/releases/download/apk-latest/safe-exam.apk`;
  }

  async latestUrl(): Promise<string> {
    if (this.cache && this.now() - this.cache.at < CACHE_MS) return this.cache.url;
    let url = this.fallbackUrl;
    try {
      const res = await this.fetchImpl(`https://api.github.com/repos/${this.repo}/releases/tags/apk-latest`, {
        headers: { Accept: "application/vnd.github+json", "User-Agent": "safe-exam-server" }
      });
      if (res.ok) {
        const { assets = [] } = (await res.json()) as { assets?: ReleaseAsset[] };
        const newest = assets
          .filter(a => VERSIONED_APK.test(a.name))
          .sort((a, b) => String(b.updated_at ?? "").localeCompare(String(a.updated_at ?? "")))[0];
        if (newest) url = newest.browser_download_url;
      }
    } catch {
      // GitHub loi / mat mang -> dung link co dinh
    }
    this.cache = { url, at: this.now() };
    return url;
  }
}
