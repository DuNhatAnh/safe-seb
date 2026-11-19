// Ma giam thi 6 so ngau nhien (crypto, khong doan truoc duoc)
import crypto from "node:crypto";

export const PROCTOR_CODE_LENGTH = 6;

export function generateProctorCode(): string {
  return String(crypto.randomInt(0, 10 ** PROCTOR_CODE_LENGTH)).padStart(PROCTOR_CODE_LENGTH, "0");
}

export const isProctorCode = (v: unknown): v is string => typeof v === "string" && /^\d{6}$/.test(v);
