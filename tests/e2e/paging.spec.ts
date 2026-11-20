// Phan trang phia server: danh sach de + lich su (3 / trang, moi nhat truoc), tim kiem; admin loc ket qua theo ngay
import { expect, test } from "@playwright/test";
import { acceptDialogs, dbState, loginAdmin, loginStudent, resetDb, seed } from "./support/helpers.ts";

const LONG_TITLE = "Toán 11 - giữa kì I - THPT Lương Ngọc Quyến, Thái Nguyên (2024-2025) - Mã đề 101";

test.beforeEach(async () => {
  await resetDb();
});

test("học sinh: danh sách đề 3 / trang, mới nhất trước, tìm theo tên (chỉ tải trang đang xem)", async ({ page }) => {
  await seed("exams", ["Toán 10 - đề A", "Lý 11", LONG_TITLE, "Hoá 12", "Toán 12 cuối kì"]
    .map(title => ({ title, duration_minutes: 45, questions: [] })));
  const examRequests: string[] = [];
  page.on("request", r => { if (r.url().includes("/api/exams")) examRequests.push(r.url()); });

  await loginStudent(page, "hs_phan_trang");
  const titles = page.locator(".exam-card-title");
  await expect(titles).toHaveText(["Toán 12 cuối kì", "Hoá 12", LONG_TITLE]);
  await expect(page.locator("#examPager")).toContainText("Trang 1/2 · 5 mục");

  await page.locator("#examPager").getByRole("button", { name: "Sau ›" }).click();
  await expect(titles).toHaveText(["Lý 11", "Toán 10 - đề A"]);

  await page.locator("#examSearch").fill("toán");
  await expect(titles).toHaveText(["Toán 12 cuối kì", LONG_TITLE, "Toán 10 - đề A"]);
  await expect(page.locator("#examPager")).toContainText("3 mục");
  // Moi lan chi xin 3 de tu server
  expect(examRequests.length).toBeGreaterThan(0);
  expect(examRequests.every(u => /size=3/.test(u))).toBe(true);

  // Ten dai hien day du (xuong dong, khong bi cat)
  const box = await titles.nth(1).evaluate(el => ({ scroll: el.scrollWidth, client: el.clientWidth }));
  expect(box.scroll).toBeLessThanOrEqual(box.client + 1);
});

test("học sinh: lịch sử từng đề trong modal, 3 lần / trang, mới nhất trước", async ({ page }) => {
  const [exam] = await seed("exams", [{ title: "Đề lịch sử", duration_minutes: 10, questions: [] }]);
  await seed("exam_results", [1, 2, 3, 4].map(i => ({ exam_id: exam.id, student_name: "hs_lich_su", score: i, answers: [], duration_minutes: i, submitted_at: `2026-11-1${i}T08:00:00Z` })));
  await loginStudent(page, "hs_lich_su");
  await page.locator(".card", { hasText: "Đề lịch sử" }).getByRole("button", { name: "Lịch sử", exact: true }).click();
  await expect(page.locator("#historyTitle")).toContainText("Đề lịch sử");
  const rows = page.locator("#historyContainer tbody tr");
  await expect(rows).toHaveCount(3);
  await expect(rows.first()).toContainText("4/10");
  await expect(page.locator("#historyPager")).toContainText("Trang 1/2 · 4 mục");
  await page.locator("#historyPager").getByRole("button", { name: "Sau ›" }).click();
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText("1/10");
});

test("admin: kết quả mặc định lọc hôm nay; đổi ngày / tên thí sinh / mã đề", async ({ page }) => {
  acceptDialogs(page);
  const [exam] = await seed("exams", [{ title: "Đề lọc kết quả", duration_minutes: 10, questions: [] }]);
  const now = new Date().toISOString();
  await seed("exam_results", [
    { exam_id: exam.id, student_name: "an_hom_nay", score: 8, answers: [], submitted_at: now },
    { exam_id: exam.id, student_name: "binh_hom_nay", score: 6, answers: [], submitted_at: now },
    { exam_id: 99999, student_name: "chi_hom_nay_de_khac", score: 5, answers: [], submitted_at: now },
    { exam_id: exam.id, student_name: "dung_tuan_truoc", score: 9, answers: [], submitted_at: "2026-01-02T03:00:00Z" }
  ]);
  await loginAdmin(page);
  await page.locator('.sidebar-item[data-page="pageResults"]').click();
  const rows = page.locator("#resultsTableBody tr");
  await expect(rows).toHaveCount(3); // mac dinh: hom nay
  await expect(page.locator("#resultsTableBody")).not.toContainText("dung_tuan_truoc");
  await expect(page.locator("#resultsTableBody")).toContainText("Đề lọc kết quả");

  await page.locator("#filterStudent").fill("binh");
  await expect(rows).toHaveCount(1);
  await page.locator("#filterStudent").fill("");
  await page.locator("#filterExam").fill(String(exam.id));
  await expect(rows).toHaveCount(2);

  await page.getByRole("button", { name: "Tất cả ngày" }).click();
  await expect(rows).toHaveCount(3);
  await expect(page.locator("#resultsTableBody")).toContainText("dung_tuan_truoc");
  expect((await dbState()).exam_results).toHaveLength(4);
});
