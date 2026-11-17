const http = require("http");
const fs = require("fs");
const path = require("path");
const parsePdfHandler = require("./api/parse-pdf");

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, "public");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml"
};

const server = http.createServer(async (req, res) => {
  // 1. Dinh tuyen API
  if (req.url === "/api/parse-pdf" || req.url.startsWith("/api/parse-pdf?")) {
    return parsePdfHandler(req, res);
  }

  // 2. Phuc vu static files trong public/
  let reqPath = req.url.split("?")[0];
  if (reqPath === "/") reqPath = "/index.html";

  let filePath = path.join(PUBLIC_DIR, reqPath);

  // Kiem tra file ton tai, neu khong co thi ho tro fallback vao public/css hoac public/js
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Thu tim trong public/css hoac public/js
      const fallbackCss = path.join(PUBLIC_DIR, "css", reqPath);
      const fallbackJs = path.join(PUBLIC_DIR, "js", reqPath);

      if (fs.existsSync(fallbackCss) && fs.statSync(fallbackCss).isFile()) {
        filePath = fallbackCss;
      } else if (fs.existsSync(fallbackJs) && fs.statSync(fallbackJs).isFile()) {
        filePath = fallbackJs;
      } else {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("404 Not Found");
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`Server Safe Exam dang chay tai: http://localhost:${PORT}`);
});
