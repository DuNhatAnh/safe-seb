/// <reference lib="dom" />  // page.evaluate() chay trong trinh duyet
// Ham dung chung cho test giao dien
import { expect, type Page } from "@playwright/test";
import { ADMIN_PASSWORD, MOCK_URL } from "./env.ts";
import { SERVICE_KEY } from "./mockSupabase.ts";

type Row = Record<string, unknown>;
export interface DbState {
  exams: Row[];
  exam_results: Row[];
  exam_events: Row[];
  app_settings: Row[];
}

// ------------------------------------------------------------ Du lieu (Supabase gia lap)
export async function resetDb(): Promise<void> {
  await fetch(`${MOCK_URL}/__test/reset`, { method: "POST" });
}

export async function seed(table: keyof DbState, rows: Row[]): Promise<Row[]> {
  const res = await fetch(`${MOCK_URL}/__test/seed`, { method: "POST", body: JSON.stringify({ table, rows }) });
  return (await res.json()) as Row[];
}

// Sua 1 dong (vd: bat "khoa bai khi roi trang" cho de) qua REST cua Supabase gia lap
export async function updateRow(table: keyof DbState, id: unknown, patch: Row): Promise<void> {
  await fetch(`${MOCK_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: "PATCH",
    headers: { apikey: SERVICE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export async function dbState(): Promise<DbState> {
  return (await (await fetch(`${MOCK_URL}/__test/state`)).json()) as DbState;
}

// ------------------------------------------------------------ Hop thoai alert / confirm
// Playwright mac dinh bam "Huy" moi confirm -> nop bai / xuat ban se khong chay. Ghi lai noi dung de kiem tra.
export function acceptDialogs(page: Page): string[] {
  const messages: string[] = [];
  page.on("dialog", dialog => {
    messages.push(dialog.message());
    void dialog.accept();
  });
  return messages;
}

// ------------------------------------------------------------ Dang nhap
export async function loginAdmin(page: Page, password = ADMIN_PASSWORD): Promise<void> {
  await page.goto("/index.html");
  await page.locator("#username").fill("admin");
  await page.locator("#submitBtn").click();
  await page.locator("#password").fill(password);
  await page.locator("#submitBtn").click();
}

export async function loginStudent(page: Page, name: string): Promise<void> {
  await page.goto("/index.html");
  await page.locator("#username").fill(name);
  await page.locator("#submitBtn").click();
  await expect(page).toHaveURL(/exam\.html\?user=/);
}

// ------------------------------------------------------------ Admin: nhap de JSON
export async function importJson(page: Page, data: unknown): Promise<void> {
  await page.getByRole("button", { name: "Nhập JSON" }).click();
  await page.locator("#jsonInputArea").fill(typeof data === "string" ? data : JSON.stringify(data, null, 2));
  await page.getByRole("button", { name: "Nhập đề thi" }).click();
}

// ------------------------------------------------------------ Thi sinh: tra loi 1 cau theo dang
export type StudentAnswer =
  | { kind: "option"; index: number }
  | { kind: "tf"; values: boolean[] }
  | { kind: "text"; value: string }
  | { kind: "skip" };

export async function answerCurrent(page: Page, answer: StudentAnswer): Promise<void> {
  const box = page.locator("#optionsContainer");
  switch (answer.kind) {
    case "option":
      await box.locator(`.option-item[data-ans="${answer.index}"]`).click();
      break;
    case "tf":
      for (const [i, v] of answer.values.entries()) await box.locator(`[data-ans="${i}:${v ? 1 : 0}"]`).click();
      break;
    case "text":
      await box.locator("[data-ans=input]").fill(answer.value);
      await box.locator("[data-ans=input]").blur();
      break;
    case "skip":
      break;
  }
}

// ------------------------------------------------------------ Mo phong thi sinh roi / quay lai bai thi
// Trinh duyet headless khong Alt+Tab duoc -> gia lap trang thai "tab bi an" giong khi chuyen cua so.
async function setHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate(h => {
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

export const leaveExam = (page: Page): Promise<void> => setHidden(page, true);
export const returnToExam = (page: Page): Promise<void> => setHidden(page, false);
