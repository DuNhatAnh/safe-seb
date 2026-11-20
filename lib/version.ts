// Phien ban he thong: file VERSION o thu muc goc (sua thanh 2, 3... khi ra ban moi).
// commit: ma commit dang chay (Vercel tu dat VERCEL_GIT_COMMIT_SHA; chay tren may = "dev").
import fs from "node:fs";
import path from "node:path";
import { PROJECT_ROOT } from "./paths.ts";

function readVersion(): string {
  try {
    return fs.readFileSync(path.join(PROJECT_ROOT, "VERSION"), "utf8").trim() || "0";
  } catch {
    return "0";
  }
}

export const APP_VERSION = readVersion();

export function versionInfo(): { version: string; commit: string } {
  return { version: APP_VERSION, commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "dev" };
}
