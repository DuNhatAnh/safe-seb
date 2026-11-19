// Luong chinh tu dau den cuoi: admin nhap de -> hoc sinh lam -> admin xem ket qua + nhat ky
import { expect, test } from "@playwright/test";
import { IMPORT_JSON } from "./support/fixtures.ts";
import { acceptDialogs, answerCurrent, importJson, loginAdmin, loginStudent, resetDb } from "./support/helpers.ts";

test.beforeEach(async () => {
  await resetDb();
});

test("admin nhập đề → học sinh làm và nộp → admin thấy kết quả và nhật ký", async ({ browser }) => {
  // ---- Admin xuat ban de
  const adminPage = await browser.newPage();
  const adminDialogs = acceptDialogs(adminPage);
  await loginAdmin(adminPage);
  await importJson(adminPage, IMPORT_JSON);
  await adminPage.locator("#btnSaveExam").click();
  await expect.poll(() => adminDialogs.join(" ")).toContain("Đã xuất bản đề thi");

  // ---- Hoc sinh (trinh duyet rieng) lam de vua xuat ban
  const studentPage = await (await browser.newContext()).newPage();
  acceptDialogs(studentPage);
  await loginStudent(studentPage, "hs_luong_chinh");
  const card = studentPage.locator(".card", { hasText: IMPORT_JSON.title });
  await card.getByRole("button", { name: "Vào làm bài" }).click();

  await answerCurrent(studentPage, { kind: "option", index: 0 }); // dung
  await studentPage.locator("#btnNext").click();
  await answerCurrent(studentPage, { kind: "option", index: 1 }); // sai
  await studentPage.locator("#btnNext").click();
  await answerCurrent(studentPage, { kind: "text", value: "2" }); // dung
  await studentPage.locator("#btnSubmit").click();
  await expect(studentPage.locator("#finalScore")).toHaveText("6,67");

  // ---- Admin xem ket qua
  await adminPage.locator('.sidebar-item[data-page="pageResults"]').click();
  const row = adminPage.locator("#resultsTableBody tr", { hasText: "hs_luong_chinh" });
  await expect(row).toContainText("6,67 / 10");
  await row.getByRole("button", { name: "Xem" }).click();
  await expect(adminPage.locator("#modalAnswersList")).toContainText("Chọn [A]");
  await expect(adminPage.locator("#modalLogsList")).toContainText("NOP_BAI");
});
