// Chuc nang quan trong 1: admin dang nhap, nhap de bang JSON, xuat ban
import { expect, test } from "@playwright/test";
import { PROCTOR_PASSWORD } from "./support/env.ts";
import { IMPORT_JSON, IMPORT_JSON_NEW_STRUCTURE } from "./support/fixtures.ts";
import { acceptDialogs, dbState, importJson, loginAdmin, resetDb, seed } from "./support/helpers.ts";

test.beforeEach(async () => {
  await resetDb();
});

test("sai mật khẩu admin thì không vào được trang quản trị", async ({ page }) => {
  await loginAdmin(page, "mat-khau-sai");
  await expect(page.locator("#loginErrorBox")).toContainText("không chính xác");
  await expect(page).toHaveURL(/index\.html/);
});

test("trang admin không có token thì bị đẩy về đăng nhập", async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await page.goto("/admin.html");
  await expect(page).toHaveURL(/index\.html/);
  expect(dialogs.join(" ")).toContain("đăng nhập");
});

test("nhập đề JSON → xem trước → xuất bản → lưu vào DB kèm đáp án", async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await loginAdmin(page);
  await expect(page).toHaveURL(/admin\.html/);

  await importJson(page, IMPORT_JSON);

  // Tu nhan dien mau "Trac nghiem + Tu luan ngan", tu dien tieu de + thoi gian
  await expect(page.locator("#uploadStatus")).toContainText("Đã nhập 3 câu hỏi");
  await expect(page.locator("#examTitle")).toHaveValue(IMPORT_JSON.title);
  await expect(page.locator("#examDuration")).toHaveValue("15");
  await expect(page.locator("#previewCount")).toHaveText("3");
  await expect(page.locator("#previewErrors")).toBeHidden();
  // KaTeX da render cong thuc
  await expect(page.locator("#previewList .katex").first()).toBeVisible();

  await page.locator("#btnSaveExam").click();
  await expect.poll(() => dialogs.join(" ")).toContain("Đã xuất bản đề thi");

  // Danh sach de + DB
  await expect(page.locator("#examTableBody")).toContainText(IMPORT_JSON.title);
  const { exams } = await dbState();
  expect(exams).toHaveLength(1);
  expect(exams[0]).toMatchObject({ title: IMPORT_JSON.title, duration_minutes: 15 });
  expect(exams[0].proctor_code).toMatch(/^\d{6}$/); // server tu gan mat khau rieng 6 so cua de
  const questions = exams[0].questions as Record<string, unknown>[];
  expect(questions).toHaveLength(3);
  expect(questions[0]).toMatchObject({ type: "single", part: 0 });
  expect(questions[2]).toMatchObject({ type: "essay", part: 1, answers: ["2"] });
});

test("JSON có cấu trúc mới → xác nhận mẫu → xuất bản, mẫu được lưu", async ({ page }) => {
  const dialogs = acceptDialogs(page);
  await loginAdmin(page);
  await importJson(page, IMPORT_JSON_NEW_STRUCTURE);

  const modal = page.locator("#detectTplModal");
  await expect(modal).toBeVisible();
  await modal.locator("#detectTplName").fill("Mẫu E2E đúng sai + ngắn");
  await modal.getByRole("button", { name: "Lưu mẫu & nhập đề" }).click();

  await expect(page.locator("#uploadStatus")).toContainText("Đã tạo cấu trúc mới");
  await page.locator("#btnSaveExam").click();
  await expect.poll(() => dialogs.join(" ")).toContain("Đã xuất bản đề thi");

  const state = await dbState();
  expect(state.exams[0]).toMatchObject({ title: IMPORT_JSON_NEW_STRUCTURE.title });
  const templates = state.app_settings.find(s => s.key === "exam_templates")?.value as { name: string }[];
  expect(templates.map(t => t.name)).toContain("Mẫu E2E đúng sai + ngắn");
});

test("JSON hỏng hoặc sai dữ liệu thì báo lỗi, không xuất bản", async ({ page }) => {
  await loginAdmin(page);

  await importJson(page, "{ \"title\": \"thiếu ngoặc\" ");
  await expect(page.locator("#jsonModalError")).toContainText("JSON không hợp lệ");

  // Trac nghiem khong co dap an dung
  await page.locator("#jsonInputArea").fill(JSON.stringify({
    title: "Sai dữ liệu",
    parts: [{ type: "single", questions: [{ question: "?", options: [{ text: "a" }, { text: "b" }] }] }]
  }));
  await page.getByRole("button", { name: "Nhập đề thi" }).click();
  await expect(page.locator("#jsonModalError")).toBeVisible();
  await expect(page.locator("#previewSection")).toBeHidden();
  expect((await dbState()).exams).toHaveLength(0);
});

test("icon chìa khoá: xem mật khẩu riêng của đề + mật khẩu chung, đổi mật khẩu riêng; bật / tắt cho làm lại nhiều lần (mặc định tắt)", async ({ page }) => {
  acceptDialogs(page);
  const [exam] = await seed("exams", [{ title: "Đề có mã", duration_minutes: 10, questions: [], proctor_code: "111222" }]);
  await loginAdmin(page);

  const row = page.locator("#examTableBody tr", { hasText: "Đề có mã" });
  await row.getByRole("button", { name: `Mật khẩu đề #${exam.id}` }).click();
  const code = page.locator("#proctorCodeValue");
  await expect(code).toHaveText("111222");
  await expect(page.locator("#commonPasswordValue")).toHaveText(PROCTOR_PASSWORD);
  await page.getByRole("button", { name: "Đổi mật khẩu riêng" }).click();
  await expect(code).toHaveText(/^\d{6}$/);
  await expect(code).not.toHaveText("111222");
  expect((await dbState()).exams[0].proctor_code).toBe(await code.textContent());

  const retake = page.locator("#allowRetakeEnabled");
  await expect(retake).not.toBeChecked();
  await retake.check();
  await expect(row).toContainText("Làm lại tối đa 3 lần");
  expect((await dbState()).exams[0].allow_retake).toBe(true);
  await retake.uncheck();
  await expect(row).not.toContainText("Làm lại tối đa 3 lần");
  expect((await dbState()).exams[0].allow_retake).toBe(false);
});
