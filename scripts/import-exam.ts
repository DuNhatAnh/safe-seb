// Nhap de tu file JSON (dinh dang "Nhap JSON" cua trang admin) thang vao database.
//   npm run exam:import -- docs/de-mau/de.json              nhap that
//   npm run exam:import -- docs/de-mau/de.json --dry-run    chi kiem tra, khong ghi
// Kiem tra bang CHINH logic trang admin (normalizeExam), tu chon / tao mau cau truc de, tu sinh ma giam thi.
// Ma de do database tu cap (so ngau nhien 5 chu so, migration 0006).
import fs from "node:fs";
import path from "node:path";
import { Config } from "../lib/config.ts";
import { loadEnvFile } from "../lib/infra/env.ts";
import { SupabaseDatabase } from "../lib/infra/database/SupabaseDatabase.ts";
import { PROJECT_ROOT } from "../lib/paths.ts";
import { generateProctorCode } from "../lib/security/proctorCode.ts";
import { GradingService, type ExamTemplate } from "../lib/services/GradingService.ts";
import type { AnswerMap, ExamRow, Question } from "../lib/types.ts";

loadEnvFile(path.join(PROJECT_ROOT, ".env"));
const [file, ...flags] = process.argv.slice(2);
const dryRun = flags.includes("--dry-run");

class ImportError extends Error { }

// Khong goi process.exit (Node tren Windows co the bao loi libuv khi con ket noi mang dang dong)
function fail(message: string): never {
  throw new ImportError(message);
}

async function main(): Promise<void> {
if (!file) fail("Thiếu file: npm run exam:import -- duong/dan/de.json [--dry-run]");
const data = JSON.parse(fs.readFileSync(path.resolve(file), "utf8")) as { parts?: { type?: string; questions?: { points?: number }[] }[] };
if (!Array.isArray(data.parts)) fail('JSON phải có "parts": [{ "type", "questions": [...] }]');

const grading = new GradingService();
const db = new SupabaseDatabase(new Config());

// ---- Mau cau truc: mau da luu / mau mac dinh khop dang + so cau; khong co -> tao mau moi tu JSON
const saved = (await db.select<{ value: ExamTemplate[] }>("app_settings", { filter: { key: "exam_templates" } }))[0]?.value;
const templates: ExamTemplate[] = Array.isArray(saved) && saved.length ? saved : grading.defaultTemplates;
const types = data.parts.map(p => p.type ?? "single");
const fits = (t: ExamTemplate): boolean => t.parts.length === types.length && t.parts.every((p, i) => p.type === types[i]) && !grading.normalize(data, t).errors.length;
let template = templates.find(fits);
let newTemplate = false;
if (!template) {
  const counts = data.parts.map(p => p.questions?.length ?? 0);
  template = {
    id: `tpl${Date.now()}`,
    name: `Toán ${types.length} phần (${counts.map((c, i) => `${["I", "II", "III", "IV", "V"][i]}: ${c}`).join(" · ")})`,
    parts: data.parts.map(p => ({ type: p.type ?? "single", count: p.questions?.length ?? 0, points: p.questions?.[0]?.points ?? 1 }))
  };
  newTemplate = true;
}

const exam = grading.normalize(data, template);
if (exam.errors.length) fail(`Đề có lỗi:\n  - ${exam.errors.join("\n  - ")}`);
if (!exam.title) fail('Thiếu "title".');

// ---- Tu kiem tra: tra loi dung het phai duoc 10 diem
const right: AnswerMap = {};
exam.questions.forEach((q: Question, i) => {
  const t = grading.typeOf(q);
  if (t === "single") right[i] = q.options!.findIndex(o => o.is_correct);
  if (t === "true_false") right[i] = q.statements!.map(s => !!s.is_true);
  if (t === "short_number") right[i] = q.answer!;
  if (t === "essay") right[i] = q.answers![0];
});
const check = grading.grade(exam.questions, right);

console.log(`Đề:        ${exam.title}`);
console.log(`Thời gian: ${exam.duration_minutes} phút · ${exam.questions.length} câu · tổng ${check.total} điểm`);
console.log(`Cấu trúc:  ${template.name}${newTemplate ? " (mẫu mới)" : ""}`);
console.log(`Tự kiểm tra: trả lời đúng hết = ${check.score}/10${check.pending ? ` (+${check.pending} câu giáo viên chấm)` : ""}`);
if (!check.pending && check.score !== 10) fail("Trả lời đúng hết mà không được 10 điểm: kiểm tra lại đáp án / điểm.");

if (dryRun) {
  console.log("--dry-run: không ghi vào database.");
} else {
  await save();
}

async function save(): Promise<void> {
if (newTemplate) {
  await db.rest("app_settings?on_conflict=key", {
    method: "POST",
    body: { key: "exam_templates", value: [...templates, template] },
    prefer: "resolution=merge-duplicates,return=representation"
  });
}
const created = await db.insert<ExamRow>("exams", {
  title: exam.title,
  duration_minutes: exam.duration_minutes || 45,
  questions: exam.questions,
  proctor_code: generateProctorCode()
});
console.log(`✔ Đã nhập: mã đề ${created.id} · mật khẩu riêng của đề ${created.proctor_code} (mật khẩu chung PROCTOR_PASSWORD cũng dùng được)`);
}
}

main().catch(err => {
  console.error(`✖ ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
