// Mat khau vao de (mac dinh tat): admin bat / tat; hoc sinh nhap mat khau chung cua moi de moi lam duoc
import { expect, test } from "@playwright/test";
import { PROCTOR_PASSWORD } from "./support/env.ts";
import { FULL_EXAM, FULL_EXAM_CODE, FULL_EXAM_RIGHT } from "./support/fixtures.ts";
import { acceptDialogs, answerCurrent, dbState, loginAdmin, loginStudent, resetDb, seed } from "./support/helpers.ts";

test.beforeEach(async () => {
  await resetDb();
});

test("admin: mật khẩu vào đề mặc định tắt; bật / tắt được, dùng mật khẩu chung", async ({ page }) => {
  acceptDialogs(page);
  const [exam] = await seed("exams", [{ ...FULL_EXAM }]);
  await loginAdmin(page);
  const row = page.locator("#examTableBody tr", { hasText: FULL_EXAM.title });
  await row.getByRole("button", { name: `Mật khẩu đề #${exam.id}` }).click();
  await expect(page.locator("#proctorCodeValue")).toHaveText(FULL_EXAM_CODE);
  await expect(page.locator("#commonPasswordValue")).toHaveText(PROCTOR_PASSWORD);

  const toggle = page.locator("#entryPasswordEnabled");
  await expect(toggle).not.toBeChecked();
  await toggle.check();
  await expect(row).toContainText("Có mật khẩu");
  expect((await dbState()).exams[0].require_password).toBe(true);

  await toggle.uncheck();
  await expect(row).not.toContainText("Có mật khẩu");
  expect((await dbState()).exams[0].require_password).toBe(false);
});

test("học sinh: nhập mật khẩu chung hoặc mật khẩu riêng của đề mới vào được; thoát khẩn cấp về danh sách đề, vào lại không phải nhập", async ({ page }) => {
  acceptDialogs(page);
  await seed("exams", [{ ...FULL_EXAM, require_password: true, entry_password: "135246" }]);
  await loginStudent(page, "hs_mat_khau");
  const card = page.locator(".card", { hasText: FULL_EXAM.title });
  await expect(card).toContainText("Cần mật khẩu");

  await card.getByRole("button", { name: "Vào làm bài" }).click();
  const dialog = page.locator("#viewUnlockModal");
  await expect(dialog.locator("#exitTitle")).toHaveText("Mật khẩu đề thi");

  // Sai mat khau -> bi tu choi (2 lan)
  for (const wrong of ["135246", "000000"]) {
    await dialog.locator("#proctorInput").fill(wrong);
    await dialog.locator("#btnConfirmExit").click();
    await expect(dialog.locator("#unlockError")).toBeVisible();
    await expect(dialog.locator("#unlockError")).toContainText("Mật khẩu đề không đúng");
  }
  await dialog.locator("#proctorInput").fill(PROCTOR_PASSWORD);
  await dialog.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);

  // Thoat khan cap (bang mat khau rieng cua de) -> ve danh sach de; vao lai khong hoi mat khau de nua (dung ve vao de)
  await page.getByRole("button", { name: "Thoát khẩn cấp (Giám thị)" }).first().click();
  await page.locator("#proctorInput").fill(FULL_EXAM_CODE);
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamList")).toBeVisible();
  await expect(page).toHaveURL(/exam\.html\?user=hs_mat_khau/);
  await page.getByRole("button", { name: "Tiếp tục làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");

  // Nop bai duoc (server kiem tra ve vao de)
  for (const [i, a] of FULL_EXAM_RIGHT.entries()) {
    await page.locator(".q-nav-btn").nth(i).click();
    await answerCurrent(page, a);
  }
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#finalScore")).toHaveText("5 / 5");
  const { exam_events, exam_results } = await dbState();
  expect(exam_results).toHaveLength(1);
  expect(exam_events.filter(e => e.type === "SAI_MAT_KHAU").map(e => e.detail)).toEqual(["Nhập sai mật khẩu vào đề.", "Nhập sai mật khẩu vào đề."]);
});

test("đề tắt mật khẩu (mặc định): vào làm ngay, không hỏi mật khẩu", async ({ page }) => {
  await seed("exams", [{ ...FULL_EXAM }]);
  await loginStudent(page, "hs_tu_do");
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).not.toContainText("Cần mật khẩu");
  await page.getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#viewUnlockModal")).toBeHidden();
});
