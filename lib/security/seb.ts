// Nhan dien Safe Exam Browser: SEB (Windows / macOS / iOS) luon them "SEB/<phien ban>" vao User-Agent.
// Day la kiem tra muc co ban (trinh duyet thuong bi chan); User-Agent co the bi gia mao bang cong cu chuyen dung.
export function isSebUserAgent(userAgent: string | undefined): boolean {
  return /\bSEB\/\d/.test(userAgent ?? "");
}
