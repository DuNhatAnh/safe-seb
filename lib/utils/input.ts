// Lam sach du lieu client gui len (chua tin tuong)
import type { LogEntry } from "../types.ts";

// Chuoi da trim, cat toi da `max` ky tu
export const cleanString = (v: unknown, max = 200): string => String(v ?? "").trim().slice(0, max);

export const isId = (v: unknown): boolean => /^\d+$/.test(String(v));

// Nhat ky thao tac: chi giu cac truong biet truoc, gioi han so dong va do dai
export function cleanLogs(logs: unknown): LogEntry[] {
  return (Array.isArray(logs) ? logs : []).slice(0, 5000).map((l: Record<string, unknown> | null | undefined) => ({
    time: cleanString(l?.time, 20),
    timestamp: cleanString(l?.timestamp, 40),
    type: cleanString(l?.type, 40),
    detail: cleanString(l?.detail, 500),
    question_index: Number.isInteger(l?.question_index) ? (l?.question_index as number) : null,
    selected_option: l?.selected_option ?? null
  }));
}
