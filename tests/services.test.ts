// Test nghiep vu bang repository gia trong bo nho: khong can server, khong can Supabase.
// Chay: npm test
const test = require("node:test");
const assert = require("node:assert/strict");

const { GradingService } = require("../lib/services/GradingService");
const { ExamService } = require("../lib/services/ExamService");
const { SubmissionService } = require("../lib/services/SubmissionService");
const { ProctorService } = require("../lib/services/ProctorService");
const { AuthService } = require("../lib/services/AuthService");
const { AdminDataService } = require("../lib/services/AdminDataService");
const { RateLimiter } = require("../lib/security/RateLimiter");
const { Config } = require("../lib/config");

const EXAM = {
  id: 1,
  title: "Đề thử",
  duration_minutes: 30,
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

function setup() {
  const results = [];
  const events = [];
  const examsRepo = { listSummaries: async () => [{ id: 1, title: EXAM.title }], findById: async id => (Number(id) === 1 ? EXAM : null) };
  const resultsRepo = {
    rows: results,
    findByExamAndStudent: async (examId, name) => results.find(r => r.exam_id === examId && r.student_name === name) || null,
    listByStudent: async name => results.filter(r => r.student_name === name),
    create: async row => { const saved = { id: results.length + 1, ...row }; results.push(saved); return saved; }
  };
  const eventsRepo = { rows: events, create: async e => { events.push(e); } };
  const config = new Config({ ADMIN_PASSWORD: "admin-pass", PROCTOR_PASSWORD: "gt-pass", SESSION_SECRET: "s".repeat(32) });
  const examService = new ExamService({ exams: examsRepo, results: resultsRepo, grading });
  return {
    results, events, config, examService,
    submissions: new SubmissionService({ examService, results: resultsRepo, grading }),
    proctor: new ProctorService({ config, events: eventsRepo, limiter: new RateLimiter({ maxFails: 3 }) })
  };
}

test("đề gửi thí sinh không có đáp án", async () => {
  const { examService } = setup();
  const exam = await examService.getExamForStudent(1, "hs");
  assert.doesNotMatch(JSON.stringify(exam), /is_correct|is_true|"answer"|"answers"|solution|bí mật/);
  assert.equal(exam.questions[3].numeric, false);
  assert.equal(exam.questions[0].options[1].text, "2");
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
  const { entries } = grading.grade(EXAM.questions, RIGHT);
  assert.deepEqual(entries.slice(0, 4).map(e => e.points), [1, 1, 1, 1]);
});

test("dữ liệu đáp án rác bị loại", () => {
  assert.deepEqual(grading.cleanAnswers({ 0: { hack: 1 }, 1: "x".repeat(600), 2: [true, "y"], 3: "ok", 9: 1 }, 5), { 3: "ok" });
});

test("nộp lần 2 bị chặn và trả lại kết quả cũ", async () => {
  const { submissions, examService } = setup();
  await submissions.submit({ exam_id: 1, student_name: "hs", answers: RIGHT });
  await assert.rejects(submissions.submit({ exam_id: 1, student_name: "hs", answers: {} }), e => e.status === 409 && e.extra.result.earned === 4);
  await assert.rejects(examService.getExamForStudent(1, "hs"), e => e.status === 409);
});

test("mã đề sai / không tồn tại", async () => {
  const { examService } = setup();
  await assert.rejects(examService.getExamForStudent("1;drop", "hs"), e => e.status === 400);
  await assert.rejects(examService.getExamForStudent(99, "hs"), e => e.status === 404);
});

test("giám thị: sai ghi SAI_MAT_KHAU, sai 3 lần thì khoá kể cả nhập đúng", async () => {
  const { proctor, events } = setup();
  const body = { type: "THOAT_KHAN_CAP", student_name: "hs", exam_id: 1 };
  for (let i = 0; i < 3; i++) await assert.rejects(proctor.authorizeExit({ ...body, password: "sai" }, "ip"), e => e.status === 401);
  await assert.rejects(proctor.authorizeExit({ ...body, password: "gt-pass" }, "ip"), e => e.status === 429);
  assert.equal(events.filter(e => e.type === "SAI_MAT_KHAU").length, 3);
  // may khac khong bi anh huong
  assert.deepEqual(await proctor.authorizeExit({ ...body, password: "gt-pass", detail: "mệt" }, "ip-2"), { ok: true });
  assert.equal(events.at(-1).type, "THOAT_KHAN_CAP");
});

test("admin: token đúng qua, token sửa / hết hạn bị chặn", () => {
  let now = 1_000_000;
  const auth = new AuthService({ config: setup().config, limiter: new RateLimiter(), now: () => now });
  assert.throws(() => auth.login("sai", "ip"), e => e.status === 401);
  const { token } = auth.login("admin-pass", "ip");
  assert.equal(auth.assertAdmin(`Bearer ${token}`).role, "admin");
  const forged = Buffer.from(JSON.stringify({ role: "admin", exp: now * 10 })).toString("base64url") + "." + token.split(".")[1];
  assert.throws(() => auth.assertAdmin(`Bearer ${forged}`), e => e.status === 401);
  now += 13 * 3600 * 1000;
  assert.throws(() => auth.assertAdmin(`Bearer ${token}`), e => e.status === 401);
});

test("proxy admin chỉ cho 4 bảng hệ thống", async () => {
  const calls = [];
  const svc = new AdminDataService({ db: { request: async (p, o) => { calls.push([p, o.method]); return []; } } });
  await svc.query({ method: "PATCH", path: "exam_results?id=eq.1", body: {} });
  for (const path of ["../auth/v1/users", "pg_secrets?select=*", "exams?select=* ", "examsx"]) {
    assert.throws(() => svc.query({ method: "GET", path }), e => e.status === 400);
  }
  await svc.query({ method: "TRUNCATE", path: "exams" });
  assert.deepEqual(calls, [["exam_results?id=eq.1", "PATCH"], ["exams", "GET"]]);
});

test("thiếu biến môi trường báo lỗi 500 rõ ràng", () => {
  assert.throws(() => new Config({}).supabaseServiceKey, e => e.status === 500 && /SUPABASE_SERVICE_ROLE_KEY/.test(e.message));
});
