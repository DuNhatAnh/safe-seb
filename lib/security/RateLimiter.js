// Chong do mat khau: sai maxFails lan -> khoa lockMs.
// Luu trong bo nho cua tung tien trinh (tren Vercel moi instance dem rieng -> chi la best effort).
const { TooManyAttemptsError } = require("../errors");

class RateLimiter {
  constructor({ maxFails = 5, lockMs = 5 * 60 * 1000, now = Date.now } = {}) {
    this.maxFails = maxFails;
    this.lockMs = lockMs;
    this.now = now;
    this.failures = new Map(); // key -> { count, until }
  }

  get lockMinutes() { return Math.round(this.lockMs / 60000); }

  // Nem loi neu key dang bi khoa
  assertNotLocked(key) {
    const f = this.failures.get(key);
    if (f && f.until > this.now()) {
      throw new TooManyAttemptsError(`Nhập sai quá nhiều lần. Thử lại sau ${Math.ceil((f.until - this.now()) / 60000)} phút.`);
    }
  }

  // Ghi 1 lan sai, tra ve so lan thu con lai (0 = vua bi khoa)
  recordFailure(key) {
    const f = this.failures.get(key) || { count: 0, until: 0 };
    f.count = f.until && f.until <= this.now() ? 1 : f.count + 1;
    f.until = f.count >= this.maxFails ? this.now() + this.lockMs : 0;
    this.failures.set(key, f);
    return Math.max(0, this.maxFails - f.count);
  }

  reset(key) {
    this.failures.delete(key);
  }
}

module.exports = { RateLimiter };
