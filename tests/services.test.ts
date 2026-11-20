// Test nghiep vu bang repository gia trong bo nho: khong can server, khong can Supabase.
// Chay: npm test
import test from "node:test";
import assert from "node:assert/strict";

import { GradingService } from "../lib/services/GradingService.ts";
import { ExamService } from "../lib/services/ExamService.ts";
import { SubmissionService } from "../lib/services/SubmissionService.ts";
import { ProctorService } from "../lib/services/ProctorService.ts";
import { AttemptService } from "../lib/services/AttemptService.ts";
import { ProctorCodeService } from "../lib/services/ProctorCodeService.ts";
import { SebConfigService } from "../lib/services/SebConfigService.ts";
import { EntryPasswordService } from "../lib/services/EntryPasswordService.ts";
import { AppDownloadService } from "../lib/services/AppDownloadService.ts";
import { VersionService } from "../lib/services/VersionService.ts";
import { compareVersions, parseChangelog, requiredAppVersion } from "../lib/changelog.ts";
import { bump, VERSION_PATTERN } from "../scripts/bump-version.ts";
import { APP_VERSION } from "../lib/version.ts";
import crypto from "node:crypto";
import { AuthService } from "../lib/services/AuthService.ts";
import { AdminDataService } from "../lib/services/AdminDataService.ts";
import { RateLimiter } from "../lib/security/RateLimiter.ts";
import { Config } from "../lib/config.ts";
import { Router } from "../lib/http/Router.ts";
import { ExamRepository } from "../lib/repositories/ExamRepository.ts";
import { ResultRepository } from "../lib/repositories/ResultRepository.ts";
import { EventRepository } from "../lib/repositories/EventRepository.ts";
import { MemoryDatabase } from "../lib/infra/database/MemoryDatabase.ts";
import { SupabaseDatabase } from "../lib/infra/database/SupabaseDatabase.ts";
import type { AppError } from "../lib/errors.ts";
import type { ClientInfo, ExamRow } from "../lib/types.ts";

const CODE = "135790";      // ma rieng 6 so cua de 1
const PASS = "30080404";    // mat khau chung cua moi de (PROCTOR_PASSWORD)
const EXAM: ExamRow = {
  id: 1,
  title: "Đề thử",
  duration_minutes: 30,
  proctor_code: CODE,
  questions: [
    { type: "single", question: "1+1?", points: 1, options: [{ text: "1", is_correct: false }, { text: "2", is_correct: true }] },
    { type: "true_false", question: "Đúng sai", points: 1, statements: [{ text: "a", is_true: true }, { text: "b", is_true: false }, { text: "c", is_true: true }, { text: "d", is_true: false }] },
    { type: "short_number", question: "1/2 = ?", points: 1, answer: "0,5" },
    { type: "essay", question: "Thủ đô?", points: 1, answers: ["Hà Nội"] },
    { type: "essay_manual", question: "Chứng minh", points: 1, solution: "bí mật" }
  ]
};
const RIGHT = { 0: 1, 1: [true, false, true, false], 2: "1/2", 3: "hà  nội" };

const grading = new GradingService();

// De cu (chua co ma rieng): chi nhan mat khau chung
const LEGACY_EXAM: ExamRow = { id: 2, title: "Đề cũ", duration_minutes: 10, questions: EXAM.questions, proctor_code: null };

// Service + repository THAT tren MemoryDatabase (cung interface Database voi SupabaseDatabase)
function setup() {
  const db = new MemoryDatabase({ exams: [EXAM, LEGACY_EXAM] });
  const exams = new ExamRepository(db);
  const resultsRepo = new ResultRepository(db);
  const eventsRepo = new EventRepository(db);
  const config = new Config({ ADMIN_PASSWORD: "admin-pass", PROCTOR_PASSWORD: PASS, SESSION_SECRET: "s".repeat(32) });
  const attempts = new AttemptService({ results: resultsRepo, events: eventsRepo, ticketSecret: () => "t".repeat(32) });
  const examService = new ExamService({ exams, attempts, grading, results: resultsRepo });
  return {
    db, config, examService,
    results: db.rows("exam_results"),
    events: db.rows("exam_events"),
    examRow: (id: number) => db.rows("exams").find(e => e.id === id),
    submissions: new SubmissionService({ examService, results: resultsRepo, attempts, grading }),
    proctor: new ProctorService({ config, exams, events: eventsRepo, attempts, limiter: new RateLimiter({ maxFails: 3 }) }),
    codes: new ProctorCodeService({ config, exams })
  };
}

test("đề gửi thí sinh không có đáp án", async () => {
  const { examService } = setup();
  const exam = await examService.getExamForStudent(1, "hs");
  assert.doesNotMatch(JSON.stringify(exam), new RegExp(`is_correct|is_true|"answer"|"answers"|solution|bí mật|proctor_code|${CODE}`));
  assert.equal(exam.questions[3]?.numeric, false);
  assert.equal(exam.questions[0]?.options?.[1]?.text, "2");
});

test("server chấm, bỏ qua điểm client gửi", async () => {
  const { submissions, results } = setup();
  const r = await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, score: 0, duration_minutes: 999 });
  assert.equal(r.earned, 4);
  assert.equal(r.pending, 1);
  assert.equal(r.autoMax, 4);
  assert.equal(r.duration_minutes, 31); // gioi han thoi gian de + 1
  assert.equal(results.length, 1);
});

test("chấm theo giá trị số và bỏ hoa/thường", async () => {
  const { entries } = grading.grade(EXAM.questions ?? [], RIGHT);
  assert.deepEqual(entries.slice(0, 4).map(e => e.points), [1, 1, 1, 1]);
});

test("dữ liệu đáp án rác bị loại", () => {
  assert.deepEqual(grading.cleanAnswers({ 0: { hack: 1 }, 1: "x".repeat(600), 2: [true, "y"], 3: "ok", 9: 1 }, 5), { 3: "ok" });
});

test("nộp lần 2 bị chặn và trả lại kết quả cũ", async () => {
  const { submissions, examService } = setup();
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT });
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: {} }), (e: AppError) => e.status === 409 && (e.extra.result as { earned: number }).earned === 4);
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409);
});

test("mã đề sai / không tồn tại", async () => {
  const { examService } = setup();
  await assert.rejects(examService.getExamForStudent("1;drop", "hs"), (e: AppError) => e.status === 400);
  await assert.rejects(examService.getExamForStudent(99, "hs"), (e: AppError) => e.status === 404);
});

test("giám thị: sai mã ghi SAI_MAT_KHAU, sai 3 lần thì khoá kể cả nhập đúng", async () => {
  const { proctor, events } = setup();
  const body = { type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1 };
  for (let i = 0; i < 3; i++) await assert.rejects(proctor.authorizeExit({ ...body, password: "sai" }, "ip"), (e: AppError) => e.status === 401);
  await assert.rejects(proctor.authorizeExit({ ...body, password: PASS }, "ip"), (e: AppError) => e.status === 429);
  assert.equal(events.filter(e => e.type === "SAI_MAT_KHAU").length, 3);
  // may khac khong bi anh huong
  assert.deepEqual(await proctor.authorizeExit({ ...body, password: PASS, detail: "mệt" }, "ip-2"), { ok: true });
  assert.equal(events.at(-1)?.type, "THOAT_KHAN_CAP");
});

test("mật khẩu đề: nhận mật khẩu chung hoặc mã riêng của đúng đề đó; mã của đề khác không dùng được", async () => {
  const { proctor } = setup();
  const act = (type: string, exam_id: number, password: string, student_name: string) =>
    proctor.authorizeExit({ type, student_name, exam_id, password }, "ip");
  assert.deepEqual(await act("MO_KHOA", 1, PASS, "a"), { ok: true });   // mat khau chung
  assert.deepEqual(await act("MO_KHOA", 1, CODE, "b"), { ok: true });   // ma rieng cua de 1
  assert.deepEqual(await act("MO_KHOA", 2, PASS, "c"), { ok: true });   // de chua co ma rieng: mat khau chung
  await assert.rejects(act("MO_KHOA", 2, CODE, "d"), (e: AppError) => e.status === 401); // ma cua de 1 khong dung cho de 2
  await assert.rejects(act("MO_KHOA", 1, "000000", "e"), (e: AppError) => e.status === 401);
  // Thoat khan cap luot 1..3: ca 2 mat khau
  assert.deepEqual(await act("THOAT_KHAN_CAP", 1, CODE, "f"), { ok: true });
  assert.deepEqual(await act("THOAT_KHAN_CAP", 1, PASS, "g"), { ok: true });
});

test("thoát khẩn cấp từ lần làm thứ 4: chỉ nhận mật khẩu mặc định (mã riêng của đề bị từ chối)", async () => {
  const { submissions, proctor, db } = setup();
  await db.update("exams", { id: 1 }, { allow_retake: true });
  const exit = (password: string, ip: string) => proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1, password }, ip);
  // Dang lam luot 3 (da nop 2): ma rieng van thoat duoc
  for (let i = 0; i < 2; i++) await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  assert.deepEqual(await exit(CODE, "ip-1"), { ok: true });
  // Dang lam luot 4 (da nop 3, giam thi cho lam lai): chi mat khau mac dinh
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  await proctor.grantRetake({ exam_id: 1, student_name: "hs", password: CODE }, "ip-2");
  await assert.rejects(exit(CODE, "ip-3"), (e: AppError) => e.status === 401);
  assert.deepEqual(await exit(PASS, "ip-4"), { ok: true });
  // Mo khoa van nhan ma rieng
  assert.deepEqual(await proctor.authorizeExit({ type: "MO_KHOA", student_name: "hs", exam_id: 1, password: CODE }, "ip-5"), { ok: true });
});

test("làm lại (mặc định): hết lượt cần mật khẩu đề, mỗi lần nhập đúng thêm 1 lượt", async () => {
  const { submissions, examService, proctor, events } = setup();
  const retake = (password: string) => proctor.grantRetake({ exam_id: 1, student_name: "hs", password }, "ip");

  // Con luot thi khong can (va khong duoc) cap them
  await assert.rejects(retake(PASS), (e: AppError) => e.status === 409);
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });

  // Het luot: khong lay duoc de, server bao can giam thi
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409 && e.extra.needsProctor === true);
  await assert.rejects(retake("000000"), (e: AppError) => e.status === 401);
  assert.deepEqual(await retake(PASS), { ok: true, attempt: 2 });
  assert.equal(events.at(-1)?.type, "CHO_LAM_LAI");

  // Lan 2: lay de + nop duoc, diem moi
  await examService.getExamForStudent(1, "hs");
  const second = await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT });
  assert.equal(second.earned, 4);
  const history = await submissions.history("hs");
  assert.equal(history.total, 2);

  // Lan 3 lai can mat khau; ma rieng cua de cung cho lam lai duoc
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }), (e: AppError) => e.status === 409);
  assert.deepEqual(await retake(CODE), { ok: true, attempt: 3 });
  // Thi sinh khac khong bi anh huong
  await examService.getExamForStudent(1, "hs-khac");
});

test("admin xem mật khẩu đề: mã riêng của đề + mật khẩu chung; đổi mã riêng; đề cũ được tạo mã khi xem", async () => {
  const { codes, examRow, proctor } = setup();
  assert.deepEqual(await codes.getCode(1), { exam_id: 1, code: CODE, common: PASS });
  const fresh = await codes.getCode(1, true);
  assert.match(fresh.code, /^\d{6}$/);
  assert.notEqual(fresh.code, CODE);
  assert.equal(fresh.common, PASS);
  assert.equal(examRow(1)?.proctor_code, fresh.code);
  // Ma rieng cu het hieu luc, ma moi dung duoc (mo khoa)
  await assert.rejects(proctor.authorizeExit({ type: "MO_KHOA", student_name: "a", exam_id: 1, password: CODE }, "ip"), (e: AppError) => e.status === 401);
  assert.deepEqual(await proctor.authorizeExit({ type: "MO_KHOA", student_name: "b", exam_id: 1, password: fresh.code }, "ip"), { ok: true });
  const legacy = await codes.getCode(2);
  assert.match(legacy.code, /^\d{6}$/);
  assert.equal(examRow(2)?.proctor_code, legacy.code);
  await assert.rejects(codes.getCode(99), (e: AppError) => e.status === 404);
});

test("cho làm lại (tối đa 3 lần): 3 lần đầu không cần mật khẩu; lần 4 trở đi giám thị nhập mật khẩu đề", async () => {
  const { submissions, examService, proctor, db } = setup();
  await db.update("exams", { id: 1 }, { allow_retake: true });
  for (let i = 0; i < 3; i++) {
    // Con luot -> khong can (va khong duoc) nhap mat khau cho lam lai
    await assert.rejects(proctor.grantRetake({ exam_id: 1, student_name: "hs", password: PASS }, "ip"), (e: AppError) => e.status === 409);
    await examService.getExamForStudent(1, "hs");
    await submissions.submit({ exam_id: 1, student_name: "hs", answers: i === 2 ? RIGHT : {} });
  }
  assert.equal((await submissions.history("hs")).total, 3);
  // Lan 4: het luot mien phi -> can giam thi
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409 && e.extra.needsProctor === true);
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }), (e: AppError) => e.status === 409);
  assert.deepEqual(await proctor.grantRetake({ exam_id: 1, student_name: "hs", password: CODE }, "ip"), { ok: true, attempt: 4 });
  await examService.getExamForStudent(1, "hs");
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT });
  // Lan 5 lai can mat khau (moi lan nhap them 1 luot)
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409);
  assert.equal((await submissions.history("hs")).total, 4);
});

test("tắt \"cho làm lại\" sau khi đã làm nhiều lượt: giám thị vẫn mở được đúng 1 lượt", async () => {
  const { submissions, examService, proctor, db } = setup();
  await db.update("exams", { id: 1 }, { allow_retake: true });
  for (let i = 0; i < 3; i++) await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  // Tat lai -> ve mac dinh: het luot, phai nhap mat khau de
  await db.update("exams", { id: 1 }, { allow_retake: false });
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409 && e.extra.needsProctor === true);
  // Da nop 3 luot luc de bat -> giam thi cho lam lai van mo duoc DUNG 1 luot (luot thu 4), khong bi ket
  assert.deepEqual(await proctor.grantRetake({ exam_id: 1, student_name: "hs", password: PASS }, "ip"), { ok: true, attempt: 4 });
  await examService.getExamForStudent(1, "hs");
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT });
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409);
  assert.deepEqual(await proctor.grantRetake({ exam_id: 1, student_name: "hs", password: PASS }, "ip"), { ok: true, attempt: 5 });
  await examService.getExamForStudent(1, "hs");
});

test("chống nộp trùng: nộp lại cùng khoá lượt (mất phản hồi) trả kết quả cũ, kể cả đề cho làm lại nhiều lần", async () => {
  const { submissions, db, results } = setup();
  await db.update("exams", { id: 1 }, { allow_retake: true });
  const first = await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, submission_key: "luot-1" });
  await assert.rejects(
    submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, submission_key: "luot-1" }),
    (e: AppError) => e.status === 409 && (e.extra.result as { id: number; earned: number }).id === first.id && (e.extra.result as { earned: number }).earned === 4
  );
  assert.equal(results.length, 1);
  // Luot moi (khoa moi) van nop duoc; thi sinh khac dung trung khoa khong anh huong
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {}, submission_key: "luot-2" });
  await submissions.submit({ exam_id: 1, student_name: "hs-khac", answers: {}, submission_key: "luot-1" });
  assert.equal(results.length, 3);
});

test("chống dò mật khẩu chung theo IP: đổi tên / đổi chỗ nhập (vào đề, giám thị) vẫn bị tính chung", async () => {
  const { config, db } = setup();
  const exams = new ExamRepository(db);
  const events = new EventRepository(db);
  const attempts = new AttemptService({ results: new ResultRepository(db), events });
  const ipLimiter = new RateLimiter({ maxFails: 4 });
  const proctor = new ProctorService({ config, exams, events, attempts, limiter: new RateLimiter({ maxFails: 3 }), ipLimiter });
  const entry = new EntryPasswordService({ config, exams, events, limiter: new RateLimiter({ maxFails: 3 }), ipLimiter });
  await db.update("exams", { id: 1 }, { require_password: true });
  const exam = (await exams.findById(1))!;
  // 2 lan sai o thoat khan cap (2 ten khac nhau) + 2 lan sai o mat khau vao de -> khoa may
  for (const name of ["a", "b"]) {
    await assert.rejects(proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: name, exam_id: 1, password: "sai" }, "ip-x"), (e: AppError) => e.status === 401);
  }
  for (const name of ["c", "d"]) {
    await assert.rejects(entry.admit(exam, name, { ip: "ip-x", password: "sai" }), (e: AppError) => e.status === 401);
  }
  await assert.rejects(proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "e", exam_id: 1, password: PASS }, "ip-x"), (e: AppError) => e.status === 429);
  await assert.rejects(entry.admit(exam, "f", { ip: "ip-x", password: PASS }), (e: AppError) => e.status === 429);
  // May khac khong bi anh huong
  assert.deepEqual(await proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "e", exam_id: 1, password: PASS }, "ip-y"), { ok: true });
});

test("nộp bài trong SEB: trả trang thoát SEB (nút \"Thoát Safe Exam Browser\"); trình duyệt thường thì không", async () => {
  const db = new MemoryDatabase({ exams: [EXAM] });
  const results = new ResultRepository(db);
  const attempts = new AttemptService({ results, events: new EventRepository(db) });
  const examService = new ExamService({ exams: new ExamRepository(db), attempts, grading });
  const submissions = new SubmissionService({ examService, results, attempts, grading, sebQuitUrl: (id, origin) => `${origin}/seb-quit.html?exam=${id}` });
  const inSeb = await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} }, SEB);
  assert.equal(inSeb.seb_quit_url, "https://thi.example.edu.vn/seb-quit.html?exam=1");
  const normal = await submissions.submit({ exam_id: 1, student_name: "hs2", answers: {} }, BROWSER);
  assert.equal(normal.seb_quit_url, undefined);
});

test("admin: token đúng qua, token sửa / hết hạn bị chặn", () => {
  let now = 1_000_000;
  const auth = new AuthService({ config: setup().config, limiter: new RateLimiter(), now: () => now });
  assert.throws(() => auth.login("sai", "ip"), (e: AppError) => e.status === 401);
  const { token } = auth.login("admin-pass", "ip");
  assert.equal(auth.assertAdmin(`Bearer ${token}`).role, "admin");
  const forged = Buffer.from(JSON.stringify({ role: "admin", exp: now * 10 })).toString("base64url") + "." + token.split(".")[1];
  assert.throws(() => auth.assertAdmin(`Bearer ${forged}`), (e: AppError) => e.status === 401);
  now += 13 * 3600 * 1000;
  assert.throws(() => auth.assertAdmin(`Bearer ${token}`), (e: AppError) => e.status === 401);
});

test("proxy admin chỉ cho 4 bảng hệ thống", async () => {
  const calls: [string, string | undefined][] = [];
  const rest = async (p: string, o: { method?: string } = {}) => { calls.push([p, o.method]); return null; };
  const svc = new AdminDataService({ db: { rest: rest as never, restWithCount: (async () => ({ rows: [], total: 0 })) as never }, generateCode: () => "424242" });
  await svc.query({ method: "PATCH", path: "exam_results?id=eq.1", body: {} });
  for (const path of ["../auth/v1/users", "pg_secrets?select=*", "exams?select=* ", "examsx"]) {
    assert.throws(() => svc.query({ method: "GET", path }), (e: AppError) => e.status === 400);
  }
  await svc.query({ method: "TRUNCATE", path: "exams" });
  assert.deepEqual(calls, [["exam_results?id=eq.1", "PATCH"], ["exams", "GET"]]);
});

test("xuất bản đề mới: server tự gắn mã giám thị, trình duyệt không tự đặt được mã yếu", async () => {
  const bodies: unknown[] = [];
  const rest = async (_p: string, o: { body?: unknown } = {}) => { bodies.push(o.body); return null; };
  const svc = new AdminDataService({ db: { rest: rest as never, restWithCount: (async () => ({ rows: [], total: 0 })) as never }, generateCode: () => "424242" });
  await svc.query({ method: "POST", path: "exams", body: { title: "A", questions: [] } });
  await svc.query({ method: "POST", path: "exams", body: { title: "B", proctor_code: "1" } });
  await svc.query({ method: "PATCH", path: "exams?id=eq.1", body: { title: "C" } });
  assert.deepEqual(bodies, [
    { title: "A", questions: [], proctor_code: "424242" },
    { title: "B", proctor_code: "424242" },
    { title: "C" }
  ]);
});

test("thiếu biến môi trường báo lỗi 500 rõ ràng", () => {
  assert.throws(() => new Config({}).supabaseServiceKey, (e: AppError) => e.status === 500 && /SUPABASE_SERVICE_ROLE_KEY/.test(e.message));
});

test("IP chống dò mật khẩu: không tin X-Forwarded-For khi chạy thẳng", () => {
  const req = { headers: { "x-forwarded-for": "1.2.3.4, 10.0.0.1" }, socket: { remoteAddress: "192.168.1.20" } } as never;
  assert.equal(Router.clientIp(req, false), "192.168.1.20");
  assert.equal(Router.clientIp(req, true), "1.2.3.4");
});

test("mở khoá bài thi bị khoá: cần mật khẩu đề (chung hoặc riêng), ghi MO_KHOA", async () => {
  const { proctor, events } = setup();
  const body = { type: "MO_KHOA", student_name: "hs", exam_id: 1, detail: "rời bài 2 lần" };
  await assert.rejects(proctor.authorizeExit({ ...body, password: "000000" }, "ip"), (e: AppError) => e.status === 401);
  assert.deepEqual(await proctor.authorizeExit({ ...body, password: PASS }, "ip"), { ok: true });
  assert.deepEqual(await proctor.authorizeExit({ ...body, password: CODE }, "ip"), { ok: true });
  assert.deepEqual(events.map(e => e.type), ["SAI_MAT_KHAU", "MO_KHOA", "MO_KHOA"]);
});

test("SupabaseDatabase: dịch interface Database sang đúng truy vấn PostgREST", async () => {
  const calls: { url: string; method: string; prefer?: string; body?: string }[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    const headers = init.headers as Record<string, string>;
    calls.push({ url: decodeURIComponent(url.replace("https://x.supabase.co/rest/v1/", "")), method: String(init.method), prefer: headers.Prefer, body: init.body as string });
    return new Response(init.method === "DELETE" ? "" : JSON.stringify([{ id: 7 }]), { status: 200 });
  }) as unknown as typeof fetch;
  const db = new SupabaseDatabase(new Config({ SUPABASE_URL: "https://x.supabase.co/", SUPABASE_SERVICE_ROLE_KEY: "k" }), fakeFetch);

  await db.select("exam_results", { columns: ["id", "score"], filter: { exam_id: 5, student_name: "Nguyễn An", exam_title: null }, orderBy: { column: "id", ascending: false }, limit: 1 });
  await db.insert("exam_events", { type: "MO_KHOA" });
  await db.update("exams", { id: 3 }, { proctor_code: "123456" });
  await db.remove("exams", { id: 3 });
  assert.deepEqual(calls.map(c => [c.method, c.url, c.prefer]), [
    ["GET", "exam_results?exam_id=eq.5&student_name=eq.Nguyễn An&exam_title=is.null&select=id,score&order=id.desc&limit=1", undefined],
    ["POST", "exam_events", "return=representation"],
    ["PATCH", "exams?id=eq.3", "return=representation"],
    ["DELETE", "exams?id=eq.3", undefined]
  ]);
  // Khong cho sua / xoa ca bang vi quen dieu kien
  await assert.rejects(db.update("exams", {}, { title: "x" }), /điều kiện lọc/);
  await assert.rejects(db.remove("exams", {}), /điều kiện lọc/);
});

test("MemoryDatabase và repository: lọc, sắp xếp, chọn cột giống Supabase", async () => {
  const db = new MemoryDatabase();
  const results = new ResultRepository(db);
  for (const [exam_id, name, score] of [[1, "an", 5], [1, "an", 7], [2, "an", 9], [1, "binh", 3]] as const) {
    await results.create({ exam_id, student_name: name, score, total_questions: 1, duration_minutes: 1, answers: [], submitted_at: null });
  }
  const mine = await results.listByExamAndStudent(1, "an");
  assert.deepEqual(mine.map(r => r.score), [7, 5]); // moi nhat truoc
  assert.equal("student_name" in mine[0], false); // chi cac cot tom tat
  assert.equal((await results.listByStudent("an")).length, 3);
});

// ------------------------------------------------------------ Safe Exam Browser
const SEB: ClientInfo = { isSeb: true, origin: "https://thi.example.edu.vn" };
const BROWSER: ClientInfo = { isSeb: false, origin: "https://thi.example.edu.vn" };

function sebSetup() {
  const ctx = setup();
  const exams = new ExamRepository(ctx.db);
  const seb = new SebConfigService({ config: ctx.config, exams, randomPassword: () => "MatKhauThoat_&<1" });
  return { ...ctx, exams, seb };
}

test("SEB: đề bắt buộc SEB thì trình duyệt thường không lấy đề / nộp bài được", async () => {
  const { seb, examService, submissions } = sebSetup();
  await seb.settings(1, SEB.origin, { require: true });
  await assert.rejects(examService.getExamForStudent(1, "hs", BROWSER), (e: AppError) => e.status === 403 && e.extra.needsSeb === true);
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 403);
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }, BROWSER), (e: AppError) => e.status === 403);
  assert.equal((await examService.getExamForStudent(1, "hs", SEB)).id, 1);
  assert.equal((await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }, SEB)).earned, 4);
  // De khong bat buoc: trinh duyet thuong van lam duoc
  assert.equal((await examService.getExamForStudent(2, "hs", BROWSER)).id, 2);
});

test("SEB: file .seb đúng định dạng, không chứa mật khẩu gốc, có trang bắt đầu / thoát", async () => {
  const { seb } = sebSetup();
  const xml = await seb.configFile(1, SEB.origin);
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<!DOCTYPE plist/);
  assert.match(xml, /<key>startURL<\/key>\n\t<string>https:\/\/thi\.example\.edu\.vn\/index\.html<\/string>/);
  assert.match(xml, /<key>sebConfigPurpose<\/key>\n\t<integer>0<\/integer>/);
  assert.match(xml, /<key>browserWindowAllowReload<\/key>\n\t<false\/>/);
  const hash = crypto.createHash("sha256").update("MatKhauThoat_&<1").digest("hex");
  assert.ok(xml.includes(`<string>${hash}</string>`));
  assert.ok(!xml.includes("MatKhauThoat"));
  const quit = seb.quitUrl(1, SEB.origin);
  assert.ok(xml.includes(quit.replace(/&/g, "&amp;")), "quitURL phai duoc escape XML");
  assert.notEqual(seb.quitPath(1), seb.quitPath(2)); // moi de 1 trang thoat rieng
});

test("SEB: cài đặt admin, đổi mật khẩu thoát, link seb:// / sebs://", async () => {
  const { seb, examRow } = sebSetup();
  const first = await seb.settings(1, "https://thi.example.edu.vn");
  assert.equal(first.require_seb, false);
  assert.equal(first.seb_link, "sebs://thi.example.edu.vn/api/seb-config?exam_id=1");
  assert.equal((await seb.settings(1, "http://localhost:3000")).seb_link, "seb://localhost:3000/api/seb-config?exam_id=1");
  assert.equal((await seb.settings(1, SEB.origin, { require: true })).require_seb, true);
  assert.equal(examRow(1)?.require_seb, true);
  const other = new SebConfigService({ config: setup().config, exams: new ExamRepository(new MemoryDatabase({ exams: [EXAM] })) });
  const a = await other.settings(1, SEB.origin);
  const b = await other.settings(1, SEB.origin, { regenerate: true });
  assert.notEqual(a.quit_password, b.quit_password);
  assert.ok(b.quit_password.length >= 16);
});

test("thoát khẩn cấp đúng mật khẩu: chỉ ghi sự cố, không trả trang thoát SEB (thí sinh về danh sách đề)", async () => {
  const { proctor, events } = setup();
  const body = { type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1, password: PASS };
  assert.deepEqual(await proctor.authorizeExit(body, "ip"), { ok: true });
  assert.equal(events.at(-1)?.type, "THOAT_KHAN_CAP");
});

test("Router nhận diện Safe Exam Browser và địa chỉ trang", () => {
  const req = (headers: Record<string, string>) => ({ headers, socket: {} }) as never;
  // User-Agent that cua SEB co dau phay ("KHTML, like Gecko") -> khong duoc cat o dau phay
  const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36 SEB/3.7.1";
  assert.deepEqual(Router.clientInfo(req({ host: "localhost:3000", "user-agent": ua }), false), { isSeb: true, origin: "http://localhost:3000" });
  assert.equal(Router.clientInfo(req({ host: "a", "user-agent": "Mozilla/5.0 Chrome/120" }), false).isSeb, false);
  const proxied = req({ host: "internal", "x-forwarded-host": "thi.edu.vn", "x-forwarded-proto": "https" });
  assert.equal(Router.clientInfo(proxied, true).origin, "https://thi.edu.vn");
  assert.equal(Router.clientInfo(proxied, false).origin, "http://internal"); // khong tin header proxy khi chay thang
});

// ------------------------------------------------------------ Mat khau vao de
function entrySetup() {
  const db = new MemoryDatabase({ exams: [EXAM] });
  const exams = new ExamRepository(db);
  const results = new ResultRepository(db);
  const events = new EventRepository(db);
  let password = PASS;
  const config = new Config({ get SESSION_SECRET() { return "s".repeat(32); }, get PROCTOR_PASSWORD() { return password; } });
  const attempts = new AttemptService({ results, events });
  const entry = new EntryPasswordService({ config, exams, events, limiter: new RateLimiter({ maxFails: 3 }) });
  const examService = new ExamService({ exams, attempts, grading, entryPasswords: entry });
  return { db, entry, examService, submissions: new SubmissionService({ examService, results, attempts, grading }), setPassword: (p: string) => { password = p; } };
}

test("mật khẩu vào đề: mặc định tắt, vào tự do", async () => {
  const { entry, examService } = entrySetup();
  assert.deepEqual(await entry.settings(1), { exam_id: 1, enabled: false });
  const exam = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip" });
  assert.equal(exam.entry_token, undefined);
});

test("mật khẩu vào đề: bật thì nhập mật khẩu chung hoặc mã riêng của đề; vé vào đề dùng lại được; đổi mật khẩu thì vé cũ hết hạn", async () => {
  const { entry, examService, db, setPassword } = entrySetup();
  assert.deepEqual(await entry.settings(1, { enabled: true }), { exam_id: 1, enabled: true });

  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip" }), (e: AppError) => e.status === 401 && e.extra.needsPassword === true);
  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: "999999" }), (e: AppError) => e.status === 401 && /Còn 2 lần/.test(e.message));
  assert.equal(db.rows("exam_events").at(-1)?.type, "SAI_MAT_KHAU");
  // Ma rieng cua de cung vao duoc
  assert.ok((await examService.getExamForStudent(1, "hs-ma-rieng", undefined, { ip: "ip2", password: CODE })).entry_token);

  const { entry_token: token } = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: PASS });
  assert.ok(token);
  assert.equal((await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", token })).id, 1); // tai lai trang
  await assert.rejects(examService.getExamForStudent(1, "hs-khac", undefined, { ip: "ip", token }), (e: AppError) => e.status === 401); // ve cua nguoi khac

  setPassword("11112222"); // doi PROCTOR_PASSWORD
  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip", token }), (e: AppError) => e.status === 401);
});

test("mật khẩu vào đề: nộp bài phải kèm vé hợp lệ; tắt đi thì không cần", async () => {
  const { entry, examService, submissions } = entrySetup();
  await entry.settings(1, { enabled: true });
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }), (e: AppError) => e.status === 401);
  const { entry_token } = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: PASS });
  assert.equal((await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, entry_token })).earned, 4);
  await entry.settings(1, { enabled: false });
  assert.equal((await submissions.submit({ exam_id: 1, student_name: "hs2", answers: {} })).earned, 0);
});

// ------------------------------------------------------------ Phan trang
test("danh sách đề: 3 đề / trang, mới nhất trước, tìm theo tên, kèm lần nộp của thí sinh", async () => {
  const db = new MemoryDatabase({ exams: ["Toán 10", "Toán 11 giữa kì", "Lý 11", "Toán 12", "Hoá 11"].map((title, i) => ({ id: 10001 + i, title, questions: [] })) });
  const results = new ResultRepository(db);
  const exams = new ExamRepository(db);
  const examService = new ExamService({ exams, attempts: new AttemptService({ results, events: new EventRepository(db) }), grading, results });
  await results.create({ exam_id: 10004, student_name: "an", score: 7.5, total_questions: 1, duration_minutes: 1, answers: [], submitted_at: "2026-11-20T01:00:00Z" });

  const p1 = await examService.listExams({ student: "an" });
  assert.deepEqual(p1.items.map(e => e.title), ["Hoá 11", "Toán 12", "Lý 11"]); // moi tao truoc
  assert.deepEqual([p1.total, p1.page, p1.size], [5, 1, 3]);
  assert.equal(p1.items[1].my_result?.score, 7.5);
  assert.equal(p1.items[0].my_result, undefined);

  const p2 = await examService.listExams({ page: 2 });
  assert.deepEqual(p2.items.map(e => e.title), ["Toán 11 giữa kì", "Toán 10"]);

  const found = await examService.listExams({ q: "toán 1" });
  assert.deepEqual([found.total, found.items.map(e => e.title)], [3, ["Toán 12", "Toán 11 giữa kì", "Toán 10"]]);
  assert.equal((await examService.listExams({ size: 999 })).size, 50); // gioi han kich thuoc trang
});

test("lịch sử làm bài: 3 bài / trang, mới nhất trước, chỉ của thí sinh đó", async () => {
  const { submissions, db } = setup();
  for (let i = 0; i < 5; i++) await db.insert("exam_results", { exam_id: 1, student_name: "an", score: i, answers: [], submitted_at: null });
  await db.insert("exam_results", { exam_id: 1, student_name: "binh", score: 9, answers: [], submitted_at: null });
  const p1 = await submissions.history("an");
  assert.deepEqual([p1.total, p1.items.map(r => r.score)], [5, [4, 3, 2]]);
  assert.deepEqual((await submissions.history("an", 2)).items.map(r => r.score), [1, 0]);
});

test("SupabaseDatabase: phân trang, đếm, tìm kiếm, lọc IN / khoảng thời gian", async () => {
  const urls: string[] = [];
  const fakeFetch = (async (url: string, init: RequestInit) => {
    urls.push(`${init.method} ${decodeURIComponent(url.replace("https://x.supabase.co/rest/v1/", ""))} ${(init.headers as Record<string, string>).Prefer ?? ""}`.trim());
    return new Response("[]", { status: 200, headers: { "Content-Range": "0-2/57" } });
  }) as unknown as typeof fetch;
  const db = new SupabaseDatabase(new Config({ SUPABASE_URL: "https://x.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "k" }), fakeFetch);
  await db.select("exams", { columns: ["id"], search: { column: "title", term: "toán*11" }, orderBy: { column: "created_at", ascending: false }, offset: 6, limit: 3 });
  assert.equal(await db.count("exam_results", { filter: { student_name: "an", exam_id: [1, 2], submitted_at: { gte: "2026-11-20", lt: "2026-11-21" } } }), 57);
  await db.select("exam_results", { filter: { student_name: ['A "B"', "C,D"] } });
  assert.deepEqual(urls, [
    "GET exams?title=ilike.*toán 11*&select=id&order=created_at.desc&limit=3&offset=6",
    "GET exam_results?student_name=eq.an&exam_id=in.(1,2)&submitted_at=gte.2026-11-20&submitted_at=lt.2026-11-21&select=id count=exact",
    'GET exam_results?student_name=in.("A \\"B\\"","C,D")&select=*'
  ]);
});

test("link tải app: chuyển tới file .apk mới nhất có tên kèm phiên bản; GitHub lỗi thì dùng link cố định; cache 5 phút", async () => {
  let calls = 0;
  let now = 0;
  let healthy = true;
  const fakeFetch = (async () => {
    calls++;
    if (!healthy) throw new Error("mat mang");
    return new Response(JSON.stringify({ assets: [
      { name: "safe-exam.apk", browser_download_url: "https://x/safe-exam.apk", updated_at: "2026-11-20T09:00:00Z" },
      { name: "safe-exam-v1.0.apk", browser_download_url: "https://x/safe-exam-v1.0.apk", updated_at: "2026-11-20T07:00:00Z" },
      { name: "safe-exam-v1.1.apk", browser_download_url: "https://x/safe-exam-v1.1.apk", updated_at: "2026-11-20T08:00:00Z" }
    ] }), { status: 200 });
  }) as unknown as typeof fetch;
  const svc = new AppDownloadService({ repo: "chu/repo", fetchImpl: fakeFetch, now: () => now });
  assert.equal(await svc.latestUrl(), "https://x/safe-exam-v1.1.apk");
  now += 60_000;
  assert.equal(await svc.latestUrl(), "https://x/safe-exam-v1.1.apk");
  assert.equal(calls, 1); // con trong 5 phut: khong hoi lai GitHub
  healthy = false;
  now += 10 * 60_000;
  assert.equal(await svc.latestUrl(), "https://github.com/chu/repo/releases/download/apk-latest/safe-exam.apk");
});

test("phiên bản: dạng LỚN.NHỎ; nhỏ 1.0 → 1.1, lớn 1.5 → 2.0", () => {
  assert.match(APP_VERSION, VERSION_PATTERN, "file VERSION phai dang LON.NHO (vd 1.1)");
  assert.equal(bump("1.0", "small"), "1.1");
  assert.equal(bump("1.9", "small"), "1.10");
  assert.equal(bump("1.5", "big"), "2.0");
  assert.throws(() => bump("1", "small"), /LỚN.NHỎ/);
});

test("cho làm lại xong: mật khẩu đề không tự đổi, cả 2 mật khẩu vẫn dùng được", async () => {
  const { submissions, proctor, examRow } = setup();
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  await proctor.grantRetake({ exam_id: 1, student_name: "hs", password: CODE }, "ip");
  assert.equal(examRow(1)?.proctor_code, CODE);
  assert.deepEqual(await proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1, password: PASS }, "ip2"), { ok: true });
  assert.deepEqual(await proctor.authorizeExit({ type: "MO_KHOA", student_name: "hs", exam_id: 1, password: CODE }, "ip3"), { ok: true });
});

test("lịch sử theo đề: chỉ các lần làm của đề đó", async () => {
  const { submissions, db } = setup();
  for (const exam_id of [1, 1, 2]) await db.insert("exam_results", { exam_id, student_name: "an", score: exam_id, answers: [], submitted_at: null });
  assert.equal((await submissions.history("an", 1, 3, 1)).total, 2);
  assert.equal((await submissions.history("an", 1, 3, "2")).total, 1);
  assert.equal((await submissions.history("an")).total, 3);
});

test("đổi mật khẩu riêng của đề giữa ca thi: học sinh đã vào đề (vé vào đề) vẫn nộp được bài", async () => {
  const db = new MemoryDatabase({ exams: [{ ...EXAM, require_password: true }] });
  const exams = new ExamRepository(db);
  const results = new ResultRepository(db);
  const events = new EventRepository(db);
  const config = new Config({ PROCTOR_PASSWORD: PASS, SESSION_SECRET: "s".repeat(32) });
  const attempts = new AttemptService({ results, events });
  const entry = new EntryPasswordService({ config, exams, events, limiter: new RateLimiter() });
  const examService = new ExamService({ exams, attempts, grading, entryPasswords: entry });
  const submissions = new SubmissionService({ examService, results, attempts, grading });
  const { entry_token } = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: CODE });
  await new ProctorCodeService({ config, exams }).getCode(1, true); // admin doi ma rieng
  assert.equal((await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, entry_token })).earned, 4);
});

test("vé lượt: đang làm dở mà admin tắt \"làm lại nhiều lần\" → vẫn tải lại + nộp được lượt đó; nộp xong vé hết hạn", async () => {
  const { submissions, examService, db, results } = setup();
  await db.update("exams", { id: 1 }, { allow_retake: true });
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {}, submission_key: "luot-1" });
  // Vao luot 2 luc de con bat -> nhan ve luot
  const { attempt_ticket } = await examService.getExamForStudent(1, "hs");
  assert.ok(attempt_ticket);
  await db.update("exams", { id: 1 }, { allow_retake: false });
  // Tai lai trang: khong co ve -> het luot; co ve -> vao tiep
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409 && e.extra.needsProctor === true);
  assert.equal((await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", attemptTicket: attempt_ticket })).id, 1);
  // Nop: bai cua luot 2 duoc luu (khong tra nham ket qua luot 1)
  const second = await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, submission_key: "luot-2", attempt_ticket });
  assert.equal(second.earned, 4);
  assert.equal(results.length, 2);
  // Ve cu khong dung lai duoc de nop them
  await assert.rejects(
    submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, submission_key: "luot-3", attempt_ticket }),
    (e: AppError) => e.status === 409 && (e.extra.result as { id: number }).id === second.id
  );
  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip", attemptTicket: attempt_ticket }), (e: AppError) => e.status === 409);
  assert.equal(results.length, 2);
});

test("bản nháp đã nộp (mất phản hồi) ở đề làm lại nhiều lần: server báo draft_submitted để máy bỏ bản nháp", async () => {
  const { submissions, examService, db } = setup();
  await db.update("exams", { id: 1 }, { allow_retake: true });
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT, submission_key: "luot-1" });
  assert.equal((await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", submissionKey: "luot-1" })).draft_submitted, true);
  assert.equal((await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", submissionKey: "luot-chua-nop" })).draft_submitted, undefined);
  assert.equal((await examService.getExamForStudent(1, "hs-khac", undefined, { ip: "ip", submissionKey: "luot-1" })).draft_submitted, undefined);
});

test("bấm \"cho làm lại\" 2 lần cùng lúc chỉ mở 1 lượt", async () => {
  const { submissions, examService, proctor } = setup();
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  const grant = (ip: string) => proctor.grantRetake({ exam_id: 1, student_name: "hs", password: PASS }, ip);
  await Promise.all([grant("ip-1"), grant("ip-2")]);
  await examService.getExamForStudent(1, "hs");
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409);
});

test("giới hạn dò mật khẩu có cửa sổ thời gian: sai rải rác cả ngày không bị khoá; nhập đúng thì xoá đếm", () => {
  let now = 0;
  const lim = new RateLimiter({ maxFails: 3, lockMs: 60_000, windowMs: 10 * 60_000, now: () => now });
  for (let i = 0; i < 10; i++) { lim.recordFailure("ip"); now += 11 * 60_000; } // moi lan cach 11 phut
  lim.assertNotLocked("ip");
  lim.recordFailure("ip"); lim.recordFailure("ip");
  assert.equal(lim.recordFailure("ip"), 0); // 3 lan lien tiep -> khoa
  assert.throws(() => lim.assertNotLocked("ip"), (e: AppError) => e.status === 429);
  // Nhap dung o noi khac (reset) -> het khoa
  lim.reset("ip");
  lim.assertNotLocked("ip");
});

test("lịch sử phiên bản: đọc CHANGELOG (ngày, thay đổi, bắt buộc cài lại app)", () => {
  const md = [
    "# Lịch sử", "", "## Quy tắc", "- abc", "", "---", "",
    "## 1.3 · 2026-11-21", "", "- Bàn phím số", "- **App Android: cần gỡ app cũ, cài lại.**", "",
    "## 1.2 · 2026-11-20", "", "- Mật khẩu đề", "- App Android **không** cần cài lại.", "",
    "## 1.1", "", "- Lịch sử theo đề"
  ].join("\n");
  const e = parseChangelog(md);
  assert.deepEqual(e.map(x => [x.version, x.date, x.requiresAppUpdate]), [["1.3", "2026-11-21", true], ["1.2", "2026-11-20", false], ["1.1", null, false]]);
  assert.equal(e[0].notes, "- Bàn phím số\n- **App Android: cần gỡ app cũ, cài lại.**");
});

test("phiên bản app tối thiểu: so theo số (1.10 > 1.9), chỉ chặn khi file app mới đã build xong", () => {
  assert.ok(compareVersions("1.10", "1.9") > 0);
  assert.ok(compareVersions("v1.2", "1.3") < 0);
  assert.equal(compareVersions("2.0", "2.0"), 0);
  const req = ["1.1", "1.3", "1.5"];
  assert.equal(requiredAppVersion(req, "1.4", "1.4"), "1.3");   // 1.5 chua phat hanh
  assert.equal(requiredAppVersion(req, "1.3", "1.2"), "1.1");   // app 1.3 chua build xong -> chua chan theo 1.3
  assert.equal(requiredAppVersion(req, "1.3", null), null);     // khong biet file app -> khong chan
  assert.equal(requiredAppVersion([], "1.3", "1.3"), null);
});

test("VersionService: min_app_version từ bảng app_versions; lỗi database / GitHub thì không chặn; cache 1 phút", async () => {
  let now = 0;
  let apk: string | null = "1.3";
  const db = new MemoryDatabase();
  for (const [version, requires_app_update] of [["1.1", true], ["1.2", false], ["1.3", true]] as const) await db.insert("app_versions", { version, requires_app_update, notes: "" });
  const svc = new VersionService({ db, latestApkVersion: async () => apk, version: "1.3", commit: () => "abc1234", now: () => now });
  assert.deepEqual(await svc.info(), { version: "1.3", commit: "abc1234", min_app_version: "1.3" });
  apk = null;
  assert.equal((await svc.info()).min_app_version, "1.3"); // con trong cache
  now += 61_000;
  assert.equal((await svc.info()).min_app_version, null);   // khong biet file app -> khong chan
  const broken = new VersionService({ db: { select: async () => { throw new Error("relation app_versions does not exist"); } } as never, latestApkVersion: async () => "1.3", version: "1.3" });
  assert.equal((await broken.info()).min_app_version, null);
});

test("link tải app: đọc phiên bản từ tên file .apk mới nhất", async () => {
  const fetchImpl = (async () => new Response(JSON.stringify({ assets: [
    { name: "safe-exam-v1.3.apk", browser_download_url: "https://x/safe-exam-v1.3.apk", updated_at: "2026-11-21" },
    { name: "safe-exam-v1.2.apk", browser_download_url: "https://x/safe-exam-v1.2.apk", updated_at: "2026-11-20" }
  ] }))) as unknown as typeof fetch;
  assert.equal(await new AppDownloadService({ repo: "chu/repo", fetchImpl }).latestVersion(), "1.3");
  const down = (async () => new Response("", { status: 500 })) as unknown as typeof fetch;
  assert.equal(await new AppDownloadService({ repo: "chu/repo", fetchImpl: down }).latestVersion(), null);
});
