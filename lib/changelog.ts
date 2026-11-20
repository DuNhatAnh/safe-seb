// Doc lich su phien ban tu CHANGELOG.md (nguon duy nhat), de dong bo vao bang app_versions khi deploy.
// Moi muc:  "## 1.3 · 2026-11-21"  roi cac dong "- ..." la thay doi.
// Muc co dong chua "cần gỡ app cũ" (va khong co "không cần") -> phien ban do bat buoc cai lai app Android.

export interface ChangelogEntry {
  version: string;            // "1.3"
  date: string | null;        // "2026-11-21" (ngay phat hanh ghi o tieu de), khong ghi -> null
  notes: string;              // cac dong thay doi (markdown)
  requiresAppUpdate: boolean; // app Android phai go / cai lai ban moi
}

const HEADING = /^##\s+(\d+\.\d+)\s*(?:[·\-—(]\s*(\d{4}-\d{2}-\d{2})\)?)?\s*$/;

export function parseChangelog(text: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = [];
  let current: { version: string; date: string | null; lines: string[] } | null = null;
  const flush = (): void => {
    if (!current) return;
    const notes = current.lines.join("\n").trim();
    const requiresAppUpdate = current.lines.some(l => /cần gỡ app cũ/i.test(l) && !/không\W*cần/i.test(l));
    entries.push({ version: current.version, date: current.date, notes, requiresAppUpdate });
  };
  for (const raw of text.replace(/\r\n/g, "\n").split("\n")) {
    const m = HEADING.exec(raw.trim());
    if (m) {
      flush();
      current = { version: m[1], date: m[2] ?? null, lines: [] };
    } else if (current) {
      if (/^##\s/.test(raw) || /^---\s*$/.test(raw.trim())) { flush(); current = null; continue; }
      current.lines.push(raw);
    }
  }
  flush();
  return entries;
}

// So sanh "LON.NHO" theo so (1.10 > 1.9). Chuoi sai dang coi nhu 0.0
export function compareVersions(a: string, b: string): number {
  const p = (v: string): [number, number] => {
    const m = /^v?(\d+)\.(\d+)/.exec(String(v).trim());
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  };
  const [a1, a2] = p(a), [b1, b2] = p(b);
  return a1 - b1 || a2 - b2;
}

// Phien ban app Android toi thieu: phien ban moi nhat (khong vuot ban dang chay) bat buoc cai lai app.
// latestApk: phien ban file .apk moi nhat da build xong; app moi chua build xong thi CHUA chan (tranh hoc sinh
// bi chan ma tai ve van la ban cu). Khong biet latestApk (GitHub loi) -> khong chan.
export function requiredAppVersion(requiredVersions: string[], current: string, latestApk: string | null): string | null {
  if (!latestApk) return null;
  const candidates = requiredVersions
    .filter(v => compareVersions(v, current) <= 0 && compareVersions(v, latestApk) <= 0)
    .sort(compareVersions);
  return candidates.at(-1) ?? null;
}
