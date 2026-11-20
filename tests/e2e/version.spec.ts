// Phien ban hien o cuoi trang (file VERSION) + phien ban app Android (KioskBridge.appVersion)
import fs from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { PROJECT_ROOT } from "../../lib/paths.ts";
import { acceptDialogs, loginAdmin } from "./support/helpers.ts";

const VERSION = fs.readFileSync(path.join(PROJECT_ROOT, "VERSION"), "utf8").trim();

test("trang đăng nhập / làm bài / admin hiện phiên bản", async ({ page, request }) => {
  expect(await (await request.get("/api/version")).json()).toEqual({ version: VERSION, commit: "dev" });
  acceptDialogs(page);
  for (const url of ["/index.html", "/exam.html?user=hs_phien_ban"]) {
    await page.goto(url);
    await expect(page.locator(".app-version")).toHaveText(`Phiên bản ${VERSION} · dev`);
  }
  await loginAdmin(page);
  await expect(page).toHaveURL(/admin\.html/);
  await expect(page.locator(".app-version")).toHaveText(`Phiên bản ${VERSION} · dev`);
});

test("trong app Android: hiện thêm phiên bản app (số bản build)", async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(window, { KioskBridge: { startLock() { }, stopLock() { }, appVersion: () => "1 (bản 12)" } });
  });
  await page.goto("/index.html");
  await expect(page.locator(".app-version")).toHaveText(`Phiên bản ${VERSION} · dev · App 1 (bản 12)`);
});
