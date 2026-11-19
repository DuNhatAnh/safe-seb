// Mat khau vao de (mac dinh tat): admin bat / xem / doi; hoc sinh phai nhap dung moi lam duoc
import { expect, test } from "@playwright/test";
import { FULL_EXAM, FULL_EXAM_CODE, FULL_EXAM_RIGHT } from "./support/fixtures.ts";
import { acceptDialogs, answerCurrent, dbState, loginAdmin, loginStudent, resetDb, seed } from "./support/helpers.ts";

const ENTRY = "135246";

test.beforeEach(async () => {
  await resetDb();
});

test("admin: mật khẩu vào đề mặc định tắt; bật thì có mật khẩu 6 số khác mã giám thị", async ({ page }) => {
  acceptDialogs(page);
  const [exam] = await seed("exams", [{ ...FULL_EXAM }]);
  await loginAdmin(page);
  const row = page.locator("#examTableBody tr", { hasText: FULL_EXAM.title });
  await row.getByRole("button", { name: `Mã giám thị đề #${exam.id}` }).click();

  const toggle = page.locator("#entryPasswordEnabled");
  await expect(toggle).not.toBeChecked();
  await expect(page.locator("#entryPasswordBox")).toBeHidden();

  await toggle.check();
  await expect(page.locator("#entryPasswordValue")).toHaveText(/^\d{6}$/);
  const password = await page.locator("#entryPasswordValue").textContent();
  expect(password).not.toBe(FULL_EXAM_CODE);
  await expect(row).toContainText("Có mật khẩu");
  expect((await dbState()).exams[0]).toMatchObject({ require_password: true, entry_password: password });

  await toggle.uncheck();
  await expect(page.locator("#entryPasswordBox")).toBeHidden();
  expect((await dbState()).exams[0].require_password).toBe(false);
});

test("học sinh: phải nhập đúng mật khẩu đề; mã giám thị không dùng thay được; vào lại không phải nhập", async ({ page }) => {
  acceptDialogs(page);
  await seed("exams", [{ ...FULL_EXAM, require_password: true, entry_password: ENTRY }]);
  await loginStudent(page, "hs_mat_khau");
  const card = page.locator(".card", { hasText: FULL_EXAM.title });
  await expect(card).toContainText("Cần mật khẩu");

  await card.getByRole("button", { name: "Vào làm bài" }).click();
  const dialog = page.locator("#viewUnlockModal");
  await expect(dialog.locator("#exitTitle")).toHaveText("Mật khẩu đề thi");

  // Sai mat khau / dung ma giam thi thay mat khau -> deu bi tu choi
  for (const wrong of ["000000", FULL_EXAM_CODE]) {
    await dialog.locator("#proctorInput").fill(wrong);
    await dialog.locator("#btnConfirmExit").click();
    await expect(dialog.locator("#unlockError")).toBeVisible();
    await expect(dialog.locator("#unlockError")).toContainText("Mật khẩu đề không đúng");
  }
  await dialog.locator("#proctorInput").fill(ENTRY);
  await dialog.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);

  // Thoat khan cap roi vao lai: khong hoi mat khau de nua (dung ve vao de)
  await page.getByRole("button", { name: "Thoát khẩn cấp (Giám thị)" }).first().click();
  await page.locator("#proctorInput").fill(FULL_EXAM_CODE);
  await page.locator("#btnConfirmExit").click();
  await expect(page).toHaveURL(/index\.html/);
  await loginStudent(page, "hs_mat_khau");
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
