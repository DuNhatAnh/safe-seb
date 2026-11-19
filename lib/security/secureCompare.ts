// So sanh chuoi chong timing attack (bam truoc de 2 ben cung do dai)
import crypto from "node:crypto";

export function secureCompare(a: string, b: string): boolean {
  const ha = crypto.createHash("sha256").update(String(a)).digest();
  const hb = crypto.createHash("sha256").update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}
