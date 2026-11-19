// Dang nhap admin + token ky HMAC: "<payload base64url>.<chu ky base64url>"
import crypto from "node:crypto";
import type { Config } from "../config.ts";
import { UnauthorizedError } from "../errors.ts";
import type { RateLimiter } from "../security/RateLimiter.ts";
import { secureCompare } from "../security/secureCompare.ts";
import { cleanString } from "../utils/input.ts";

const TOKEN_TTL_MS = 12 * 3600 * 1000;

export interface TokenPayload {
  role: "admin";
  exp: number;
}

export interface AuthServiceDeps {
  config: Config;
  limiter: RateLimiter;
  now?: () => number;
}

export class AuthService {
  private readonly config: Config;
  private readonly limiter: RateLimiter;
  private readonly now: () => number;

  constructor({ config, limiter, now = Date.now }: AuthServiceDeps) {
    this.config = config;
    this.limiter = limiter;
    this.now = now;
  }

  login(password: unknown, clientIp: string): { token: string } {
    this.limiter.assertNotLocked(clientIp);
    if (!secureCompare(cleanString(password, 100), this.config.adminPassword)) {
      const left = this.limiter.recordFailure(clientIp);
      throw new UnauthorizedError(left
        ? `Mật khẩu quản trị viên không chính xác! Còn ${left} lần thử.`
        : `Sai quá nhiều lần, tạm khoá ${this.limiter.lockMinutes} phút.`);
    }
    this.limiter.reset(clientIp);
    return { token: this.sign({ role: "admin", exp: this.now() + TOKEN_TTL_MS }) };
  }

  // Header "Authorization: Bearer <token>" -> nem loi neu khong phai admin hop le
  assertAdmin(authorizationHeader: string | undefined): TokenPayload {
    const m = /^Bearer (.+)$/.exec(authorizationHeader ?? "");
    const payload = m ? this.verify(m[1]) : null;
    if (!payload || payload.role !== "admin") throw new UnauthorizedError("Phiên quản trị hết hạn, vui lòng đăng nhập lại.");
    return payload;
  }

  sign(payload: TokenPayload): string {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.signature(body)}`;
  }

  verify(token: string): TokenPayload | null {
    const [body, sig] = String(token ?? "").split(".");
    if (!body || !sig || !secureCompare(sig, this.signature(body))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString()) as Partial<TokenPayload>;
      return payload.role === "admin" && typeof payload.exp === "number" && payload.exp > this.now()
        ? { role: payload.role, exp: payload.exp }
        : null;
    } catch {
      return null;
    }
  }

  private signature(body: string): string {
    return crypto.createHmac("sha256", this.config.sessionSecret).update(body).digest("base64url");
  }
}
