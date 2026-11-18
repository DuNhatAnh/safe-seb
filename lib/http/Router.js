// Dinh tuyen /api/*, doc body JSON, doi loi nghiep vu (AppError.status) thanh ma HTTP.
// req.url: /api/<route>?... (local) hoac /api/index?path=<route>&... (Vercel rewrite, xem vercel.json)
const { NotFoundError, ValidationError, PayloadTooLargeError } = require("../errors");

const MAX_BODY = 8 * 1024 * 1024; // de thi co anh nhung base64

class Router {
  constructor() {
    this.routes = new Map(); // "METHOD route" -> handler(ctx)
  }

  get(route, handler) { return this.on("GET", route, handler); }
  post(route, handler) { return this.on("POST", route, handler); }

  on(method, route, handler) {
    this.routes.set(`${method} ${route}`, handler);
    return this;
  }

  // Ham (req, res) dung cho http.createServer va Vercel
  handle = async (req, res) => {
    try {
      const url = new URL(req.url, "http://localhost");
      const route = (url.searchParams.get("path") || url.pathname.replace(/^\/api\/?/, "")).replace(/\/$/, "");
      const handler = this.routes.get(`${req.method} ${route}`);
      if (!handler) throw new NotFoundError("API không tồn tại.");
      const body = req.method === "POST" ? await Router.readBody(req) : {};
      const ctx = { req, query: url.searchParams, body: body || {}, ip: Router.clientIp(req) };
      Router.send(res, 200, await handler(ctx));
    } catch (err) {
      const status = err.status || 500;
      if (status >= 500) console.error("[api]", err);
      Router.send(res, status, { error: err.message, ...(err.extra || {}) });
    }
  };

  static async readBody(req) {
    if (req.body !== undefined) {
      // Vercel tu parse JSON
      return typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    }
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks = [];
      req.on("data", c => {
        size += c.length;
        if (size > MAX_BODY) { reject(new PayloadTooLargeError("Dữ liệu gửi lên quá lớn.")); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => {
        try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}); }
        catch (e) { reject(new ValidationError("JSON không hợp lệ.")); }
      });
      req.on("error", reject);
    });
  }

  static send(res, status, data) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data));
  }

  static clientIp(req) {
    return String(req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "").split(",")[0].trim();
  }
}

module.exports = { Router };
