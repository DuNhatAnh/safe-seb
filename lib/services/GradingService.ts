// Cham diem + loc dap an tren server bang CHINH registry dang cau cua trinh duyet
// (public/js/question-types.js), de logic cham chi co 1 noi.
// Nap app.js + question-types.js vao 1 vm context rieng (1 lan, dung chung).
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { PUBLIC_JS_DIR } from "../paths.ts";
import type { AnswerMap, AnswerValue, GradedEntry, GradeResult, Question, ScoreSummary, StudentQuestion } from "../types.ts";

// Mau cau truc de (Phan I, II, III...): dang cau, so cau (0 = tuy y), diem moi cau
export interface ExamTemplate {
  id: string;
  name: string;
  parts: { type: string; count: number; points: number }[];
}

export interface NormalizedExam {
  title: string;
  duration_minutes: number | null;
  questions: Question[];
  errors: string[];
}

// Phan cua registry trinh duyet ma server dung toi
interface BrowserGrading {
  gradeAll(questions: Question[], answers: AnswerMap): GradeResult;
  typeIdOf(q: Question): string;
  normalizeExam(data: unknown, template: ExamTemplate): NormalizedExam;
  DEFAULT_TEMPLATES: ExamTemplate[];
  QUESTION_TYPES: { essay: { isNumeric(q: { answers: string[] }): boolean } };
}

export class GradingService {
  private readonly browser: BrowserGrading;

  constructor(jsDir: string = PUBLIC_JS_DIR) {
    const context = vm.createContext({ console });
    for (const file of ["app.js", "question-types.js"]) {
      vm.runInContext(fs.readFileSync(path.join(jsDir, file), "utf8"), context, { filename: file });
    }
    this.browser = vm.runInContext("({ gradeAll, typeIdOf, normalizeExam, DEFAULT_TEMPLATES, QUESTION_TYPES })", context) as BrowserGrading;
  }

  // Kiem tra + chuan hoa JSON de thi y het trang admin khi nhap de (gan part, points theo mau)
  normalize(data: unknown, template: ExamTemplate): NormalizedExam {
    return JSON.parse(JSON.stringify(this.browser.normalizeExam(data, template))) as NormalizedExam;
  }

  get defaultTemplates(): ExamTemplate[] {
    return JSON.parse(JSON.stringify(this.browser.DEFAULT_TEMPLATES)) as ExamTemplate[];
  }

  typeOf(q: Question): string {
    return this.browser.typeIdOf(q);
  }

  // Cham ca de: { entries, earned, total, autoMax, pending, score }
  grade(questions: Question[], rawAnswers: unknown): GradeResult {
    return this.browser.gradeAll(questions, this.cleanAnswers(rawAnswers, questions.length));
  }

  // Chi giu nhung truong thi sinh can de hien thi. Dap an (is_correct, is_true, answer, answers, solution) bi bo.
  sanitizeQuestion(q: Question): StudentQuestion {
    const out: StudentQuestion = { type: q.type, question: q.question };
    if (q.image) out.image = q.image;
    if (Number.isInteger(q.part)) out.part = q.part;
    if (typeof q.points === "number") out.points = q.points;
    if (Array.isArray(q.options)) out.options = q.options.map(o => ({ text: o.text }));
    if (Array.isArray(q.statements)) out.statements = q.statements.map(s => ({ text: s.text }));
    if (this.browser.typeIdOf(q) === "essay") {
      const answers = Array.isArray(q.answers) ? q.answers : (q.answer !== undefined ? [q.answer] : []);
      out.numeric = this.browser.QUESTION_TYPES.essay.isNumeric({ answers }); // chi lo "dap an la so", khong lo gia tri
    }
    return out;
  }

  // Dap an thi sinh gui len: { [index]: gia tri }. Chi nhan kieu du lieu hop le, bo phan thua.
  cleanAnswers(raw: unknown, count: number): AnswerMap {
    const out: AnswerMap = {};
    if (!raw || typeof raw !== "object") return out;
    const input = raw as Record<string, unknown>;
    for (let i = 0; i < count; i++) {
      const v = input[i];
      if (GradingService.isAnswerValue(v)) out[i] = v;
    }
    return out;
  }

  static isAnswerValue(v: unknown): v is AnswerValue {
    if (Number.isInteger(v)) return true;
    if (typeof v === "string") return v.length <= 500;
    return Array.isArray(v) && v.length <= 10 && v.every(x => x === null || typeof x === "boolean");
  }

  // Tong hop diem tu cac dong ket qua da luu (tinh ca ket qua dinh dang cu)
  summarize(entries: unknown): ScoreSummary {
    const list = (Array.isArray(entries) ? entries : []).filter((e): e is GradedEntry => !!e && typeof e === "object");
    const total = list.reduce((s, e) => s + (e.max ?? 1), 0);
    const earned = list.reduce((s, e) => s + (e.points ?? (e.is_correct ? 1 : 0)), 0);
    const autoMax = list.filter(e => !e.pending).reduce((s, e) => s + (e.max ?? 1), 0);
    const pending = list.filter(e => e.pending).length;
    return { earned: Math.round(earned * 100) / 100, total, autoMax, pending };
  }
}
