const http = require("http");
const fs = require("fs");
const path = require("path");

// Nap bien moi truong tu .env (chi khi chay local; tren Vercel khai bao trong Project Settings)
const ENV_FILE = path.join(__dirname, ".env");
if (fs.existsSync(ENV_FILE)) {
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}

const api = require("./lib/api");

// `npm run dev` -> bat hot reload (xem lib/dev-reload.js)
const DEV = process.argv.includes("--dev");
const devReload = DEV ? require("./lib/dev-reload").createDevReload(path.join(__dirname, "public")) : null;

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.normalize(path.join(__dirname, "public"));

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".ttf": "font/ttf"
};

const server = http.createServer((req, res) => {
  let reqPath = req.url.split("?")[0];
  if (reqPath.startsWith("/api/")) return api.handle(req, res);
  if (devReload && devReload.handle(req, res)) return;
  if (reqPath === "/") reqPath = "/index.html";

  // Chuan hoa duong dan va phong chong Path Traversal
  const safePath = path.normalize(path.join(PUBLIC_DIR, reqPath));

  if (!safePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
    return res.end("403 Forbidden");
  }

  fs.stat(safePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("404 Not Found");
    }

    const ext = path.extname(safePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    if (devReload) {
      // Dev: khong cache + chen script hot reload vao trang HTML
      res.writeHead(200, { "Content-Type": contentType, "Cache-Control": "no-store" });
      if (ext === ".html") return fs.readFile(safePath, "utf8", (e, html) => res.end(e ? "" : devReload.inject(html)));
      return fs.createReadStream(safePath).pipe(res);
    }

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(safePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Server Safe Exam dang chay tai: http://localhost:${PORT}${DEV ? " (dev: hot reload)" : ""}`);
});
