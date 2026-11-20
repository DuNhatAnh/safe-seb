// Chong do mat khau: sai maxFails lan -> khoa lockMs.
// windowMs: chi dem cac lan sai lien tiep cach nhau khong qua windowMs (lau khong sai thi dem lai tu dau).
// Luu trong bo nho cua tung tien trinh (tren Vercel moi instance dem rieng -> chi la best effort).
import { TooManyAttemptsError } from "../errors.ts";

interface FailureRecord {
  count: number;
  until: number; // > 0: dang bi khoa toi thoi diem nay
  last: number;  // lan sai gan nhat
}

export interface RateLimiterOptions {
  maxFails?: number;
  lockMs?: number;
  windowMs?: number;
  now?: () => number;
}

export class RateLimiter {
  readonly maxFails: number;
  readonly lockMs: number;
  readonly windowMs: number;
  private readonly now: () => number;
  private readonly failures = new Map<string, FailureRecord>();

  constructor({ maxFails = 5, lockMs = 5 * 60 * 1000, windowMs = Infinity, now = Date.now }: RateLimiterOptions = {}) {
    this.maxFails = maxFails;
    this.lockMs = lockMs;
    this.windowMs = windowMs;
    this.now = now;
  }

  get lockMinutes(): number { return Math.round(this.lockMs / 60000); }

  // Nem loi neu key dang bi khoa
  assertNotLocked(key: string): void {
    const f = this.failures.get(key);
    if (f && f.until > this.now()) {
      throw new TooManyAttemptsError(`Nhập sai quá nhiều lần. Thử lại sau ${Math.ceil((f.until - this.now()) / 60000)} phút.`);
    }
  }

  // Ghi 1 lan sai, tra ve so lan thu con lai (0 = vua bi khoa)
  recordFailure(key: string): number {
    const now = this.now();
    const f = this.failures.get(key) ?? { count: 0, until: 0, last: now };
    const expired = (f.until && f.until <= now) || now - f.last > this.windowMs;
    f.count = expired ? 1 : f.count + 1;
    f.last = now;
    f.until = f.count >= this.maxFails ? this.now() + this.lockMs : 0;
    this.failures.set(key, f);
    return Math.max(0, this.maxFails - f.count);
  }

  reset(key: string): void {
    this.failures.delete(key);
  }
}
