// Hot reload khi phat trien (chi bat voi `npm run dev`, khong bao gio chay tren production / Vercel).
//  - Sua file trong public/: trinh duyet tu tai lai (sua .css: chi thay stylesheet, khong mat trang thai).
//  - Sua server.js / lib/ / .env: `node --watch` khoi dong lai server, trinh duyet tu tai lai khi ket noi lai.
const fs = require("fs");
const path = require("path");

const ENDPOINT = "/__dev/reload";
const CLIENT_SCRIPT = `<script>
(() => {
  let wasConnected = false;
  const reload = () => {
    // Dang lam bai: tat lockdown de khong hien hop thoai "roi trang"; ban nhap da duoc luu
    if (window.Lockdown && Lockdown.active) Lockdown.stop();
    location.reload();
  };
  const connect = () => {
    const es = new EventSource("${ENDPOINT}");
    es.onopen = () => { if (wasConnected) reload(); wasConnected = true; }; // server vua khoi dong lai
    es.addEventListener("reload", reload);
    es.addEventListener("css", () => {
      document.querySelectorAll('link[rel="stylesheet"]').forEach(l => {
        const url = new URL(l.href);
        url.searchParams.set("v", Date.now());
        l.href = url.toString();
      });
    });
    es.onerror = () => { es.close(); setTimeout(connect, 500); };
  };
  connect();
  console.info("[dev] hot reload đang bật");
})();
</script>`;

function createDevReload(publicDir) {
  const clients = new Set();
  let timer = null;
  let pending = new Set();

  const broadcast = event => {
    for (const res of clients) res.write(`event: ${event}\ndata: ${Date.now()}\n\n`);
  };

  // Gom nhieu su kien luu file (editor ghi nhieu lan) thanh 1 lan tai lai
  fs.watch(publicDir, { recursive: true }, (type, file) => {
    if (!file) return;
    pending.add(path.extname(file).toLowerCase());
    clearTimeout(timer);
    timer = setTimeout(() => {
      const onlyCss = [...pending].every(ext => ext === ".css");
      pending = new Set();
      console.log(`[dev] ${file} thay đổi -> ${onlyCss ? "nạp lại CSS" : "tải lại trang"}`);
      broadcast(onlyCss ? "css" : "reload");
    }, 120);
  });

  // Giu ket noi song qua proxy / sleep
  setInterval(() => { for (const res of clients) res.write(": ping\n\n"); }, 25000).unref();

  return {
    // true neu request da duoc xu ly
    handle(req, res) {
      if (req.url.split("?")[0] !== ENDPOINT) return false;
      res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", Connection: "keep-alive" });
      res.write("retry: 500\n\n");
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return true;
    },

    // Chen script vao trang HTML
    inject(html) {
      return html.includes("</body>") ? html.replace("</body>", `${CLIENT_SCRIPT}\n</body>`) : html + CLIENT_SCRIPT;
    }
  };
}

module.exports = { createDevReload };
