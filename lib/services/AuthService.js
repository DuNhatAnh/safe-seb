// Dang nhap admin + token ky HMAC: "<payload base64url>.<chu ky base64url>"
const crypto = require("crypto");
const { UnauthorizedError } = require("../errors");
const { secureCompare } = require("../security/secureCompare");
const { cleanString } = require("../utils/input");

const TOKEN_TTL_MS = 12 * 3600 * 1000;

class AuthService {
  constructor({ config, limiter, now = Date.now }) {
    this.config = config;
    this.limiter = limiter;
    this.now = now;
  }

  login(password, clientIp) {
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
  assertAdmin(authorizationHeader) {
    const m = /^Bearer (.+)$/.exec(authorizationHeader || "");
    const payload = m && this.verify(m[1]);
    if (!payload || payload.role !== "admin") throw new UnauthorizedError("Phiên quản trị hết hạn, vui lòng đăng nhập lại.");
    return payload;
  }

  sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
    return `${body}.${this.signature(body)}`;
  }

  verify(token) {
    const [body, sig] = String(token || "").split(".");
    if (!body || !sig || !secureCompare(sig, this.signature(body))) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, "base64url").toString());
      return payload.exp > this.now() ? payload : null;
    } catch (e) {
      return null;
    }
  }

  signature(body) {
    return crypto.createHmac("sha256", this.config.sessionSecret).update(body).digest("base64url");
  }
}

module.exports = { AuthService };
