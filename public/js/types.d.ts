// Khai bao kieu cho kiem tra JS trinh duyet (tsconfig.web.json). Khong duoc nap vao trang.

// Cau noi do app Android (KioskBridge.kt) gan vao WebView
interface Window {
  KioskBridge?: { startLock(): void; stopLock(): void };
  katex?: { renderToString(tex: string, options?: object): string };
  webkitRequestFullscreen?: () => Promise<void>;
}

// Code goi .value / .disabled / .select() tren ket qua getElementById / querySelector.
// Tra `any` de tsc khong bao nhieu hang tram cho; loi that (sai ten ham, sai bien) van bi bat.
interface Document {
  webkitFullscreenElement?: Element | null;
  webkitExitFullscreen?: () => void;
  getElementById(elementId: string): any;
  querySelector(selectors: string): any;
  querySelectorAll(selectors: string): any;
}

interface Element {
  querySelector(selectors: string): any;
  querySelectorAll(selectors: string): any;
  closest(selectors: string): any;
}

interface EventTarget {
  closest?(selectors: string): any;
  tagName?: string;
  value?: string;
  dataset?: DOMStringMap;
}

interface HTMLElement {
  webkitRequestFullscreen?: () => Promise<void>;
}

// Keyboard Lock API (Chrome/Edge), chua co trong lib dom
interface Navigator {
  keyboard?: { lock(keys?: string[]): Promise<void>; unlock(): void };
}

// app.js co nhanh `module.exports` cho Node
declare var module: { exports: unknown } | undefined;
