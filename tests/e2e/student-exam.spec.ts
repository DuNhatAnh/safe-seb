// Chuc nang quan trong 2: hoc sinh lam de va nop bai
import { expect, test, type Browser, type Page } from "@playwright/test";
import { FULL_EXAM, FULL_EXAM_CODE, FULL_EXAM_RIGHT } from "./support/fixtures.ts";
import { PROCTOR_PASSWORD } from "./support/env.ts";
import { acceptDialogs, answerCurrent, dbState, leaveExam, loginStudent, resetDb, returnToExam, seed, updateRow, type StudentAnswer } from "./support/helpers.ts";

let examId: number;

test.beforeEach(async () => {
  await resetDb();
  [{ id: examId }] = (await seed("exams", [FULL_EXAM])) as { id: number }[];
});

test("đăng nhập: hiện lời nhắn 1 lần, bấm Đóng là tắt; tải lại trang không hiện lại; có nút Tải lại danh sách", async ({ page }) => {
  await page.goto("/index.html");
  await page.locator("#username").fill("hs_chao");
  await page.locator("#submitBtn").click();
  const modal = page.locator("#welcomeModal");
  await expect(modal).toBeVisible();
  await expect(modal).toContainText("Lời nhắn từ chị Thảo");
  await expect(modal.locator(".welcome-tier")).toHaveText([/7 đến 8 điểm\s*5k/, /9 đến 10 điểm\s*15k/]);
  await modal.getByRole("button", { name: "Đóng" }).click();
  await expect(modal).toBeHidden();

  await page.reload();
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).toBeVisible();
  await expect(modal).toBeHidden();

  // Tai lai danh sach: de moi tao sau khi vao trang hien ra ma khong can tai lai ca trang
  await seed("exams", [{ ...FULL_EXAM, title: "Đề mới thêm" }]);
  await page.getByRole("button", { name: "Tải lại" }).click();
  await expect(page.locator(".card", { hasText: "Đề mới thêm" })).toBeVisible();
});

async function startExam(page: Page, student: string): Promise<void> {
  await loginStudent(page, student);
  await page.getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#viewShield")).toBeHidden(); // khong bi man che lockdown chan
  // Cho bai thi vao han che do thi (toan man hinh xong) truoc khi gia lap roi trang
  // (Lockdown khai bao bang const o pham vi toan cuc cua trang, khong nam tren window -> goi theo ten)
  await page.waitForFunction("typeof Lockdown !== 'undefined' && Lockdown.wasOk === true");
}

async function answerAll(page: Page, answers: StudentAnswer[]): Promise<void> {
  for (const [i, answer] of answers.entries()) {
    await answerCurrent(page, answer);
    if (i < answers.length - 1) await page.locator("#btnNext").click();
  }
}

test("đề gửi về trình duyệt không chứa đáp án", async ({ page }) => {
  const examResponse = page.waitForResponse(r => r.url().includes("/api/exam?"));
  await startExam(page, "hs_khong_lo");
  const body = await (await examResponse).text();
  expect(body).not.toMatch(new RegExp(`is_correct|is_true|"answer"|"answers"|solution|proctor_code|${FULL_EXAM_CODE}`));
  expect(body).toContain(FULL_EXAM.questions[0].question);
});

test("làm đủ mới nộp được → server chấm đúng → lưu kết quả + nhật ký → hiện lịch sử", async ({ page }) => {
  acceptDialogs(page);
  await startExam(page, "hs_lam_dung");

  const submit = page.locator("#btnSubmit");
  await expect(submit).toBeDisabled();
  await expect(page.locator("#submitHint")).toContainText("Còn 5 câu chưa trả lời");

  // Lam thieu 1 cau van chua nop duoc
  await answerAll(page, FULL_EXAM_RIGHT.slice(0, 4));
  await expect(submit).toBeDisabled();
  await page.locator("#btnNext").click();
  await answerCurrent(page, FULL_EXAM_RIGHT[4]);
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 5 / 5");
  await expect(submit).toBeEnabled();

  await submit.click();

  // Man ket qua: diem phan tu dong 5/5, 1 cau tu luan cho giao vien cham
  await expect(page.locator("#viewLockScreen")).toBeVisible();
  await expect(page.locator("#finalScore")).toHaveText("5 / 5");
  await expect(page.locator("#finalSummary")).toContainText("1 câu tự luận");

  // DB: diem do server cham (5/6 * 10), nhat ky co bat dau + nop bai
  const { exam_results } = await dbState();
  expect(exam_results).toHaveLength(1);
  const result = exam_results[0];
  expect(result).toMatchObject({ exam_id: examId, student_name: "hs_lam_dung", score: 8.33, total_questions: 6 });
  const logTypes = (result.action_logs as { type: string }[]).map(l => l.type);
  expect(logTypes).toEqual(expect.arrayContaining(["BAT_DAU", "CHON_DAP_AN", "NHAP_DAP_AN", "NOP_BAI"]));

  // Lich su; de da nop chi con nut "Lam lai" (can ma giam thi)
  // "Xem lich su" -> modal lich su cua chinh de vua nop
  await page.getByRole("button", { name: "Xem lịch sử làm bài" }).click();
  await expect(page.locator("#historyModal")).toBeVisible();
  await expect(page.locator("#historyTitle")).toContainText(FULL_EXAM.title);
  await expect(page.locator("#historyContainer")).toContainText("8,33/10");
  await page.getByRole("button", { name: "Đóng" }).click();
  await expect(page.locator("#historyModal")).toBeHidden();
  // The de da nop: nut Lich su + Lam lai; khong con phan lich su o cuoi trang
  await expect(page.getByRole("button", { name: "Lịch sử", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Làm lại" })).toBeVisible();
  await expect(page.locator("#historySection")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Vào làm bài" })).toHaveCount(0);
});

test("làm lại lần 2 (mặc định): phải nhập đúng mật khẩu đề, có ghi nhật ký", async ({ page }) => {
  acceptDialogs(page);
  await startExam(page, "hs_lam_lai");
  // Lan 1: sai cau 1, dung 4 cau con lai -> 4/5 phan tu dong
  await answerAll(page, [{ kind: "option", index: 0 }, ...FULL_EXAM_RIGHT.slice(1, 5)]);
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#viewLockScreen")).toBeVisible();
  await page.getByRole("button", { name: "Xem lịch sử làm bài" }).click();
  await page.getByRole("button", { name: "Đóng" }).click();

  // Bam Lam lai -> hop thoai ma giam thi
  await page.getByRole("button", { name: "Làm lại" }).click();
  const dialog = page.locator("#viewUnlockModal");
  await expect(dialog).toBeVisible();
  await expect(dialog.locator("#exitTitle")).toHaveText("Làm lại bài thi");

  // Sai mat khau -> bao loi that tu server
  await dialog.locator("#proctorInput").fill("000000");
  await dialog.locator("#btnConfirmExit").click();
  // Cho loi THAT tu server (o loi co san chu mac dinh khi an)
  await expect(dialog.locator("#unlockError")).toBeVisible();
  await expect(dialog.locator("#unlockError")).toContainText("Còn 4 lần thử");

  await dialog.locator("#proctorInput").fill(PROCTOR_PASSWORD);
  await dialog.locator("#btnConfirmExit").click();

  // Vao lan 2: bai trong, lam lai tu dau
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 0 / 5");
  await answerAll(page, FULL_EXAM_RIGHT);
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#finalScore")).toHaveText("5 / 5");

  const { exam_results, exam_events } = await dbState();
  expect(exam_results.map(r => r.score)).toEqual([6.67, 8.33]);
  expect(exam_events.map(e => e.type)).toEqual(["SAI_MAT_KHAU", "CHO_LAM_LAI"]);

  // Lan 3 lai can ma
  await page.getByRole("button", { name: "Xem lịch sử làm bài" }).click();
  await expect(page.locator("#historyContainer tbody tr")).toHaveCount(2); // 2 lan lam de nay
  await page.getByRole("button", { name: "Đóng" }).click();
  await page.getByRole("button", { name: "Làm lại" }).click();
  await expect(page.locator("#viewUnlockModal")).toBeVisible();

  // Lan 3: mat khau rieng cua de cung cho lam lai duoc (mat khau khong tu doi)
  await page.locator("#proctorInput").fill(FULL_EXAM_CODE);
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
});

test("đề bật cho làm lại: 3 lần đầu bấm Làm lại là vào ngay; lần 4 phải nhập mật khẩu đề", async ({ page }) => {
  acceptDialogs(page);
  await updateRow("exams", examId, { allow_retake: true });
  await startExam(page, "hs_lam_nhieu");
  for (let lan = 1; lan <= 3; lan++) {
    await answerAll(page, FULL_EXAM_RIGHT);
    await page.locator("#btnSubmit").click();
    await expect(page.locator("#viewLockScreen")).toBeVisible();
    await page.getByRole("button", { name: "Về trang đề thi" }).click();
    if (lan < 3) {
      await page.getByRole("button", { name: "Làm lại" }).click();
      await expect(page.locator("#viewUnlockModal")).toBeHidden();
      await expect(page.locator("#viewExamPlay")).toBeVisible();
    }
  }
  let { exam_results, exam_events } = await dbState();
  expect(exam_results).toHaveLength(3);
  expect(exam_events.filter(e => e.type === "CHO_LAM_LAI")).toHaveLength(0);

  // Lan 4: hoi mat khau de (mat khau rieng cua de dung duoc)
  await page.getByRole("button", { name: "Làm lại" }).click();
  await expect(page.locator("#viewUnlockModal")).toBeVisible();
  await expect(page.locator("#exitTitle")).toHaveText("Làm lại bài thi");
  await page.locator("#proctorInput").fill(FULL_EXAM_CODE);
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  ({ exam_events } = await dbState());
  expect(exam_events.filter(e => e.type === "CHO_LAM_LAI")).toHaveLength(1);

  // Lan 4: thoat khan cap bang mat khau rieng cua de bi tu choi, mat khau mac dinh thi duoc
  await page.getByRole("button", { name: "Thoát khẩn cấp (Giám thị)" }).first().click();
  await page.locator("#proctorInput").fill(FULL_EXAM_CODE);
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#unlockError")).toBeVisible(); // cho loi THAT tu server (o loi co san chu mac dinh khi an)
  await expect(page.locator("#unlockError")).toContainText("Mật khẩu đề không đúng");
  await page.locator("#proctorInput").fill(PROCTOR_PASSWORD);
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#viewExamList")).toBeVisible();
});

test("bàn phím số riêng: bấm phím nhập được dấu - , . / và số; Xoá / Xoá hết; tối đa 4 ký tự", async ({ page }) => {
  await startExam(page, "hs_ban_phim");
  await page.locator(".q-nav-btn").nth(3).click(); // cau tra loi ngan (so)
  const input = page.locator("#optionsContainer [data-ans=input]");
  await expect(input).toHaveAttribute("inputmode", "none"); // dien thoai khong bat ban phim cua may
  const pad = page.locator(".num-keypad");
  const press = async (...keys: string[]) => { for (const k of keys) await pad.locator(`[data-key="${k}"]`).click(); };
  await press("-", "1", "/", "2");
  await expect(input).toHaveValue("-1/2");
  await press("3"); // qua 4 ky tu -> bo qua
  await expect(input).toHaveValue("-1/2");
  await press("back", "back", "back", "back", "0", ",", "5");
  await expect(input).toHaveValue("0,5");
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");
  await press("clear");
  await expect(input).toHaveValue("");
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 0 / 5");
  await press("2", ".", "5");
  await expect(input).toHaveValue("2.5");
});

test("đang làm lượt 2 thì admin tắt \"làm lại nhiều lần\": tải lại trang vẫn làm tiếp và nộp được, không mất bài", async ({ page }) => {
  acceptDialogs(page);
  await updateRow("exams", examId, { allow_retake: true });
  await startExam(page, "hs_doi_cai_dat");
  await answerAll(page, [{ kind: "option", index: 0 }, ...FULL_EXAM_RIGHT.slice(1)]);
  await page.locator("#btnSubmit").click();
  await page.getByRole("button", { name: "Về trang đề thi" }).click();
  await page.getByRole("button", { name: "Làm lại" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);

  await updateRow("exams", examId, { allow_retake: false });
  await page.reload();
  await expect(page.locator("#welcomeModal")).toBeHidden(); // tai lai trang: khong hien lai loi nhan
  // Dang lam do luot 2 -> the de hien "Dang lam do" (khong phai "Da nop")
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).toContainText("Đang làm dở");
  await page.getByRole("button", { name: "Tiếp tục làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#viewUnlockModal")).toBeHidden();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");
  for (const [i, a] of FULL_EXAM_RIGHT.entries()) {
    await page.locator(".q-nav-btn").nth(i).click();
    await answerCurrent(page, a);
  }
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#finalScore")).toHaveText("5 / 5");
  const { exam_results } = await dbState();
  expect(exam_results.map(r => r.score)).toEqual([6.67, 8.33]);
});

test("cùng 1 trình duyệt: bài làm dở của thí sinh này không hiện / không mở được ở thí sinh khác", async ({ page }) => {
  await startExam(page, "hs_mot");
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");

  // Thi sinh khac dang nhap tren cung trinh duyet
  page.on("dialog", d => void d.accept());
  await loginStudent(page, "hs_hai");
  const card = page.locator(".card", { hasText: FULL_EXAM.title });
  await expect(card).not.toContainText("Đang làm dở");
  await card.getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 0 / 5");

  // Thi sinh dau quay lai: bai lam do van con nguyen
  await loginStudent(page, "hs_mot");
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).toContainText("Đang làm dở");
  await page.getByRole("button", { name: "Tiếp tục làm bài" }).click();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");
});

test("app Android báo có bong bóng chat / mất tiêu điểm → che bài thi, ghi vi phạm; đề bật khoá thì khoá bài", async ({ page }) => {
  await updateRow("exams", examId, { lock_on_leave: true });
  await startExam(page, "hs_bong_bong");
  const native = (type: string) => page.evaluate(t => window.dispatchEvent(new CustomEvent("safeexam-native", { detail: { type: t } })), type);
  const logs = () => page.evaluate("tracker.getLogs().map(l => l.type)") as Promise<string[]>;

  // Bam vao bong bong chat (man hinh mat tieu diem) -> tinh roi bai -> khoa
  await native("blur");
  await expect(page.locator("#viewShield")).toBeVisible();
  await expect(page.locator("#shieldTitle")).toHaveText("BÀI THI ĐÃ BỊ KHOÁ");
  expect(await logs()).toContain("MAT_TIEU_DIEM");
  await native("focus");
  await expect(page.locator("#shieldTitle")).toHaveText("BÀI THI ĐÃ BỊ KHOÁ"); // van khoa: can giam thi
});

test("app Android báo có cửa sổ nổi (đề không khoá): hiện màn che bảo tắt bong bóng chat, tắt xong quay lại làm tiếp", async ({ page }) => {
  await startExam(page, "hs_cua_so_noi");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("safeexam-native", { detail: { type: "overlay" } })));
  await expect(page.locator("#viewShield")).toBeVisible();
  await expect(page.locator("#shieldReason")).toContainText("bong bóng chat");
  expect(await page.evaluate("tracker.getLogs().map(l => l.type)")).toContain("CUA_SO_NOI");
  await page.locator("#btnShieldResume").click();
  await expect(page.locator("#viewShield")).toBeHidden();
});

test("điện thoại: chạm giữ lâu ghi GIU_LAU (không tính vi phạm), không ghi \"Bấm chuột phải\"; chuột phải thật vẫn ghi CHUOT_PHAI", async ({ page }) => {
  await startExam(page, "hs_cham_giu");
  const fire = (pointerType: string) => page.evaluate(pt => {
    const el = document.getElementById("questionText")!;
    el.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true, pointerType: pt }));
    el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true }));
  }, pointerType);
  await fire("touch");
  let types = await page.evaluate("tracker.getLogs().map(l => l.type)") as string[];
  expect(types).toContain("GIU_LAU");
  expect(types).not.toContain("CHUOT_PHAI");
  await fire("mouse");
  types = await page.evaluate("tracker.getLogs().map(l => l.type)") as string[];
  expect(types).toContain("CHUOT_PHAI");
});

// Gia lap app Android (window.KioskBridge) tren 1 man hinh 1280px rong bang cua so
async function androidPage(browser: Browser, apps = ""): Promise<Page> {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 }, screen: { width: 1280, height: 720 } });
  const page = await ctx.newPage();
  await page.addInitScript(a => {
    Object.assign(window, {
      KioskBridge: {
        startLock() { }, stopLock() { }, unlock() { }, isDeviceOwner: () => false, releaseDevice() { },
        appVersion: () => "v1.3", accessibilityServices: () => a
      }
    });
  }, apps);
  return page;
}

test("bắt thêm trường hợp (app Android): chia đôi / thu nhỏ cửa sổ che bài", async ({ browser }) => {
  const page = await androidPage(browser);
  await loginStudent(page, "hs_chia_doi");
  await page.getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  await expect(page.locator("#viewShield")).toBeHidden();
  const logs = () => page.evaluate("tracker.getLogs().map(l => l.type)") as Promise<string[]>;

  // Cua so hep di so voi man hinh (chia doi man hinh): che bai; lai rong nhu man hinh thi tu het che
  // (Playwright doi ca screen khi doi viewport -> gia lap man hinh rong gap doi cua so)
  const setScreenWidth = (w: number) => page.evaluate(sw => {
    Object.defineProperty(window.screen, "width", { configurable: true, get: () => sw });
    window.dispatchEvent(new Event("resize"));
  }, w);
  await setScreenWidth(2560);
  await expect(page.locator("#viewShield")).toBeVisible();
  await expect(page.locator("#shieldReason")).toContainText("chia đôi / thu nhỏ");
  expect(await logs()).toContain("CHIA_MAN_HINH");
  await setScreenWidth(1280);
  await expect(page.locator("#viewShield")).toBeHidden(); // het chia doi -> tu an man che

  // App bao chia doi man hinh
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("safeexam-native", { detail: { type: "split" } })));
  await expect(page.locator("#viewShield")).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("safeexam-native", { detail: { type: "split-off" } })));
  await expect(page.locator("#viewShield")).toBeHidden();
});

test("bắt thêm trường hợp (máy tính): cửa sổ chưa phóng to không bị coi là chia đôi; PrintScreen, kéo thả, in trang được ghi lại", async ({ page }) => {
  await startExam(page, "hs_truong_hop"); // man hinh gia lap 1920px, cua so 1280px
  await expect(page.locator("#viewShield")).toBeHidden();
  await page.evaluate(() => {
    window.dispatchEvent(new KeyboardEvent("keyup", { key: "PrintScreen" }));
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    document.getElementById("questionText")!.dispatchEvent(drop);
    window.dispatchEvent(new Event("beforeprint"));
  });
  const types = await page.evaluate("tracker.getLogs().map(l => l.type)") as string[];
  for (const t of ["CHUP_MAN_HINH", "KEO_THA", "IN_TRANG"]) expect(types).toContain(t);
  expect(types).not.toContain("CHIA_MAN_HINH");
});

test("app Android: ghi tên ứng dụng trợ năng đang bật khi bắt đầu làm bài (không tính vi phạm)", async ({ browser }) => {
  const page = await androidPage(browser, "com.giai.bai.ai, com.tu.dong.bam");
  await loginStudent(page, "hs_tro_nang");
  await page.getByRole("button", { name: "Vào làm bài" }).click();
  await expect(page.locator("#viewExamPlay")).toBeVisible();
  const logs = await page.evaluate("tracker.getLogs()") as { type: string; detail: string }[];
  const row = logs.find(l => l.type === "UNG_DUNG_TRO_NANG");
  expect(row?.detail).toContain("com.giai.bai.ai, com.tu.dong.bam");
});

test("trả lời sai được chấm 0, đúng sai chấm theo thang THPT", async ({ page }) => {
  acceptDialogs(page);
  await startExam(page, "hs_lam_sai");
  await answerAll(page, [
    { kind: "option", index: 0 },                       // sai
    { kind: "option", index: 0 },                       // dung
    { kind: "tf", values: [true, true, true, true] },   // dung 2/4 y -> 0,25
    { kind: "text", value: "0,6" },                     // sai
    { kind: "text", value: "Hà Nội" }                   // dung
  ]);
  await page.locator("#btnSubmit").click();
  await expect(page.locator("#finalScore")).toHaveText("2,25 / 5");
});

test("ô số nhập sai định dạng thì báo lỗi và không tính là đã trả lời", async ({ page }) => {
  await startExam(page, "hs_sai_dinh_dang");
  await page.locator(".q-nav-btn").nth(3).click(); // cau tra loi ngan
  await answerCurrent(page, { kind: "text", value: "3//4" });
  await expect(page.locator(".field-error")).toBeVisible();
  await expect(page.locator(".q-nav-btn").nth(3)).toHaveClass(/invalid/);
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 0 / 5");
});

test("đề bật khoá khi rời trang: tải lại giữa chừng giữ bài làm nhưng bài bị khoá", async ({ page }) => {
  await updateRow("exams", examId, { lock_on_leave: true });
  await startExam(page, "hs_tai_lai");
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");

  page.on("dialog", d => void d.accept()); // hop thoai "roi trang?"
  await page.reload();
  await page.getByRole("button", { name: "Tiếp tục làm bài" }).click();
  await expect(page.locator("#shieldTitle")).toHaveText("BÀI THI ĐÃ BỊ KHOÁ");
  await page.locator("#shieldCode").fill(PROCTOR_PASSWORD);
  await page.locator("#btnShieldUnlock").click();
  await expect(page.locator("#viewShield")).toBeHidden();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");
});

test("thoát khẩn cấp: sai mật khẩu bị ghi log, đúng mật khẩu thì thoát và giữ bài", async ({ page }) => {
  await startExam(page, "hs_thoat");
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);

  await page.getByRole("button", { name: "Thoát khẩn cấp (Giám thị)" }).first().click();
  await page.locator("#exitReason").fill("Thí sinh mệt");
  await page.locator("#proctorInput").fill("sai-mat-khau");
  await page.locator("#btnConfirmExit").click();
  await expect(page.locator("#unlockError")).toBeVisible();
  await expect(page.locator("#unlockError")).toContainText("Còn 4 lần thử");

  await page.locator("#proctorInput").fill(PROCTOR_PASSWORD);
  await page.locator("#btnConfirmExit").click();
  // Ve danh sach de (khong dang xuat, khong dong app)
  await expect(page.locator("#viewExamList")).toBeVisible();
  await expect(page.locator("#viewExamPlay")).toBeHidden();
  await expect(page).toHaveURL(/exam\.html\?user=hs_thoat/);

  const { exam_events, exam_results } = await dbState();
  expect(exam_events.map(e => e.type)).toEqual(["SAI_MAT_KHAU", "THOAT_KHAN_CAP"]);
  expect(exam_events[1]).toMatchObject({ exam_id: examId, student_name: "hs_thoat" });
  expect(String(exam_events[1].detail)).toContain("Thí sinh mệt");
  expect(exam_results).toHaveLength(0); // chua nop

  // Vao lai ngay tu danh sach de: bai lam con nguyen
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).toContainText("Đang làm dở");
  await page.getByRole("button", { name: "Tiếp tục làm bài" }).click();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");
});

test("đề bật khoá khi rời trang: rời bài là khoá ngay; tải lại không gỡ được; chỉ mã giám thị mở được", async ({ page }) => {
  await updateRow("exams", examId, { lock_on_leave: true });
  await startExam(page, "hs_roi_bai");
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);
  const shield = page.locator("#viewShield");

  // Roi bai lan dau: khoa ngay, quay lai van bi che, khong co nut quay lai
  await leaveExam(page);
  await returnToExam(page);
  await expect(shield).toBeVisible();
  await expect(page.locator("#shieldTitle")).toHaveText("BÀI THI ĐÃ BỊ KHOÁ");
  await expect(page.locator("#btnShieldResume")).toBeHidden();

  // Tai lai trang de "thoat khoa" -> van bi khoa
  page.on("dialog", d => void d.accept());
  await page.reload();
  await page.getByRole("button", { name: "Tiếp tục làm bài" }).click();
  await expect(page.locator("#shieldTitle")).toHaveText("BÀI THI ĐÃ BỊ KHOÁ");
  await expect(shield).toBeVisible();

  // Sai ma -> bao loi; dung ma cua de -> mo khoa, bai lam con nguyen
  await page.locator("#shieldCode").fill("000000");
  await page.locator("#btnShieldUnlock").click();
  await expect(page.locator("#shieldError")).toBeVisible();
  await expect(page.locator("#shieldError")).toContainText("Còn 4 lần thử");
  await page.locator("#shieldCode").fill(PROCTOR_PASSWORD);
  await page.locator("#btnShieldUnlock").click();
  await expect(shield).toBeHidden();
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");

  const { exam_events } = await dbState();
  expect(exam_events.map(e => e.type)).toEqual(["SAI_MAT_KHAU", "MO_KHOA"]);

  // Roi tiep -> khoa lai ngay
  await leaveExam(page);
  await returnToExam(page);
  await expect(page.locator("#shieldTitle")).toHaveText("BÀI THI ĐÃ BỊ KHOÁ");
});

test("mặc định (tắt khoá): rời trang chỉ cảnh báo + ghi nhật ký, tự quay lại làm tiếp, không cần mã", async ({ page }) => {
  await startExam(page, "hs_mac_dinh");
  await leaveExam(page);
  await expect(page.locator("#viewShield")).toBeVisible();
  await expect(page.locator("#shieldTitle")).toHaveText("BẠN ĐÃ RỜI BÀI THI");
  await expect(page.locator("#shieldLocked")).toBeHidden();
  await returnToExam(page);
  await expect(page.locator("#viewShield")).toBeHidden();
  await leaveExam(page);
  await returnToExam(page);
  await expect(page.locator("#viewShield")).toBeHidden(); // khong bao gio bi khoa
  await answerCurrent(page, FULL_EXAM_RIGHT[0]);
  await expect(page.locator("#answeredStatus")).toHaveText("Đã trả lời: 1 / 5");
});

test("nộp bài xong: không có nút thoát, chỉ xem lịch sử hoặc về trang đề thi", async ({ page }) => {
  acceptDialogs(page);
  await startExam(page, "hs_sau_nop");
  await answerAll(page, FULL_EXAM_RIGHT);
  await page.locator("#btnSubmit").click();
  const done = page.locator("#viewLockScreen");
  await expect(done).toBeVisible();
  await expect(done.getByRole("button")).toHaveText(["Xem lịch sử làm bài", "Về trang đề thi"]);
  await done.getByRole("button", { name: "Về trang đề thi" }).click();
  await expect(page.locator("#viewExamList")).toBeVisible();
  await expect(page.locator(".card", { hasText: FULL_EXAM.title })).toContainText("Đã nộp");
});
