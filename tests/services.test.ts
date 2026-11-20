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

const CODE = "135790";
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

// De cu (truoc khi co ma giam thi) -> dung PROCTOR_PASSWORD trong .env
const LEGACY_EXAM: ExamRow = { id: 2, title: "Đề cũ", duration_minutes: 10, questions: EXAM.questions, proctor_code: null };

// Service + repository THAT tren MemoryDatabase (cung interface Database voi SupabaseDatabase)
function setup() {
  const db = new MemoryDatabase({ exams: [EXAM, LEGACY_EXAM] });
  const exams = new ExamRepository(db);
  const resultsRepo = new ResultRepository(db);
  const eventsRepo = new EventRepository(db);
  const config = new Config({ ADMIN_PASSWORD: "admin-pass", PROCTOR_PASSWORD: "gt-pass", SESSION_SECRET: "s".repeat(32) });
  const attempts = new AttemptService({ results: resultsRepo, events: eventsRepo });
  const examService = new ExamService({ exams, attempts, grading });
  return {
    db, config, examService,
    results: db.rows("exam_results"),
    events: db.rows("exam_events"),
    examRow: (id: number) => db.rows("exams").find(e => e.id === id),
    submissions: new SubmissionService({ examService, results: resultsRepo, attempts, grading }),
    proctor: new ProctorService({ config, exams, events: eventsRepo, attempts, limiter: new RateLimiter({ maxFails: 3 }) }),
    codes: new ProctorCodeService({ exams })
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
  await assert.rejects(proctor.authorizeExit({ ...body, password: CODE }, "ip"), (e: AppError) => e.status === 429);
  assert.equal(events.filter(e => e.type === "SAI_MAT_KHAU").length, 3);
  // may khac khong bi anh huong
  assert.deepEqual(await proctor.authorizeExit({ ...body, password: CODE, detail: "mệt" }, "ip-2"), { ok: true });
  assert.equal(events.at(-1)?.type, "THOAT_KHAN_CAP");
});

test("mã giám thị theo đề: đề có mã thì mật khẩu chung không dùng được; đề cũ dùng mật khẩu chung", async () => {
  const { proctor } = setup();
  await assert.rejects(proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "a", exam_id: 1, password: "gt-pass" }, "ip"), (e: AppError) => e.status === 401);
  assert.deepEqual(await proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "b", exam_id: 2, password: "gt-pass" }, "ip"), { ok: true });
  await assert.rejects(proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "c", exam_id: 2, password: CODE }, "ip"), (e: AppError) => e.status === 401);
});

test("làm lại: hết lượt cần mã giám thị, mỗi lần nhập đúng thêm 1 lượt", async () => {
  const { submissions, examService, proctor, events } = setup();
  const retake = (password: string) => proctor.grantRetake({ exam_id: 1, student_name: "hs", password }, "ip");

  // Con luot thi khong can (va khong duoc) cap them
  await assert.rejects(retake(CODE), (e: AppError) => e.status === 409);
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });

  // Het luot: khong lay duoc de, server bao can giam thi
  await assert.rejects(examService.getExamForStudent(1, "hs"), (e: AppError) => e.status === 409 && e.extra.needsProctor === true);
  await assert.rejects(retake("000000"), (e: AppError) => e.status === 401);
  assert.deepEqual(await retake(CODE), { ok: true, attempt: 2 });
  assert.equal(events.at(-1)?.type, "CHO_LAM_LAI");

  // Lan 2: lay de + nop duoc, diem moi
  await examService.getExamForStudent(1, "hs");
  const second = await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT });
  assert.equal(second.earned, 4);
  const history = await submissions.history("hs");
  assert.equal(history.total, 2);

  // Lan 3 lai can ma
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }), (e: AppError) => e.status === 409);
  // Thi sinh khac khong bi anh huong
  await examService.getExamForStudent(1, "hs-khac");
});

test("admin xem / đổi mã giám thị; đề cũ được tạo mã khi xem", async () => {
  const { codes, examRow } = setup();
  assert.deepEqual(await codes.getCode(1), { exam_id: 1, code: CODE });
  const fresh = await codes.getCode(1, true);
  assert.match(fresh.code, /^\d{6}$/);
  assert.notEqual(fresh.code, CODE);
  assert.equal(examRow(1)?.proctor_code, fresh.code);
  const legacy = await codes.getCode(2);
  assert.match(legacy.code, /^\d{6}$/);
  assert.equal(examRow(2)?.proctor_code, legacy.code);
  await assert.rejects(codes.getCode(99), (e: AppError) => e.status === 404);
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

test("mở khoá bài thi bị khoá: cần mã của đề, ghi MO_KHOA", async () => {
  const { proctor, events } = setup();
  const body = { type: "MO_KHOA", student_name: "hs", exam_id: 1, detail: "rời bài 2 lần" };
  await assert.rejects(proctor.authorizeExit({ ...body, password: "gt-pass" }, "ip"), (e: AppError) => e.status === 401);
  assert.deepEqual(await proctor.authorizeExit({ ...body, password: CODE }, "ip"), { ok: true });
  assert.deepEqual(events.map(e => e.type), ["SAI_MAT_KHAU", "MO_KHOA"]);
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

test("SEB: giám thị nhập đúng mã khi thoát trong SEB → trả trang thoát để SEB tự đóng", async () => {
  const { proctor } = setup();
  const withQuit = new ProctorService({
    config: setup().config, exams: new ExamRepository(new MemoryDatabase({ exams: [EXAM] })),
    events: new EventRepository(new MemoryDatabase()),
    attempts: new AttemptService({ results: new ResultRepository(new MemoryDatabase()), events: new EventRepository(new MemoryDatabase()) }),
    limiter: new RateLimiter(), sebQuitUrl: (id, origin) => `${origin}/seb-quit.html?exam=${id}`
  });
  const body = { type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1, password: CODE };
  assert.deepEqual(await withQuit.authorizeExit(body, "ip", SEB), { ok: true, seb_quit_url: "https://thi.example.edu.vn/seb-quit.html?exam=1" });
  assert.deepEqual(await withQuit.authorizeExit(body, "ip", BROWSER), { ok: true });
  assert.deepEqual(await withQuit.authorizeExit({ ...body, type: "MO_KHOA" }, "ip", SEB), { ok: true }); // mo khoa: lam tiep, khong thoat
  assert.deepEqual(await proctor.authorizeExit(body, "ip", SEB), { ok: true }); // khong cau hinh trang thoat
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
  const config = new Config({ SESSION_SECRET: "s".repeat(32) });
  const attempts = new AttemptService({ results, events });
  let n = 0;
  const entry = new EntryPasswordService({ config, exams, events, limiter: new RateLimiter({ maxFails: 3 }), generate: () => ["111111", "222222", "333333"][n++] });
  const examService = new ExamService({ exams, attempts, grading, entryPasswords: entry });
  return { db, entry, examService, submissions: new SubmissionService({ examService, results, attempts, grading }) };
}

test("mật khẩu vào đề: mặc định tắt, vào tự do", async () => {
  const { entry, examService } = entrySetup();
  assert.deepEqual(await entry.settings(1), { exam_id: 1, enabled: false, password: null });
  const exam = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip" });
  assert.equal(exam.entry_token, undefined);
});

test("mật khẩu vào đề: bật thì phải nhập đúng; vé vào đề dùng lại được; đổi mật khẩu thì vé cũ hết hạn", async () => {
  const { entry, examService, db } = entrySetup();
  assert.deepEqual(await entry.settings(1, { enabled: true }), { exam_id: 1, enabled: true, password: "111111" });

  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip" }), (e: AppError) => e.status === 401 && e.extra.needsPassword === true);
  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: "999999" }), (e: AppError) => e.status === 401 && /Còn 2 lần/.test(e.message));
  assert.equal(db.rows("exam_events").at(-1)?.type, "SAI_MAT_KHAU");
  // Mat khau vao de KHONG phai ma giam thi
  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip2", password: CODE }), (e: AppError) => e.status === 401);

  const { entry_token: token } = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: "111111" });
  assert.ok(token);
  assert.equal((await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", token })).id, 1); // tai lai trang
  await assert.rejects(examService.getExamForStudent(1, "hs-khac", undefined, { ip: "ip", token }), (e: AppError) => e.status === 401); // ve cua nguoi khac

  assert.equal((await entry.settings(1, { regenerate: true })).password, "222222");
  await assert.rejects(examService.getExamForStudent(1, "hs", undefined, { ip: "ip", token }), (e: AppError) => e.status === 401);
});

test("mật khẩu vào đề: nộp bài phải kèm vé hợp lệ; tắt đi thì không cần", async () => {
  const { entry, examService, submissions } = entrySetup();
  await entry.settings(1, { enabled: true });
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT }), (e: AppError) => e.status === 401);
  const { entry_token } = await examService.getExamForStudent(1, "hs", undefined, { ip: "ip", password: "111111" });
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

test("cho làm lại xong: mã giám thị tự đổi, mã cũ hết hiệu lực", async () => {
  const { submissions, proctor, examRow } = setup();
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: {} });
  await proctor.grantRetake({ exam_id: 1, student_name: "hs", password: CODE }, "ip");
  const fresh = String(examRow(1)?.proctor_code);
  assert.match(fresh, /^\d{6}$/);
  assert.notEqual(fresh, CODE);
  await assert.rejects(proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1, password: CODE }, "ip2"), (e: AppError) => e.status === 401);
  assert.deepEqual(await proctor.authorizeExit({ type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1, password: fresh }, "ip3"), { ok: true });
});

test("lịch sử theo đề: chỉ các lần làm của đề đó", async () => {
  const { submissions, db } = setup();
  for (const exam_id of [1, 1, 2]) await db.insert("exam_results", { exam_id, student_name: "an", score: exam_id, answers: [], submitted_at: null });
  assert.equal((await submissions.history("an", 1, 3, 1)).total, 2);
  assert.equal((await submissions.history("an", 1, 3, "2")).total, 1);
  assert.equal((await submissions.history("an")).total, 3);
});
