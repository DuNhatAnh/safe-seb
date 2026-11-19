// Thu muc goc du an, dung duoc ca khi chay thang .ts (lib/...) lan ban build (dist/lib/...).
// Do nguoc len tu thu muc file nay toi khi gap public/js/question-types.js.
import fs from "node:fs";
import path from "node:path";

function findProjectRoot(start: string): string {
  let dir = start;
  for (;;) {
    if (fs.existsSync(path.join(dir, "public", "js", "question-types.js"))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error(`Không tìm thấy thư mục public/js khi dò từ ${start}`);
    dir = parent;
  }
}

export const PROJECT_ROOT = findProjectRoot(import.meta.dirname);
export const PUBLIC_DIR = path.join(PROJECT_ROOT, "public");
export const PUBLIC_JS_DIR = path.join(PUBLIC_DIR, "js");
