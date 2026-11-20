// Tang phien ban theo quy tac trong CHANGELOG.md
//   npm run version:small   cap nhat nho: 1.0 -> 1.1
//   npm run version:big     cap nhat lon: 1.5 -> 2.0
// Sua file VERSION va them muc moi o dau CHANGELOG.md de ghi thay doi.
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "../lib/paths.ts";

export const VERSION_PATTERN = /^(\d+)\.(\d+)$/;

export function bump(version: string, kind: "small" | "big"): string {
  const m = VERSION_PATTERN.exec(version.trim());
  if (!m) throw new Error(`VERSION phải dạng LỚN.NHỎ (vd 1.1), đang là "${version.trim()}"`);
  const [major, minor] = [Number(m[1]), Number(m[2])];
  return kind === "big" ? `${major + 1}.0` : `${major}.${minor + 1}`;
}

const kind = process.argv[2];
if (kind === "small" || kind === "big") {
  const versionFile = path.join(PROJECT_ROOT, "VERSION");
  const changelogFile = path.join(PROJECT_ROOT, "CHANGELOG.md");
  const current = fs.readFileSync(versionFile, "utf8");
  const next = bump(current, kind);
  fs.writeFileSync(versionFile, `${next}\n`);

  const changelog = fs.readFileSync(changelogFile, "utf8");
  const marker = "---\n\n";
  const at = changelog.indexOf(marker);
  const today = new Date().toISOString().slice(0, 10);
  const entry = `## ${next} · ${today}\n\n- (ghi thay đổi${kind === "big" ? " lớn" : ""} ở đây)\n\n`;
  fs.writeFileSync(changelogFile, at >= 0 ? changelog.slice(0, at + marker.length) + entry + changelog.slice(at + marker.length) : changelog + "\n" + entry);
  console.log(`✔ ${current.trim()} → ${next} (cập nhật ${kind === "big" ? "lớn" : "nhỏ"}). Ghi thay đổi vào CHANGELOG.md mục ## ${next}.`);
} else if (kind !== undefined) {
  console.error("Dùng: npm run version:small | npm run version:big");
  process.exitCode = 1;
}
