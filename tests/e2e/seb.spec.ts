// Safe Exam Browser: admin bat bat buoc SEB; trinh duyet thuong bi chan; trong SEB lam bai + thoat -> SEB tu dong.
// SEB that them "SEB/<phien ban>" vao User-Agent -> gia lap bang userAgent cua Playwright.
import { expect, test } from "@playwright/test";
import { APP_URL, PROCTOR_PASSWORD } from "./support/env.ts";
import { FULL_EXAM, FULL_EXAM_RIGHT } from "./support/fixtures.ts";
import { acceptDialogs, answerCurrent, dbState, loginAdmin, loginStudent, resetDb, seed } from "./support/helpers.ts";

const SEB_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 SEB/3.7.1";

let examId: number;

test.beforeEach(async () => {
  await resetDb();
  [{ id: examId }] = (await seed("exams", [{ ...FULL_EXAM, require_seb: true }])) as { id: number }[];
});

test("admin: bật bắt buộc SEB, lấy link seb:// và file .seb", async ({ page, request }) => {
  await resetDb();
  const [exam] = await seed("exams", [{ ...FULL_EXAM, title: "Đề thường" }]);
  acceptDialogs(page);
  await loginAdmin(page);

  const row = page.locator("#examTableBody tr", { hasText: "Đề thường" });
  await row.getByRole("button", { name: "SEB" }).click();
  const modal = page.locator("#sebModal");
  await expect(modal.locator("#sebLink")).toHaveValue(`seb://localhost:3100/api/seb-config?exam_id=${exam.id}`);
  await expect(modal.locator("#sebQuitPassword")).toHaveText(/^\S{16,}$/);

  await modal.locator("#sebRequire").check();
  await expect(row).toContainText("Bắt buộc SEB");
  expect((await dbState()).exams[0].require_seb).toBe(true);

  // File .seb tai duoc, la plist SEB, khong lo mat khau thoat
  const password = await modal.locator("#sebQuitPassword").textContent();
  const res = await request.get(await modal.locator("#sebDownload").getAttribute("href") ?? "");
  expect(res.headers()["content-type"]).toContain("application/seb");
  const xml = await res.text();
  expect(xml).toContain("<key>startURL</key>");
  expect(xml).toContain(`${APP_URL}/index.html`);
  expect(xml).not.toContain(password ?? "x");
});

test("trình duyệt thường: đề bắt buộc SEB chỉ có nút mở bằng SEB, API từ chối", async ({ page, request }) => {
  await loginStudent(page, "hs_trinh_duyet");
  const card = page.locator(".card", { hasText: FULL_EXAM.title });
  await expect(card).toContainText("Bắt buộc Safe Exam Browser");
  await expect(card.getByRole("link", { name: "Mở bằng Safe Exam Browser" })).toHaveAttribute("href", `seb://localhost:3100/api/seb-config?exam_id=${examId}`);
  await expect(card.getByRole("button", { name: "Vào làm bài" })).toHaveCount(0);

  // Goi thang API cung bi chan (khong chi an nut)
  const res = await request.get(`/api/exam?id=${examId}&student=hs_trinh_duyet`);
  expect(res.status()).toBe(403);
  expect(await res.json()).toMatchObject({ needsSeb: true });
});

test("trong SEB: làm bài được, không đòi toàn màn hình; giám thị cho thoát khẩn cấp → về danh sách đề (SEB không đóng)", async ({ browser }) => {
  const page = await (await browser.newContext({ userAgent: SEB_UA })).newPage();
  await loginStudent(page, "hs_seb");
  await page.locator(".card", { hasText: FULL_EXAM.title }).getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#viewShield")).toBeHidden(); // SEB tu khoa may, khong can toan man hinh cua trinh duyet

  await page.getByRole("button", { name: "Thoát khẩn cấp (Giám thị)" }).first().click();
  await page.locator("#proctorInput").fill(PROCTOR_PASSWORD);
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamList")).toBeVisible();
  await expect(page).toHaveURL(/exam\.html\?user=hs_seb/);
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).toContainText("Đang làm dở");
  expect((await dbState()).exam_events.map(e => e.type)).toEqual(["THOAT_KHAN_CAP"]);
});

test("trong SEB: nộp bài xong có thêm nút \"Thoát Safe Exam Browser\" (không cần mật khẩu) → SEB tự đóng", async ({ browser }) => {
  const page = await (await browser.newContext({ userAgent: SEB_UA })).newPage();
  acceptDialogs(page);
  await loginStudent(page, "hs_seb_nop");
  await page.locator(".card", { hasText: FULL_EXAM.title }).getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  for (const [i, a] of FULL_EXAM_RIGHT.entries()) {
    await page.locator(".q-nav-btn").nth(i).click();
    await answerCurrent(page, a);
  }
  await page.locator("#btnSubmit").click();
  const done = page.locator("#viewLockScreen");
  await expect(done).toBeVisible();
  await expect(done.getByRole("button")).toHaveText(["Xem lịch sử làm bài", "Về trang đề thi", "Thoát Safe Exam Browser"]);
  await done.getByRole("button", { name: "Thoát Safe Exam Browser" }).click();
  await expect(page).toHaveURL(new RegExp(`/seb-quit\\.html\\?exam=${examId}&k=`));
  await expect(page.locator(".lock-title")).toHaveText("ĐANG THOÁT");
  // Trang thoat dung bang quitURL trong file .seb cua de
  const xml = await (await page.request.get(`/api/seb-config?exam_id=${examId}`)).text();
  expect(xml.replace(/&amp;/g, "&")).toContain(page.url());
});
