// Lich su phien ban (admin) + chan phien ban cu: app Android cu -> tai app moi; tab cu -> tai lai trang.
// Khong che giua luc dang lam bai.
import { expect, test, type Page } from "@playwright/test";
import { FULL_EXAM, FULL_EXAM_RIGHT } from "./support/fixtures.ts";
import { acceptDialogs, answerCurrent, loginAdmin, loginStudent, resetDb, seed } from "./support/helpers.ts";

test.beforeEach(async () => {
  await resetDb();
});

// Gia lap /api/version (phien ban server + app toi thieu)
async function serverVersion(page: Page, version: () => { version: string; min_app_version: string | null }) {
  await page.route("**/api/version", route => route.fulfill({ json: { commit: "abc1234", ...version() } }));
}

// Gia lap app Android phien ban `app`
async function androidApp(page: Page, app: string) {
  await page.addInitScript(v => {
    const w = window as unknown as { __opened: string[] };
    w.__opened = [];
    Object.assign(window, {
      KioskBridge: {
        startLock() { }, stopLock() { }, unlock() { }, isDeviceOwner: () => false, releaseDevice() { },
        appVersion: () => v, accessibilityServices: () => "", openDownload: (u: string) => { w.__opened.push(u); }
      }
    });
  }, app);
}

test("admin: trang Phiên bản liệt kê lịch sử (mới nhất trước), đánh dấu bản bắt buộc cài lại app", async ({ page }) => {
  await seed("app_versions", [
    { version: "1.2", released_at: "2026-11-20T00:00:00Z", notes: "- Mật khẩu đề", requires_app_update: false },
    { version: "1.10", released_at: "2026-12-01T00:00:00Z", notes: "- **Bàn phím** số\n- `abc`", requires_app_update: true }
  ]);
  await loginAdmin(page);
  await page.getByRole("button", { name: "Phiên bản" }).click();
  const rows = page.locator("#versionTableBody tr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("1.10"); // so theo so: 1.10 > 1.2
  await expect(rows.nth(0)).toContainText("Bắt buộc cài lại app");
  await expect(rows.nth(0).locator("strong", { hasText: "Bàn phím" })).toBeVisible();
  await expect(rows.nth(1)).toContainText("Không cần");
  await expect(page.locator("#versionCurrent")).toContainText("Đang chạy bản");
});

test("app Android cũ hơn bản tối thiểu: chặn ngay trang đăng nhập, nút tải app mới mở /tai-app", async ({ page }) => {
  await androidApp(page, "v1.2");
  await serverVersion(page, () => ({ version: "1.3", min_app_version: "1.3" }));
  await page.goto("/index.html");
  const overlay = page.locator("#updateOverlay");
  await expect(overlay).toBeVisible();
  await expect(overlay).toContainText("CẦN CÀI APP PHIÊN BẢN MỚI");
  await expect(overlay).toContainText("v1.2");
  await overlay.getByRole("button", { name: "Tải app mới" }).click();
  expect(await page.evaluate("window.__opened")).toEqual([new URL("/tai-app", page.url()).href]);
});

test("app Android đủ mới / trình duyệt thường: không chặn", async ({ page, browser }) => {
  await androidApp(page, "v1.3");
  await serverVersion(page, () => ({ version: "1.3", min_app_version: "1.3" }));
  await page.goto("/index.html");
  await expect(page.locator(".app-version")).toContainText("App v1.3");
  await expect(page.locator("#updateOverlay")).toHaveCount(0);

  const web = await browser.newPage();
  await serverVersion(web, () => ({ version: "1.3", min_app_version: "1.3" }));
  await web.goto("/index.html");
  await expect(web.locator(".app-version")).toContainText("Phiên bản 1.3");
  await expect(web.locator("#updateOverlay")).toHaveCount(0);
});

test("tab mở từ bản cũ: có bản mới thì yêu cầu tải lại trang — nhưng KHÔNG che giữa lúc làm bài, nộp xong mới hiện", async ({ page }) => {
  acceptDialogs(page);
  await seed("exams", [FULL_EXAM]);
  let version = "1.3";
  await serverVersion(page, () => ({ version, min_app_version: null }));
  await loginStudent(page, "hs_ban_cu");
  await page.getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();

  // Dang lam bai thi server len ban moi: van lam binh thuong
  version = "1.4";
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await page.waitForTimeout(2500);
  await expect(page.locator("#updateOverlay")).toHaveCount(0);

  for (const [i, a] of FULL_EXAM_RIGHT.entries()) {
    await page.locator(".q-nav-btn").nth(i).click();
    await answerCurrent(page, a);
  }
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#finalScore")).toHaveText("5 / 5");
  // Ra khoi bai thi -> hien thong bao tai lai trang
  const overlay = page.locator("#updateOverlay");
  await expect(overlay).toBeVisible({ timeout: 5000 });
  await expect(overlay).toContainText("ĐÃ CÓ PHIÊN BẢN MỚI");
  await expect(overlay).toContainText("1.4");
});
