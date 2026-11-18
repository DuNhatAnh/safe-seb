// =====================================================================
// REGISTRY DANG CAU HOI + CAU TRUC DE (PHAN I, II, III...)
// Nguon duy nhat cho moi logic theo dang cau va theo cau truc de.
// Admin (import, preview, form, quy tac, mau cau truc, cham tay) va thi sinh
// (hien thi, doc dap an, cham diem) deu goi qua day.
// Them dang moi = them 1 entry vao QUESTION_TYPES.
// Phu thuoc app.js: escapeHtml, renderMath, parseNumber, normalizeText, PREFIXES.
// =====================================================================

const TF_LETTERS = "abcd";
const TF_SCALE = [0, 0.1, 0.25, 0.5, 1]; // Thang THPT 2025: dung 0/1/2/3/4 y
const SHORT_MAX_LEN = 4;
const NUMBER_HINT = "Ví dụ: 0,75 · -12 · 1/2 · 2 1/3";

const str = v => String(v ?? "").trim();

// So khop dap an go tay: neu moi dap an chap nhan deu la so -> so theo gia tri, nguoc lai so chuoi
function matchTypedAnswer(user, accepted) {
  if (!accepted.length) return false;
  if (accepted.every(a => parseNumber(a) !== null)) {
    const u = parseNumber(user);
    return u !== null && accepted.some(a => Math.abs(parseNumber(a) - u) < 1e-9);
  }
  const u = normalizeText(user);
  return u !== "" && accepted.some(a => normalizeText(a) === u);
}

// O nhap dap an dung chung cho cac dang go tay (essay, short_number)
function typedInputHtml(raw, { numeric, maxLength, placeholder, hint, boxes }) {
  return `
    ${boxes ? '<div class="answer-boxes-label">Đáp án:</div>' : ""}
    <input type="text" class="form-control answer-input ${boxes ? "answer-boxes" : ""}" data-ans="input"
      ${numeric ? 'inputmode="decimal"' : ""} ${maxLength ? `maxlength="${maxLength}"` : ""}
      placeholder="${escapeHtml(placeholder)}" value="${escapeHtml(raw ?? "")}" autocomplete="off">
    <div class="field-error" style="display:none;"></div>
    <div class="field-hint">${escapeHtml(hint)}</div>`;
}

const QUESTION_TYPES = {
  // -------------------------------------------------------------- Trac nghiem
  single: {
    label: "Trắc nghiệm",
    description: "Chọn 1 đáp án đúng trong 2–6 phương án.",
    intro: n => `Thí sinh trả lời từ câu 1 đến câu ${n}. Mỗi câu hỏi thí sinh chỉ chọn một phương án.`,
    rule: [
      `"options": 2–${PREFIXES.length} phương án, mỗi phương án {"text", "is_correct"}.`,
      `Đúng 1 phương án có "is_correct": true.`
    ],
    example: {
      type: "single",
      question: "Kết quả của $\\frac{1}{2} + \\frac{1}{4}$ là?",
      options: [
        { text: "$\\frac{3}{4}$", is_correct: true },
        { text: "$\\frac{2}{6}$", is_correct: false },
        { text: "$1$", is_correct: false },
        { text: "$\\frac{1}{8}$", is_correct: false }
      ]
    },

    normalize(q) {
      const errors = [];
      const options = (Array.isArray(q.options) ? q.options : []).map(o => typeof o === "string"
        ? { text: o.trim(), is_correct: false }
        : { text: str(o?.text), is_correct: o?.is_correct === true || o?.correct === true });
      if (options.length < 2 || options.length > PREFIXES.length) errors.push(`cần 2–${PREFIXES.length} phương án`);
      if (options.some(o => !o.text)) errors.push("có phương án bị bỏ trống");
      const correct = options.filter(o => o.is_correct).length;
      if (correct !== 1) errors.push(`cần đúng 1 đáp án đúng (hiện có ${correct})`);
      return { q: { options }, errors };
    },

    renderPreview(q) {
      return q.options.map((o, i) => `
        <div class="pv-row ${o.is_correct ? "pv-correct" : ""}">
          <strong>${PREFIXES[i]}.</strong> ${renderMath(o.text)}
          ${o.is_correct ? '<span class="badge badge-green">Đúng</span>' : ""}
        </div>`).join("");
    },

    renderEditor(q) {
      const opts = q?.options?.length ? q.options : [0, 1, 2, 3].map(i => ({ text: "", is_correct: i === 0 }));
      return `
        <label class="form-label">Phương án (chọn ô tròn ở đáp án đúng)</label>
        <div class="ed-list">${opts.map(o => QUESTION_TYPES.single.editorRow(o)).join("")}</div>
        <button type="button" class="btn btn-outline btn-sm" onclick="qtAddRow(this, 'single')">+ Thêm phương án</button>`;
    },

    editorRow(o = { text: "", is_correct: false }) {
      return `
        <div class="ed-row">
          <input type="radio" name="edCorrect" ${o.is_correct ? "checked" : ""}>
          <input type="text" class="form-control ed-text" value="${escapeHtml(o.text)}" placeholder="Nội dung phương án (có thể dùng $...$)">
          <button type="button" class="btn btn-outline btn-sm btn-danger-outline" onclick="this.parentElement.remove()">✕</button>
        </div>`;
    },

    readEditor(root) {
      return {
        options: [...root.querySelectorAll(".ed-row")].map(r => ({
          text: r.querySelector(".ed-text").value.trim(),
          is_correct: r.querySelector('input[type="radio"]').checked
        }))
      };
    },

    renderExam(q, answer) {
      return q.options.map((o, i) => `
        <div class="option-item ${answer === i ? "selected" : ""}" data-ans="${i}">
          <span class="option-prefix">${PREFIXES[i] || i + 1}</span>
          <span>${renderMath(o.text)}</span>
        </div>`).join("");
    },

    update(q, prev, el) {
      return { value: Number(el.dataset.ans), log: `chọn ${PREFIXES[el.dataset.ans]}` };
    },

    isAnswered: a => Number.isInteger(a),
    grade: (q, a) => (Number.isInteger(a) && q.options[a]?.is_correct ? 1 : 0),
    formatAnswer: a => (Number.isInteger(a) ? `Chọn [${PREFIXES[a]}]` : "Chưa chọn")
  },

  // ---------------------------------------------------------------- Tu luan
  essay: {
    label: "Tự luận",
    description: "Thí sinh gõ đáp án (chữ hoặc số). Khai báo các đáp án chấp nhận.",
    intro: n => `Thí sinh điền đáp án từ câu 1 đến câu ${n}.`,
    rule: [
      `"answers": mảng các đáp án chấp nhận, ít nhất 1.`,
      `Nếu mọi đáp án đều là số: chấm theo giá trị (3/4 = 0,75 = 0.75).`,
      `Ngược lại: so chữ, không phân biệt hoa/thường, bỏ khoảng trắng thừa (có dấu và không dấu là khác nhau).`
    ],
    example: {
      type: "essay",
      question: "Thủ đô của Việt Nam là thành phố nào?",
      answers: ["Hà Nội", "Ha Noi"]
    },

    normalize(q) {
      const raw = Array.isArray(q.answers) ? q.answers : (q.answer !== undefined ? [q.answer] : []);
      const answers = raw.map(str).filter(Boolean);
      return { q: { answers }, errors: answers.length ? [] : ["cần ít nhất 1 đáp án chấp nhận"] };
    },

    renderPreview: q => `<div class="pv-row pv-correct">Đáp án chấp nhận: <strong>${q.answers.map(renderMath).join(" | ")}</strong></div>`,

    renderEditor: q => `
      <label class="form-label">Đáp án chấp nhận (mỗi dòng 1 đáp án)</label>
      <textarea class="form-control ed-answers" rows="3" placeholder="Hà Nội&#10;Ha Noi">${escapeHtml((q?.answers || []).join("\n"))}</textarea>`,

    readEditor: root => ({ answers: root.querySelector(".ed-answers").value.split(/\r?\n/) }),

    isNumeric: q => q.answers.length > 0 && q.answers.every(a => parseNumber(a) !== null),

    renderExam(q, answer, raw) {
      const numeric = QUESTION_TYPES.essay.isNumeric(q);
      return typedInputHtml(raw ?? answer, {
        numeric,
        placeholder: numeric ? "Nhập đáp án số..." : "Nhập câu trả lời...",
        hint: numeric ? NUMBER_HINT : "Nhập câu trả lời ngắn gọn, chính xác."
      });
    },

    update(q, prev, el) {
      const v = el.value.trim();
      if (!v) return { value: undefined };
      if (QUESTION_TYPES.essay.isNumeric(q) && parseNumber(v) === null) return { invalid: "Sai định dạng số, xem ví dụ bên dưới." };
      return { value: v, log: `nhập "${v}"` };
    },

    isAnswered: a => typeof a === "string" && a !== "",
    grade: (q, a) => (matchTypedAnswer(a, q.answers) ? 1 : 0),
    formatAnswer: a => (a ? `Điền [${renderMath(String(a))}]` : "Bỏ trống")
  },

  // ------------------------------------------------------ Trac nghiem dung sai
  true_false: {
    label: "Trắc nghiệm đúng sai",
    description: "4 ý a, b, c, d — mỗi ý chọn Đúng hoặc Sai. Chấm theo thang THPT (0,1 / 0,25 / 0,5 / 1).",
    intro: n => `Thí sinh trả lời từ câu 1 đến câu ${n}. Mỗi ý a), b), c), d) ở mỗi câu hỏi, thí sinh chọn đúng hoặc sai.`,
    rule: [
      `"statements": đúng 4 ý, mỗi ý {"text", "is_true"} (is_true là true hoặc false).`,
      `Chấm theo thang THPT: đúng 1 ý = 0,1; 2 ý = 0,25; 3 ý = 0,5; 4 ý = 1 điểm câu.`
    ],
    example: {
      type: "true_false",
      question: "Cho hàm số $f(x) = x^{2} - 4$. Xét tính đúng sai của các mệnh đề:",
      statements: [
        { text: "$f(2) = 0$", is_true: true },
        { text: "$f(x)$ đồng biến trên $\\mathbb{R}$", is_true: false },
        { text: "$f(-x) = f(x)$ với mọi $x$", is_true: true },
        { text: "Giá trị nhỏ nhất của $f(x)$ là $-2$", is_true: false }
      ]
    },

    normalize(q) {
      const errors = [];
      const statements = (Array.isArray(q.statements) ? q.statements : []).map(s => ({ text: str(s?.text), is_true: s?.is_true }));
      if (statements.length !== 4) errors.push(`cần đúng 4 ý (hiện có ${statements.length})`);
      if (statements.some(s => !s.text)) errors.push("có ý bị bỏ trống");
      if (statements.some(s => typeof s.is_true !== "boolean")) errors.push(`mỗi ý cần "is_true": true hoặc false`);
      return { q: { statements }, errors };
    },

    renderPreview: q => q.statements.map((s, i) => `
      <div class="pv-row">
        <strong>${TF_LETTERS[i]})</strong> ${renderMath(s.text)}
        <span class="badge ${s.is_true ? "badge-green" : "badge-red"}">${s.is_true ? "Đúng" : "Sai"}</span>
      </div>`).join(""),

    renderEditor(q) {
      const st = q?.statements?.length === 4 ? q.statements : [0, 1, 2, 3].map(() => ({ text: "", is_true: true }));
      return `
        <label class="form-label">4 ý và đáp án Đúng/Sai</label>
        ${st.map((s, i) => `
          <div class="ed-row">
            <strong>${TF_LETTERS[i]})</strong>
            <input type="text" class="form-control ed-text" value="${escapeHtml(s.text)}" placeholder="Nội dung ý ${TF_LETTERS[i]}">
            <select class="form-control ed-tf" style="width:auto;">
              <option value="1" ${s.is_true ? "selected" : ""}>Đúng</option>
              <option value="0" ${s.is_true ? "" : "selected"}>Sai</option>
            </select>
          </div>`).join("")}`;
    },

    readEditor: root => ({
      statements: [...root.querySelectorAll(".ed-row")].map(r => ({
        text: r.querySelector(".ed-text").value.trim(),
        is_true: r.querySelector(".ed-tf").value === "1"
      }))
    }),

    renderExam(q, answer) {
      const a = Array.isArray(answer) ? answer : [];
      return `<table class="tf-table"><thead><tr><th></th><th>Mệnh đề</th><th>Đúng</th><th>Sai</th></tr></thead><tbody>
        ${q.statements.map((s, i) => `
          <tr>
            <td><strong>${TF_LETTERS[i]})</strong></td>
            <td>${renderMath(s.text)}</td>
            <td><button type="button" class="tf-btn ${a[i] === true ? "selected" : ""}" data-ans="${i}:1">Đ</button></td>
            <td><button type="button" class="tf-btn ${a[i] === false ? "selected" : ""}" data-ans="${i}:0">S</button></td>
          </tr>`).join("")}
      </tbody></table>`;
    },

    update(q, prev, el) {
      const [i, v] = el.dataset.ans.split(":");
      const value = Array.isArray(prev) ? [...prev] : [null, null, null, null];
      value[i] = v === "1";
      return { value, log: `ý ${TF_LETTERS[i]} chọn ${v === "1" ? "Đúng" : "Sai"}` };
    },

    isAnswered: a => Array.isArray(a) && a.length === 4 && a.every(v => typeof v === "boolean"),
    grade: (q, a) => TF_SCALE[q.statements.filter((s, i) => Array.isArray(a) && a[i] === s.is_true).length],
    formatAnswer: a => (Array.isArray(a)
      ? [...TF_LETTERS].map((l, i) => `${l}: ${a[i] === true ? "Đ" : a[i] === false ? "S" : "–"}`).join(" · ")
      : "Chưa chọn")
  },

  // ------------------------------------------------- Trac nghiem tra loi ngan
  short_number: {
    label: "Trắc nghiệm trả lời ngắn",
    description: `Đáp án là một số, tối đa ${SHORT_MAX_LEN} ký tự (như đề THPT). Chấm theo giá trị.`,
    intro: n => `Thí sinh trả lời từ câu 1 đến câu ${n}.`,
    rule: [
      `"answer": một số, tối đa ${SHORT_MAX_LEN} ký tự, tính cả dấu "-" và dấu phẩy (vd "0,75", "-12", "1/2").`,
      `Chấm theo giá trị: 1/2 = 0,5 = 0.5.`
    ],
    example: {
      type: "short_number",
      question: "Tính $\\sqrt{16} \\div 8$.",
      answer: "0,5"
    },

    normalize(q) {
      const answer = str(q.answer ?? (Array.isArray(q.answers) ? q.answers[0] : ""));
      const errors = [];
      if (!answer) errors.push(`thiếu "answer"`);
      else if (parseNumber(answer) === null) errors.push(`đáp án "${answer}" không phải số hợp lệ`);
      else if (answer.length > SHORT_MAX_LEN) errors.push(`đáp án "${answer}" dài quá ${SHORT_MAX_LEN} ký tự`);
      return { q: { answer }, errors };
    },

    renderPreview: q => `<div class="pv-row pv-correct">Đáp án: <strong>${escapeHtml(q.answer)}</strong></div>`,

    renderEditor: q => `
      <label class="form-label">Đáp án (số, tối đa ${SHORT_MAX_LEN} ký tự)</label>
      <input type="text" class="form-control ed-answer" maxlength="${SHORT_MAX_LEN}" value="${escapeHtml(q?.answer || "")}" placeholder="0,75">`,

    readEditor: root => ({ answer: root.querySelector(".ed-answer").value }),

    renderExam: (q, answer, raw) => typedInputHtml(raw ?? answer, {
      numeric: true,
      maxLength: SHORT_MAX_LEN,
      boxes: true,
      placeholder: "",
      hint: `Tối đa ${SHORT_MAX_LEN} ký tự. ${NUMBER_HINT}`
    }),

    update(q, prev, el) {
      const v = el.value.trim();
      if (!v) return { value: undefined };
      if (v.length > SHORT_MAX_LEN) return { invalid: `Quá ${SHORT_MAX_LEN} ký tự.` };
      if (parseNumber(v) === null) return { invalid: "Sai định dạng số, xem ví dụ bên dưới." };
      return { value: v, log: `nhập "${v}"` };
    },

    isAnswered: a => typeof a === "string" && a !== "",
    grade: (q, a) => (matchTypedAnswer(a, [q.answer]) ? 1 : 0),
    formatAnswer: a => (a ? `Điền [${escapeHtml(a)}]` : "Bỏ trống")
  },

  // ------------------------------------------------ Tu luan giao vien cham
  essay_manual: {
    label: "Tự luận (giáo viên chấm)",
    description: "Thí sinh làm bài trên giấy. Giáo viên nhập điểm ở trang Kết quả sau khi thí sinh nộp.",
    manual: true,
    intro: () => "Thí sinh làm bài trên giấy. Giáo viên chấm và nhập điểm sau.",
    rule: [
      `Không cần đáp án. "solution" (tuỳ chọn): lời giải / đáp án tham khảo cho giáo viên.`,
      `Câu có nhiều ý a), b) thì viết chung trong "question", mỗi ý một dòng (dùng \\n để xuống dòng).`
    ],
    example: {
      type: "essay_manual",
      question: "Giải phương trình lượng giác: $2\\sin^{2}x - 1 + \\cos\\left(3x + \\frac{\\pi}{3}\\right) = 0$.",
      points: 1,
      solution: "$x = -\\frac{\\pi}{3} + k2\\pi$, $x = -\\frac{\\pi}{15} + \\frac{k2\\pi}{5}$"
    },

    normalize: q => ({ q: { solution: str(q.solution) }, errors: [] }),

    renderPreview: q => (q.solution
      ? `<div class="pv-row pv-correct">Lời giải tham khảo: ${renderMath(q.solution)}</div>`
      : '<div class="pv-row field-hint">Giáo viên chấm tay, không có lời giải tham khảo.</div>'),

    renderEditor: q => `
      <label class="form-label">Lời giải / đáp án tham khảo cho giáo viên (tuỳ chọn)</label>
      <textarea class="form-control ed-solution" rows="3">${escapeHtml(q?.solution || "")}</textarea>`,

    readEditor: root => ({ solution: root.querySelector(".ed-solution").value }),

    renderExam: () => '<div class="alert-box alert-info">Câu tự luận: làm bài trên giấy. Giáo viên sẽ chấm và nhập điểm sau khi bạn nộp bài.</div>',
    update: () => ({ value: undefined }),
    isAnswered: () => false,
    grade: () => null,
    formatAnswer: () => "Làm trên giấy"
  }
};


// =====================================================================
// CAU TRUC DE: mau gom cac Phan (I, II, III...), moi phan = 1 dang cau.
// template = { id, name, parts: [{ type, count, points }] }
//   count: so cau bat buoc (0 = tuy y), points: diem moi cau (mac dinh).
// Cau hoi luu phang: { type, part, points, question, image?, ...truong theo dang }
// =====================================================================

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X"];

const DEFAULT_TEMPLATES = [
  {
    id: "thpt2025",
    name: "Toán THPT 2025",
    parts: [
      { type: "single", count: 12, points: 0.25 },
      { type: "true_false", count: 2, points: 1 },
      { type: "short_number", count: 4, points: 0.5 },
      { type: "essay_manual", count: 3, points: 1 }
    ]
  },
  {
    id: "tracnghiem",
    name: "Trắc nghiệm + Tự luận ngắn",
    parts: [
      { type: "single", count: 0, points: 1 },
      { type: "essay", count: 0, points: 1 }
    ]
  }
];

const fmtNum = n => String(Math.round(n * 100) / 100).replace(".", ",");

// Dang cua 1 cau (de cu: khong co type -> single, "short" -> essay)
function typeIdOf(q) {
  const t = q?.type || "single";
  return t === "short" ? "essay" : t;
}

function getType(q) {
  return QUESTION_TYPES[typeIdOf(q)] || QUESTION_TYPES.single;
}

function partLabel(i) {
  return `PHẦN ${ROMAN[i] || i + 1}`;
}

// Diem toi da cua 1 cau (de cu khong co points -> 1)
function maxPoints(q) {
  return typeof q.points === "number" && q.points >= 0 ? q.points : 1;
}

// Nhom cau theo phan: [{ part, type, items: [{ q, index, num }] }] (num = so thu tu trong phan)
function groupByPart(questions) {
  const groups = [];
  questions.forEach((q, index) => {
    const part = Number.isInteger(q.part) ? q.part : 0;
    let g = groups.find(x => x.part === part);
    if (!g) groups.push(g = { part, type: typeIdOf(q), items: [] });
    g.items.push({ q, index, num: g.items.length + 1 });
  });
  return groups.sort((a, b) => a.part - b.part);
}

// Nhan "Phan I · Cau 3" cho cau thu index
function questionLabel(questions, index) {
  for (const g of groupByPart(questions)) {
    const it = g.items.find(x => x.index === index);
    if (it) return { part: g.part, num: it.num, text: `${partLabel(g.part)} · Câu ${it.num}` };
  }
  return { part: 0, num: index + 1, text: `Câu ${index + 1}` };
}

function templateTotal(t) {
  const fixed = t.parts.every(p => p.count > 0);
  return { fixed, total: t.parts.reduce((s, p) => s + p.count * p.points, 0) };
}

// Chuan hoa 1 cau (khong xet phan). Tra ve { q, errors: [chuoi] }
function normalizeOne(raw) {
  const errors = [];
  const id = typeIdOf(raw);
  const type = QUESTION_TYPES[id];
  const question = str(raw?.question);
  if (!type) return { q: { type: id, question }, errors: [`dạng "${id}" không tồn tại`] };
  if (!question) errors.push('thiếu nội dung "question"');
  if (/[\x08\x0c]/.test(JSON.stringify(raw))) errors.push("công thức bị hỏng do thiếu dấu \\ (hãy viết \\\\frac)");

  const q = { type: id, question };
  const image = str(raw.image);
  if (image) {
    if (/^(data:image\/|https?:\/\/)/.test(image)) q.image = image;
    else errors.push('"image" phải là link ảnh (http...) hoặc ảnh dán vào form');
  }
  if (raw.points !== undefined && raw.points !== null && raw.points !== "") {
    const p = Number(String(raw.points).replace(",", "."));
    if (!(p >= 0)) errors.push('"points" phải là số ≥ 0');
    else q.points = p;
  }
  const r = type.normalize(raw || {});
  return { q: { ...q, ...r.q }, errors: errors.concat(r.errors) };
}

// Chuan hoa ca de theo mau cau truc.
// Nhan: { title, duration_minutes, parts: [{ type, questions: [...] }] }
//   hoac { questions: [...] } / mang cau hoi (moi cau tu xep vao phan cung dang).
// Tra ve { title, duration_minutes, questions (phang, da gan part + points), errors, qErrors }
function normalizeExam(data, template) {
  let title = "", duration_minutes = null;
  const errors = [], qErrors = {};
  const raws = []; // [{ raw, part }]

  if (data && typeof data === "object" && !Array.isArray(data)) {
    title = str(data.title);
    if (data.duration_minutes !== undefined) duration_minutes = parseInt(data.duration_minutes, 10);
  }

  if (Array.isArray(data?.parts)) {
    if (data.parts.length !== template.parts.length) {
      errors.push(`Mẫu "${template.name}" có ${template.parts.length} phần, JSON có ${data.parts.length} phần.`);
    }
    data.parts.forEach((p, i) => {
      const tpl = template.parts[i];
      if (!tpl) return;
      const type = typeIdOf(p);
      if (p.type && type !== tpl.type) {
        errors.push(`${partLabel(i)}: mẫu yêu cầu dạng "${tpl.type}" nhưng JSON là "${type}".`);
      }
      (Array.isArray(p.questions) ? p.questions : []).forEach(q => raws.push({ raw: { ...q, type: tpl.type }, part: i }));
    });
  } else {
    const list = Array.isArray(data) ? data : data?.questions;
    if (!Array.isArray(list)) {
      return { title, duration_minutes, questions: [], errors: ['Cần trường "parts" (hoặc mảng câu hỏi).'], qErrors };
    }
    list.forEach(q => {
      const part = Number.isInteger(q?.part) && template.parts[q.part]?.type === typeIdOf(q)
        ? q.part
        : template.parts.findIndex(p => p.type === typeIdOf(q));
      raws.push({ raw: q, part });
    });
  }

  const questions = [];
  raws.forEach(({ raw, part }) => {
    const { q, errors: errs } = normalizeOne(raw);
    if (part < 0) errs.push(`dạng "${QUESTION_TYPES[q.type]?.label || q.type}" không có trong cấu trúc "${template.name}"`);
    q.part = Math.max(part, 0);
    if (q.points === undefined && template.parts[part]) q.points = template.parts[part].points;
    questions.push({ q, errs });
  });

  // Sap xep theo phan (giu thu tu trong phan), roi gan loi theo vi tri moi
  questions.sort((a, b) => a.q.part - b.q.part);
  const flat = questions.map(x => x.q);
  questions.forEach((x, i) => {
    if (!x.errs.length) return;
    qErrors[i] = x.errs;
    const { text } = questionLabel(flat, i);
    x.errs.forEach(e => errors.push(`${text}: ${e}.`));
  });

  template.parts.forEach((tpl, i) => {
    const n = flat.filter(q => q.part === i).length;
    if (tpl.count > 0 && n !== tpl.count) errors.push(`${partLabel(i)} (${QUESTION_TYPES[tpl.type].label}): cần ${tpl.count} câu, hiện có ${n}.`);
  });
  if (!flat.length) errors.push("Đề thi cần ít nhất 1 câu hỏi.");

  return { title, duration_minutes, questions: flat, errors, qErrors };
}

// Cham ca de. Cau giao vien cham -> points null, pending.
// score: thang 10 = diem dat / tong diem toi da * 10 (phan cho cham tinh 0)
function gradeAll(questions, answers) {
  const entries = questions.map((q, i) => {
    const t = getType(q);
    const max = maxPoints(q);
    const answer = answers[i];
    const ratio = t.grade(q, answer);
    return {
      question_index: i + 1,
      part: q.part ?? 0,
      type: typeIdOf(q),
      answer: answer ?? null,
      max,
      points: ratio === null ? null : Math.round(ratio * max * 1000) / 1000,
      pending: ratio === null
    };
  });
  return { entries, ...summarizeEntries(entries) };
}

// Tong hop diem tu cac dong ket qua (dung ca khi giao vien cham tay xong)
function summarizeEntries(entries) {
  const total = entries.reduce((s, e) => s + (e.max ?? 1), 0);
  const earned = entries.reduce((s, e) => s + (e.points ?? (e.is_correct ? 1 : 0)), 0);
  const autoMax = entries.filter(e => !e.pending).reduce((s, e) => s + (e.max ?? 1), 0);
  const pending = entries.filter(e => e.pending).length;
  const score = total ? Math.round((earned / total) * 1000) / 100 : 0;
  return { earned: Math.round(earned * 100) / 100, total, autoMax, pending, score };
}

// Hien thi 1 dong ket qua da luu (ho tro ket qua cu: selected_index / text_answer / is_correct)
function formatResultEntry(e) {
  const id = e.type === "short" ? "essay" : (e.type || "single");
  const answer = e.answer !== undefined ? e.answer : (e.text_answer ?? e.selected_index ?? null);
  const points = e.points !== undefined ? e.points : (e.is_correct ? 1 : 0);
  const type = QUESTION_TYPES[id] || QUESTION_TYPES.single;
  return { label: type.label, text: type.formatAnswer(answer), points, max: e.max ?? 1, pending: !!e.pending, manual: !!type.manual };
}

// Khoi quy tac dinh dang duy nhat (sao chep 1 lan), sinh tu mau cau truc
function buildRulesText(template) {
  const parts = template.parts.map((p, i) => ({ ...p, i, t: QUESTION_TYPES[p.type] }));
  const usedTypes = [...new Set(parts.map(p => p.type))];
  const { fixed, total } = templateTotal(template);
  const sample = {
    title: "Kiểm tra giữa học kì I - Toán 11",
    duration_minutes: 90,
    parts: parts.map(p => ({ type: p.type, questions: [p.t.example] }))
  };
  return [
    `QUY TẮC ĐỊNH DẠNG ĐỀ THI (JSON) — CẤU TRÚC "${template.name}"`,
    "",
    "1. CẤU TRÚC ĐỀ — đúng thứ tự các phần sau:",
    ...parts.map(p => `   ${partLabel(p.i)}. ${p.t.label} ("type": "${p.type}") — ${p.count > 0 ? `đúng ${p.count} câu` : "số câu tuỳ ý"}, ${fmtNum(p.points)} điểm/câu.`),
    `   ${fixed ? `Tổng: ${fmtNum(total)} điểm.` : "Điểm được quy về thang 10."} Mỗi phần đánh số lại từ Câu 1.`,
    "",
    "2. KHUNG JSON",
    '   { "title": "...", "duration_minutes": 90, "parts": [ { "type": "...", "questions": [ ... ] }, ... ] }',
    '   "parts" có đúng số phần như trên, theo đúng thứ tự. Mỗi câu bắt buộc có "question".',
    '   Tuỳ chọn cho mọi câu: "points" (điểm riêng của câu), "image" (link ảnh hình vẽ).',
    '   Xuống dòng trong nội dung: \\n. Dòng bắt đầu bằng "- " là gạch đầu dòng.',
    "",
    "3. QUY TẮC TỪNG DẠNG",
    ...usedTypes.flatMap(id => [`   [${QUESTION_TYPES[id].label}] "type": "${id}"`, ...QUESTION_TYPES[id].rule.map(r => `     - ${r}`)]),
    "",
    "4. CÔNG THỨC TOÁN — viết trong $...$ (cùng dòng) hoặc $$...$$ (dòng riêng)",
    "   Phân số       $\\\\frac{a}{b}$        Hỗn số     $2\\\\frac{1}{3}$",
    "   Căn bậc 2     $\\\\sqrt{x}$           Căn bậc 3  $\\\\sqrt[3]{x}$",
    "   Lũy thừa      $x^{2}$              Chỉ số     $a_{n}$",
    "   Nhân / chia   $a \\\\times b \\\\div c$  So sánh    $\\\\le$  $\\\\ge$  $\\\\neq$",
    "   Pi, độ        $\\\\pi$  $90^\\\\circ$     Tập số     $\\\\mathbb{R}$  $\\\\mathbb{Z}$",
    "   Lượng giác    $\\\\sin x$  $\\\\cos x$     Song song  $\\\\parallel$   Thuộc $\\\\in$",
    "",
    "5. CHUYỂN TỪ ĐỀ PDF",
    "   Giữ nguyên nội dung, chia đúng các phần. Lấy đáp án từ phần đáp án/lời giải của đề.",
    '   Câu có hình vẽ: để "image" trống, giáo viên thêm hình sau trong trang quản trị.',
    "",
    "6. JSON MẪU (mỗi phần 1 câu ví dụ)",
    JSON.stringify(sample, null, 2)
  ].join("\n");
}

// Global cho nut "+ Them phuong an" trong form sua cau
function qtAddRow(btn, typeId) {
  const list = btn.parentElement.querySelector(".ed-list");
  if (list.children.length >= PREFIXES.length) return alert(`Tối đa ${PREFIXES.length} phương án.`);
  list.insertAdjacentHTML("beforeend", QUESTION_TYPES[typeId].editorRow());
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    QUESTION_TYPES, DEFAULT_TEMPLATES, ROMAN, typeIdOf, getType, partLabel, maxPoints, groupByPart, questionLabel,
    templateTotal, normalizeOne, normalizeExam, gradeAll, summarizeEntries, formatResultEntry, buildRulesText, matchTypedAnswer
  };
}
