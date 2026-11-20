// May chu: phuc vu public/ + /api/* (lib/api.ts). Chay: npm start | npm run dev (server tu khoi dong lai khi sua code)
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { handle as handleApi } from "./lib/api.ts";
import { loadEnvFile } from "./lib/infra/env.ts";
import { PROJECT_ROOT, PUBLIC_DIR } from "./lib/paths.ts";

// Nap bien moi truong tu .env (chi khi chay local; tren Vercel khai bao trong Project Settings).
// Config doc bien luc goi API, nen nap sau khi import van kip.
loadEnvFile(path.join(PROJECT_ROOT, ".env"));

const DEV = process.argv.includes("--dev");
const PORT = Number(process.env.PORT) || 3000;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf"
};

function sendText(res: http.ServerResponse, status: number, text: string): void {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8" });
  res.end(text);
}

// Duong dan URL -> file trong public/. null = ngoai public/ hoac URL hong.
function resolvePublicFile(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;
  const file = path.resolve(PUBLIC_DIR, "." + (decoded === "/" ? "/index.html" : decoded));
  // Phai nam TRONG public/ (them path.sep de "public2/" khong lot qua)
  return file === PUBLIC_DIR || file.startsWith(PUBLIC_DIR + path.sep) ? file : null;
}

const server = http.createServer((req, res) => {
  const urlPath = (req.url ?? "/").split("?")[0];
  // Link ngan tai app Android: /tai-app = /api/app-download
  if (urlPath === "/tai-app") req.url = "/api/app-download";
  if (urlPath.startsWith("/api/") || urlPath === "/tai-app") { void handleApi(req, res); return; }

  const file = resolvePublicFile(urlPath);
  if (!file) return sendText(res, 403, "403 Forbidden");

  fs.stat(file, (err, stats) => {
    if (err || !stats.isFile()) return sendText(res, 404, "404 Not Found");

    const ext = path.extname(file).toLowerCase();
    const headers: http.OutgoingHttpHeaders = { "Content-Type": MIME_TYPES[ext] ?? "application/octet-stream" };

    // npm run dev: khong cache -> sua code xong bam F5 la thay (KHONG tu tai lai trang)
    if (DEV) headers["Cache-Control"] = "no-store";

    res.writeHead(200, headers);
    fs.createReadStream(file).pipe(res);
  });
});

server.on("error", (err: NodeJS.ErrnoException) => {
  if (err.code === "EADDRINUSE") {
    console.error(`Cổng ${PORT} đang bị chương trình khác dùng. Tắt chương trình đó hoặc chạy với PORT khác (vd: PORT=3001).`);
    process.exit(1);
  }
  throw err;
});

server.listen(PORT, () => {
  console.log(`Server Safe Exam dang chay tai: http://localhost:${PORT}${DEV ? " (dev)" : ""}`);
});
