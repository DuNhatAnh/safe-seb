// Doc tham so phan trang tu client (chua tin tuong): page bat dau tu 1, size gioi han
export interface PageRequest {
  page: number;
  size: number;
  offset: number;
}

export function parsePage(page: unknown, size: unknown, defaultSize = 3, maxSize = 50): PageRequest {
  const p = Math.max(1, Math.min(10_000, parseInt(String(page), 10) || 1));
  const s = Math.max(1, Math.min(maxSize, parseInt(String(size), 10) || defaultSize));
  return { page: p, size: s, offset: (p - 1) * s };
}
