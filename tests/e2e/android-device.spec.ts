// App Android Device Owner: man dang nhap co loi thoat / go khoa cho quan tri vien (can mat khau quan tri)
// Gia lap window.KioskBridge ma app Android gan vao WebView.
import { expect, test, type Page } from "@playwright/test";
import { ADMIN_PASSWORD } from "./support/env.ts";

async function fakeAndroid(page: Page, deviceOwner: boolean): Promise<void> {
  await page.addInitScript(owner => {
    const calls: string[] = [];
    Object.assign(window, {
      __kioskCalls: calls,
      KioskBridge: {
        startLock: () => calls.push("startLock"),
        stopLock: () => calls.push("stopLock"),
        isDeviceOwner: () => owner,
        releaseDevice: () => calls.push("releaseDevice")
      }
    });
  }, deviceOwner);
}

const kioskCalls = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { __kioskCalls: string[] }).__kioskCalls);

test("trình duyệt thường / app chưa là Device Owner: không hiện nút quản lý thiết bị", async ({ page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#deviceBox")).toBeHidden();
  await fakeAndroid(page, false);
  await page.goto("/index.html");
  await expect(page.locator("#deviceBox")).toBeHidden();
});

test("Device Owner: thoát ứng dụng / gỡ khoá chỉ chạy khi đúng mật khẩu quản trị", async ({ page }) => {
  await fakeAndroid(page, true);
  await page.goto("/index.html");
  await expect(page.locator("#deviceBox")).toBeVisible();

  await page.getByRole("button", { name: "Gỡ khoá thiết bị" }).click();
  await page.locator("#deviceAdminPass").fill("sai-mat-khau");
  await page.locator("#btnDevice").click();
  await expect(page.locator("#deviceMsg")).toBeVisible();
  await expect(page.locator("#deviceMsg")).toContainText("không chính xác");
  expect(await kioskCalls(page)).toEqual([]);

  await page.locator("#deviceAdminPass").fill(ADMIN_PASSWORD);
  await page.locator("#btnDevice").click();
  await expect.poll(() => kioskCalls(page)).toEqual(["releaseDevice"]);

  await page.getByRole("button", { name: "Thoát ứng dụng (Quản trị)" }).click();
  await page.locator("#deviceAdminPass").fill(ADMIN_PASSWORD);
  await page.locator("#btnDevice").click();
  await expect.poll(() => kioskCalls(page)).toEqual(["releaseDevice", "stopLock"]);
});

test("điện thoại Android mở bằng trình duyệt: hiện nút tải app; trong app / máy tính thì không", async ({ browser, page }) => {
  await page.goto("/index.html");
  await expect(page.locator("#apkBox")).toBeHidden(); // may tinh

  const android = await (await browser.newContext({ userAgent: "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36" })).newPage();
  await android.goto("/index.html");
  await expect(android.locator("#apkBox")).toBeVisible();
  await expect(android.locator("#apkLink")).toHaveAttribute("href", "/tai-app");

  await fakeAndroid(android, false); // dang o trong app
  await android.goto("/index.html");
  await expect(android.locator("#apkBox")).toBeHidden();
});
