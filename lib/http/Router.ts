// Dinh tuyen /api/*, doc body JSON, doi loi nghiep vu (AppError.status) thanh ma HTTP.
// req.url: /api/<route>?... (local) hoac /api/index?path=<route>&... (Vercel rewrite, xem vercel.json)
import type { IncomingMessage, ServerResponse } from "node:http";
import { AppError, NotFoundError, PayloadTooLargeError, ValidationError } from "../errors.ts";
import { isSebUserAgent } from "../security/seb.ts";
import type { ClientInfo, UntrustedBody } from "../types.ts";

const MAX_BODY = 8 * 1024 * 1024; // de thi co anh nhung base64

// Vercel gan san req.body (da parse JSON)
export type ApiRequest = IncomingMessage & { body?: unknown };

export interface RouteContext {
  req: ApiRequest;
  query: URLSearchParams;
  body: UntrustedBody;
  ip: string;
  client: ClientInfo;
}

// Handler tra ve doi tuong nay -> gui nguyen van (vd: file .seb), khong boc JSON
export class RawResponse {
  readonly body: string;
  readonly headers: Record<string, string>;

  constructor(body: string, headers: Record<string, string>) {
    this.body = body;
    this.headers = headers;
  }
}

export type RouteHandler = (ctx: RouteContext) => unknown;

export class Router {
  private readonly routes = new Map<string, RouteHandler>();

  get(route: string, handler: RouteHandler): this { return this.on("GET", route, handler); }
  post(route: string, handler: RouteHandler): this { return this.on("POST", route, handler); }

  on(method: string, route: string, handler: RouteHandler): this {
    this.routes.set(`${method} ${route}`, handler);
    return this;
  }

  // Ham (req, res) dung cho http.createServer va Vercel
  handle = async (req: ApiRequest, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? "/", "http://localhost");
      const route = (url.searchParams.get("path") ?? url.pathname.replace(/^\/api\/?/, "")).replace(/\/$/, "");
      const handler = this.routes.get(`${req.method} ${route}`);
      if (!handler) throw new NotFoundError("API không tồn tại.");
      const body = req.method === "POST" ? await Router.readBody(req) : {};
      const ctx: RouteContext = { req, query: url.searchParams, body, ip: Router.clientIp(req), client: Router.clientInfo(req) };
      const result = await handler(ctx);
      if (result instanceof RawResponse) {
        res.writeHead(200, { "Cache-Control": "no-store", ...result.headers });
        res.end(result.body);
        return;
      }
      Router.send(res, 200, result);
    } catch (err) {
      const status = err instanceof AppError ? err.status : 500;
      if (status >= 500) console.error("[api]", err);
      const message = err instanceof Error ? err.message : String(err);
      Router.send(res, status, { error: message, ...(err instanceof AppError ? err.extra : {}) });
    }
  };

  static async readBody(req: ApiRequest): Promise<UntrustedBody> {
    if (req.body !== undefined) {
      // Vercel tu parse JSON
      const parsed = typeof req.body === "string" ? Router.parseJson(req.body || "{}") : req.body;
      return Router.asObject(parsed);
    }
    return new Promise((resolve, reject) => {
      let size = 0;
      const chunks: Buffer[] = [];
      req.on("data", (c: Buffer) => {
        size += c.length;
        if (size > MAX_BODY) { reject(new PayloadTooLargeError("Dữ liệu gửi lên quá lớn.")); req.destroy(); return; }
        chunks.push(c);
      });
      req.on("end", () => {
        try { resolve(Router.asObject(chunks.length ? Router.parseJson(Buffer.concat(chunks).toString("utf8")) : {})); }
        catch (e) { reject(e); }
      });
      req.on("error", reject);
    });
  }

  private static parseJson(text: string): unknown {
    try { return JSON.parse(text); } catch { throw new ValidationError("JSON không hợp lệ."); }
  }

  // Body phai la object JSON ({...}); mang / so / null -> loi 400
  private static asObject(v: unknown): UntrustedBody {
    if (!v || typeof v !== "object" || Array.isArray(v)) throw new ValidationError("Dữ liệu gửi lên phải là object JSON.");
    return v as UntrustedBody;
  }

  static send(res: ServerResponse, status: number, data: unknown): void {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(data ?? null));
  }

  // IP de chong do mat khau. X-Forwarded-For do client tu dat duoc -> chi tin khi chay sau proxy
  // that (Vercel tu ghi de header nay, hoac TRUST_PROXY=1 khi dat sau nginx...). Chay thang: dung IP socket.
  static clientIp(req: IncomingMessage, trustProxy = Router.behindProxy()): string {
    const forwarded = req.headers["x-forwarded-for"];
    const header = Array.isArray(forwarded) ? forwarded[0] : forwarded;
    const raw = (trustProxy && header) || req.socket?.remoteAddress || "";
    return raw.split(",")[0].trim();
  }

  // Dia chi goc cua trang: APP_URL (neu dat) > header proxy (Vercel) > Host
  static clientInfo(req: IncomingMessage, trustProxy = Router.behindProxy()): ClientInfo {
    const header = (name: string): string | undefined => {
      const v = req.headers[name];
      return (Array.isArray(v) ? v[0] : v)?.trim() || undefined;
    };
    // Header proxy co the la danh sach "a, b" -> lay gia tri dau. KHONG cat User-Agent: "(KHTML, like Gecko)" co dau phay.
    const first = (name: string): string | undefined => header(name)?.split(",")[0].trim() || undefined;
    const host = (trustProxy && first("x-forwarded-host")) || header("host") || "localhost";
    const proto = (trustProxy && first("x-forwarded-proto")) || "http";
    const origin = (process.env.APP_URL || `${proto}://${host}`).replace(/\/$/, "");
    return { isSeb: isSebUserAgent(header("user-agent")), origin };
  }

  static behindProxy(): boolean {
    return !!process.env.VERCEL || process.env.TRUST_PROXY === "1";
  }
}
