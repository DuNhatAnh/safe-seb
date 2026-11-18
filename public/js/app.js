// Cau hinh Supabase REST truc tiep
const SUPABASE_URL = "https://twavyhrlphhqsqiqvrzq.supabase.co";
const SUPABASE_KEY = "sb_publishable_Rsbi9aTsXeusrjzg0q2Eig_FYGZW_hH";
const PROCTOR_PASSWORD_DEFAULT = "123456";
const PREFIXES = "ABCDEF";

// 1. Ham an toan hoa chuoi HTML
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, c => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[c]));
}

// 2. Ham parse so (ho tro so nguyen, so thap phan, phan so a/b, hon so a b/c)
function parseNumber(s) {
  if (typeof s !== "string" && typeof s !== "number") return null;
  let str = String(s).trim();
  if (!str) return null;

  // Doi dau phay thap phan thanh dau cham
  str = str.replace(/,/g, ".");

  // Hon so: vi du "2 1/3", "-1 1/2"
  const mixedMatch = str.match(/^(-?\d+)\s+(\d+)\/(\d+)$/);
  if (mixedMatch) {
    const whole = parseInt(mixedMatch[1], 10);
    const num = parseInt(mixedMatch[2], 10);
    const den = parseInt(mixedMatch[3], 10);
    if (den === 0) return null;
    const sign = whole < 0 || Object.is(whole, -0) ? -1 : 1;
    return whole + (sign * (num / den));
  }

  // Phan so: vi du "3/4", "-1/2"
  const fracMatch = str.match(/^(-?\d+)\/(\d+)$/);
  if (fracMatch) {
    const num = parseInt(fracMatch[1], 10);
    const den = parseInt(fracMatch[2], 10);
    if (den === 0) return null;
    return num / den;
  }

  // So nguyen hoac thap phan: vi du "0.75", "-5", "12"
  if (/^-?\d+(\.\d+)?$/.test(str)) {
    const val = parseFloat(str);
    return isFinite(val) ? val : null;
  }

  return null;
}

// 3. Kiem tra dap an cau tu luan ngan
function isShortCorrect(userVal, answersList, answerKind) {
  if (!Array.isArray(answersList) || answersList.length === 0) return false;

  if (answerKind === "number") {
    const userNum = parseNumber(userVal);
    if (userNum === null) return false;
    return answersList.some(ans => {
      const ansNum = parseNumber(ans);
      return ansNum !== null && Math.abs(userNum - ansNum) < 1e-9;
    });
  }

  // answerKind === "text"
  const cleanUser = String(userVal ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFC")
    .replace(/\s+/g, " ");

  return answersList.some(ans => {
    const cleanAns = String(ans ?? "")
      .trim()
      .toLowerCase()
      .normalize("NFC")
      .replace(/\s+/g, " ");
    return cleanAns === cleanUser;
  });
}

// 4. Render cong thuc toan hoc KaTeX
function renderMath(str) {
  if (typeof str !== "string") return escapeHtml(str);
  if (!window.katex || typeof window.katex.renderToString !== "function") {
    return escapeHtml(str);
  }

  const ESCAPED_DOLLAR = "___ESCAPED_DOLLAR___";
  let processed = str.replace(/\\\$/g, ESCAPED_DOLLAR);

  const parts = [];
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$]+?)\$/g;
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      const textPiece = processed.slice(lastIndex, match.index).replace(new RegExp(ESCAPED_DOLLAR, "g"), "$");
      parts.push(escapeHtml(textPiece));
    }

    const isDisplay = match[1] !== undefined;
    const texCode = (isDisplay ? match[1] : match[2]).replace(new RegExp(ESCAPED_DOLLAR, "g"), "$");

    try {
      parts.push(window.katex.renderToString(texCode, {
        throwOnError: false,
        displayMode: isDisplay
      }));
    } catch (e) {
      parts.push(`<span class="katex-error" style="color:#ef4444">${escapeHtml(match[0])}</span>`);
    }

    lastIndex = mathRegex.lastIndex;
  }

  if (lastIndex < processed.length) {
    const textPiece = processed.slice(lastIndex).replace(new RegExp(ESCAPED_DOLLAR, "g"), "$");
    parts.push(escapeHtml(textPiece));
  }

  return parts.join("");
}

// 5. Tu sua dau gach cheo nguoc truoc khi JSON.parse
function fixJsonBackslashes(jsonStr) {
  if (typeof jsonStr !== "string") return "";
  // Tu nhan doi \ khi no dung truoc tu 2 chu cai tro len (vi du \frac -> \\frac, \sqrt -> \\sqrt)
  return jsonStr.replace(/(?<!\\)\\(?=[a-zA-Z]{2,})/g, "\\\\");
}

// 6. Chuan hoa danh sach cau hoi ve {title, duration_minutes, questions, errors}
function normalizeQuestions(data, strict = true) {
  const errors = [];
  let title = "";
  let durationMinutes = null;
  let rawList = [];

  // Ho tro ca object co title/duration va mang cau hoi
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (typeof data.title === "string") title = data.title.trim();
    if (data.duration_minutes !== undefined) durationMinutes = parseInt(data.duration_minutes, 10);
    rawList = Array.isArray(data.questions) ? data.questions : [];
  } else if (Array.isArray(data)) {
    rawList = data;
  } else {
    return { title: "", duration_minutes: null, questions: [], errors: ["Du lieu JSON phai la mot mang hoac object co truong questions."] };
  }

  if (rawList.length === 0) {
    return { title, duration_minutes: durationMinutes, questions: [], errors: ["De thi phai co it nhat 1 cau hoi."] };
  }

  const questions = rawList.map((q, i) => {
    const n = i + 1;
    const qText = typeof q?.question === "string" ? q.question.trim() : "";
    if (!qText) errors.push(`Cau ${n}: thieu noi dung cau hoi (truong "question").`);

    // Kiem tra ky tu dieu khien do thieu \\
    if (/[\x08\x0c]/.test(qText)) {
      errors.push(`Cau ${n}: phat hien ky tu dieu khien (hay viet \\\\ thay vi \\ truoc cong thuc toan).`);
    }

    const type = (q?.type === "short") ? "short" : "single";

    if (type === "short") {
      const answerKind = (q?.answer_kind === "text") ? "text" : "number";
      const rawAns = Array.isArray(q?.answers) ? q.answers : (q?.answer !== undefined ? [q.answer] : []);
      const answers = rawAns.map(a => String(a ?? "").trim()).filter(Boolean);

      if (answers.length === 0) {
        errors.push(`Cau ${n} (Tu luan): phai co it nhat 1 dap an chap nhan.`);
      }

      if (answerKind === "number") {
        answers.forEach(ans => {
          if (parseNumber(ans) === null) {
            errors.push(`Cau ${n} (Tu luan so): dap an '${ans}' khong phai so hop le (vi du dung: 3/4, 0.75, 2 1/3).`);
          }
        });
      }

      return {
        type: "short",
        question: qText,
        answer_kind: answerKind,
        answers
      };
    }

    // type === "single" (Trac nghiem)
    const rawOpts = Array.isArray(q?.options) ? q.options : [];
    const options = rawOpts.map(o => typeof o === "string"
      ? { text: o.trim(), is_correct: false }
      : { text: String(o?.text ?? "").trim(), is_correct: o?.is_correct === true || o?.correct === true });

    if (options.length < 2 || options.length > PREFIXES.length) {
      errors.push(`Cau ${n} (Trac nghiem): can tu 2 den ${PREFIXES.length} phuong an.`);
    }

    if (options.some(o => !o.text)) {
      errors.push(`Cau ${n}: co phuong an bi bo trong.`);
    }

    const correctCount = options.filter(o => o.is_correct).length;
    if (correctCount > 1 || (strict && correctCount !== 1)) {
      errors.push(`Cau ${n}: can dung 1 dap an dung (hien co ${correctCount}).`);
    }

    return {
      type: "single",
      question: qText,
      options
    };
  });

  return {
    title,
    duration_minutes: durationMinutes,
    questions,
    errors
  };
}

// 7. Kiem tra cau hoi co hop le khong
function hasCorrectAnswer(q) {
  if (!q) return false;
  if (q.type === "short") {
    return Array.isArray(q.answers) && q.answers.length > 0;
  }
  return Array.isArray(q.options) && q.options.filter(o => o.is_correct).length === 1;
}

// 8. Ham goi API Supabase REST
async function supabaseRequest(endpoint, method = "GET", body = null) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "POST" ? "return=representation" : ""
  };

  const config = { method, headers };
  if (body) {
    config.body = JSON.stringify(body);
  }

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${endpoint}`, config);
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Loi ket noi Supabase (${response.status}): ${errorText}`);
  }

  // DELETE hoac tra ve rong
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

// 9. Thao tac voi bang exams (Quan ly de thi)
const ExamService = {
  async getAvailableExams() {
    return await supabaseRequest("exams?select=id,title,duration_minutes,assigned_to,created_at&order=id.desc");
  },

  async getAssignedExams(username) {
    return await this.getAvailableExams();
  },

  async getAllExams() {
    return await supabaseRequest("exams?select=id,title,duration_minutes,assigned_to,created_at&order=id.desc");
  },

  async getExamDetail(examId) {
    const data = await supabaseRequest(`exams?id=eq.${examId}&select=*`);
    return data && data.length > 0 ? data[0] : null;
  },

  async createExam(title, durationMinutes, questions, assignedTo = "all") {
    const payload = {
      title,
      duration_minutes: parseInt(durationMinutes, 10),
      assigned_to: assignedTo || "all",
      questions
    };
    return await supabaseRequest("exams", "POST", payload);
  },

  // Xoa cung de thi
  async deleteExam(examId) {
    return await supabaseRequest(`exams?id=eq.${examId}`, "DELETE");
  }
};

// 10. Thao tac voi bang exam_results
const ResultService = {
  async submitResult(examId, studentName, score, totalQuestions, durationMinutes, answers, actionLogs) {
    const payload = {
      exam_id: examId,
      student_name: studentName,
      score: parseFloat(score),
      total_questions: parseInt(totalQuestions, 10),
      duration_minutes: parseInt(durationMinutes, 10),
      answers,
      action_logs: actionLogs,
      submitted_at: new Date().toISOString()
    };
    return await supabaseRequest("exam_results", "POST", payload);
  },

  async getAllResults() {
    return await supabaseRequest("exam_results?select=*&order=id.desc");
  }
};

// 11. Bo theo doi thao tac lam bai (Action Tracker)
class ActionTracker {
  constructor() {
    this.logs = [];
    this.startTime = new Date().toISOString();
    this.addLog("BAT_DAU", "Thi sinh bat dau lam bai");

    document.addEventListener("visibilitychange", () => {
      if (document.hidden) {
        this.addLog("ROI_MAN_HINH", "Thi sinh vua roi khoi tab hoac chuyen man hinh");
      } else {
        this.addLog("QUAY_LAI", "Thi sinh quay lai man hinh bai thi");
      }
    });

    window.addEventListener("blur", () => {
      this.addLog("MAT_TIEU_DIEM", "Cua so bi mat tieu diem (mo popup hoac chia man hinh)");
    });
  }

  addLog(type, detail, questionIndex = null, selectedOption = null) {
    this.logs.push({
      time: new Date().toLocaleTimeString("vi-VN"),
      timestamp: new Date().toISOString(),
      type,
      detail,
      question_index: questionIndex,
      selected_option: selectedOption
    });
  }

  getLogs() {
    return this.logs;
  }
}

// 12. Quan ly bo nho tam LocalStorage
const StorageHelper = {
  saveDraft(examId, answers, deadline) {
    try {
      localStorage.setItem(`safe_exam_draft_${examId}`, JSON.stringify({ answers, deadline, savedAt: Date.now() }));
    } catch (e) {
      console.warn("Khong the luu nhap:", e);
    }
  },

  getDraft(examId) {
    try {
      const data = localStorage.getItem(`safe_exam_draft_${examId}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearDraft(examId) {
    try {
      localStorage.removeItem(`safe_exam_draft_${examId}`);
    } catch (e) { }
  }
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    PREFIXES,
    escapeHtml,
    parseNumber,
    isShortCorrect,
    renderMath,
    fixJsonBackslashes,
    normalizeQuestions,
    hasCorrectAnswer
  };
}
