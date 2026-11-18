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

// 3. Chuan hoa chuoi de so sanh dap an chu (bo hoa/thuong, khoang trang thua)
function normalizeText(v) {
  return String(v ?? "").trim().toLowerCase().normalize("NFC").replace(/\s+/g, " ");
}

// 4. Render cong thuc toan hoc KaTeX
function renderMath(str) {
  if (typeof str !== "string") return escapeHtml(str);
  // Dong bat dau bang "- " -> gach dau dong
  str = str.replace(/^[ \t]*[-•][ \t]+/gm, "• ");
  if (typeof window === "undefined" || !window.katex || typeof window.katex.renderToString !== "function") {
    return textHtml(str);
  }

  const ESCAPED_DOLLAR = "___ESCAPED_DOLLAR___";
  // $$...$$ da la khoi rieng -> bo xuong dong sat hai ben de khong thua dong trong
  let processed = str.replace(/\\\$/g, ESCAPED_DOLLAR).replace(/\r?\n?(\$\$[\s\S]*?\$\$)\r?\n?/g, "$1");

  const parts = [];
  const mathRegex = /\$\$([\s\S]*?)\$\$|\$([^\$]+?)\$/g;
  let lastIndex = 0;
  let match;

  while ((match = mathRegex.exec(processed)) !== null) {
    if (match.index > lastIndex) {
      const textPiece = processed.slice(lastIndex, match.index).replace(new RegExp(ESCAPED_DOLLAR, "g"), "$");
      parts.push(textHtml(textPiece));
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
    parts.push(textHtml(textPiece));
  }

  return parts.join("");
}

// Chu thuong: escape + xuong dong
function textHtml(t) {
  return escapeHtml(t).replace(/\r?\n/g, "<br>");
}

// 4b. Nen anh (file / clipboard) thanh data URL de nhung thang vao de thi
function compressImage(file, maxWidth = 900, quality = 0.85) {
  return new Promise((resolve, reject) => {
    if (!file || !file.type.startsWith("image/")) return reject(new Error("File không phải ảnh."));
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#fff"; // nen trang cho anh PNG trong suot
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("Không đọc được ảnh."));
    img.src = URL.createObjectURL(file);
  });
}

// 5. Tu sua dau gach cheo nguoc truoc khi JSON.parse
// Lenh LaTeX bat dau bang chu trung voi escape JSON (\b \f \n \r \t \u) -> phai nhan doi.
// Ngoai danh sach nay, "\n", "\t"... giu nguyen nghia JSON (xuong dong, tab).
const TEX_JSON_LIKE = /^(?:beta|bar|binom|bigl|bigr|big|boxed|bot|bullet|bmod|frac|forall|flat|nabla|neq|ne|ni|nu|notin|not|neg|nmid|nexists|rightarrow|right|rho|rangle|rceil|rfloor|rm|times|theta|tanh|tan|textbf|text|tfrac|top|to|tau|triangle|tilde|therefore|underline|uparrow|cup)(?![a-zA-Z])/;

function fixJsonBackslashes(jsonStr) {
  if (typeof jsonStr !== "string") return "";
  let out = "";
  for (let i = 0; i < jsonStr.length; i++) {
    const c = jsonStr[i];
    if (c !== "\\") { out += c; continue; }
    if (jsonStr[i + 1] === "\\") { out += "\\\\"; i++; continue; } // da viet dung \\
    const rest = jsonStr.slice(i + 1);
    const isJsonEscape = /^["\/bfnrtu]/.test(rest) && !TEX_JSON_LIKE.test(rest);
    out += isJsonEscape ? "\\" : "\\\\"; // \sqrt, \pi, \{, \, ... -> \\
  }
  return out;
}

// 6. Sao chep van ban (co fallback cho context http khong an toan)
function copyText(text, btn) {
  const done = () => {
    if (!btn) return;
    const old = btn.textContent;
    btn.textContent = "Đã chép";
    setTimeout(() => { btn.textContent = old; }, 1500);
  };
  const fallback = () => {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.cssText = "position:fixed;left:-9999px";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); done(); } catch (e) { alert("Không thể sao chép tự động, hãy chép thủ công."); }
    ta.remove();
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done).catch(fallback);
  } else {
    fallback();
  }
}

// 7. Mo / dong modal (.overlay)
function openModal(id) { document.getElementById(id).style.display = "flex"; }
function closeModal(id) { document.getElementById(id).style.display = "none"; }

// 8. Ham goi API Supabase REST
async function supabaseRequest(endpoint, method = "GET", body = null, extraHeaders = {}) {
  const headers = {
    "apikey": SUPABASE_KEY,
    "Authorization": `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    "Prefer": method === "POST" ? "return=representation" : "",
    ...extraHeaders
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
  },

  // Cap nhat ket qua (giao vien cham tay). RLS chan update -> Supabase tra mang rong.
  async updateResult(id, patch) {
    const rows = await supabaseRequest(`exam_results?id=eq.${id}`, "PATCH", patch, { "Prefer": "return=representation" });
    if (!rows || rows.length === 0) {
      throw new Error("Supabase chưa cho phép cập nhật exam_results. Hãy chạy database/schema.sql (policy update).");
    }
    return rows[0];
  }
};

// 10b. Cau hinh he thong (bang app_settings: key -> value jsonb)
// Chua chay migration (khong co bang app_settings) -> tu dong luu tam o localStorage.
const SettingsService = {
  isLocal: false, // true: dang dung localStorage vi Supabase chua co bang

  localKey: key => `safe_exam_setting_${key}`,

  readLocal(key) {
    try { return JSON.parse(localStorage.getItem(this.localKey(key))); } catch (e) { return null; }
  },

  async get(key) {
    try {
      const rows = await supabaseRequest(`app_settings?key=eq.${encodeURIComponent(key)}&select=value`);
      this.isLocal = false;
      return rows && rows.length > 0 ? rows[0].value : this.readLocal(key);
    } catch (err) {
      console.warn("app_settings chua san sang, dung localStorage:", err.message);
      this.isLocal = true;
      return this.readLocal(key);
    }
  },

  async set(key, value) {
    try { localStorage.setItem(this.localKey(key), JSON.stringify(value)); } catch (e) { }
    try {
      await supabaseRequest("app_settings?on_conflict=key", "POST", { key, value }, {
        "Prefer": "resolution=merge-duplicates,return=representation"
      });
      this.isLocal = false;
    } catch (err) {
      console.warn("Khong luu duoc len Supabase, da luu tam o trinh duyet:", err.message);
      this.isLocal = true;
    }
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
  module.exports = { PREFIXES, escapeHtml, textHtml, parseNumber, normalizeText, renderMath, fixJsonBackslashes };
}
