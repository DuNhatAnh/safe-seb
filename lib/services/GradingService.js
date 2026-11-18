// Cham diem + loc dap an tren server bang CHINH registry dang cau cua trinh duyet
// (public/js/question-types.js), de logic cham chi co 1 noi.
// Nap app.js + question-types.js vao 1 vm context rieng (1 lan, dung chung).
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const JS_DIR = path.join(__dirname, "..", "..", "public", "js");

class GradingService {
  constructor(jsDir = JS_DIR) {
    const context = vm.createContext({ console });
    for (const file of ["app.js", "question-types.js"]) {
      vm.runInContext(fs.readFileSync(path.join(jsDir, file), "utf8"), context, { filename: file });
    }
    Object.assign(this, vm.runInContext("({ gradeAll, typeIdOf, QUESTION_TYPES })", context));
  }

  // Cham ca de: { entries, earned, total, autoMax, pending, score }
  grade(questions, rawAnswers) {
    return this.gradeAll(questions, this.cleanAnswers(rawAnswers, questions.length));
  }

  // Chi giu nhung truong thi sinh can de hien thi. Dap an (is_correct, is_true, answer, answers, solution) bi bo.
  sanitizeQuestion(q) {
    const id = this.typeIdOf(q);
    const out = { type: q.type, question: q.question };
    if (q.image) out.image = q.image;
    if (Number.isInteger(q.part)) out.part = q.part;
    if (typeof q.points === "number") out.points = q.points;
    if (Array.isArray(q.options)) out.options = q.options.map(o => ({ text: o.text }));
    if (Array.isArray(q.statements)) out.statements = q.statements.map(s => ({ text: s.text }));
    if (id === "essay") {
      const answers = Array.isArray(q.answers) ? q.answers : (q.answer !== undefined ? [q.answer] : []);
      out.numeric = this.QUESTION_TYPES.essay.isNumeric({ answers }); // chi lo "dap an la so", khong lo gia tri
    }
    return out;
  }

  // Dap an thi sinh gui len: { [index]: gia tri }. Chi nhan kieu du lieu hop le, bo phan thua.
  cleanAnswers(raw, count) {
    const out = {};
    if (!raw || typeof raw !== "object") return out;
    for (let i = 0; i < count; i++) {
      const v = raw[i];
      if (Number.isInteger(v)) out[i] = v;
      else if (typeof v === "string" && v.length <= 500) out[i] = v;
      else if (Array.isArray(v) && v.length <= 10 && v.every(x => x === null || typeof x === "boolean")) out[i] = v;
    }
    return out;
  }

  // Tong hop diem tu cac dong ket qua da luu (tinh ca ket qua dinh dang cu)
  summarize(entries) {
    const list = (Array.isArray(entries) ? entries : []).filter(e => e && typeof e === "object");
    const total = list.reduce((s, e) => s + (e.max ?? 1), 0);
    const earned = list.reduce((s, e) => s + (e.points ?? (e.is_correct ? 1 : 0)), 0);
    const autoMax = list.filter(e => !e.pending).reduce((s, e) => s + (e.max ?? 1), 0);
    const pending = list.filter(e => e.pending).length;
    return { earned: Math.round(earned * 100) / 100, total, autoMax, pending };
  }
}

module.exports = { GradingService };
