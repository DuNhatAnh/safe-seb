// Khoa Supabase va mat khau chi nam tren server (lib/api.js, bien moi truong)
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

// 8. Goi API cua server (lib/api.js). Trinh duyet KHONG giu khoa Supabase hay mat khau nao.
const ADMIN_TOKEN_KEY = "safe_exam_admin_token";

async function apiRequest(route, { method = "GET", query = null, body = null, headers: extraHeaders = {} } = {}) {
  const qs = query ? "?" + new URLSearchParams(query).toString() : "";
  /** @type {Record<string, string>} */
  const headers = { "Content-Type": "application/json", ...extraHeaders };
  const token = sessionStorage.getItem(ADMIN_TOKEN_KEY);
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api/${route}${qs}`, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await response.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = { error: text }; }
  if (!response.ok) {
    /** @type {Error & { status?: number, data?: any }} */
    const err = new Error((data && data.error) || `Lỗi máy chủ (${response.status})`);
    err.status = response.status;
    err.data = data;
    throw err;
  }
  return data;
}

// Trang admin: truy van bang cua he thong qua proxy co kiem tra token
async function supabaseRequest(endpoint, method = "GET", body = null, extraHeaders = {}) {
  try {
    return await apiRequest("admin/rest", {
      method: "POST",
      body: { method, path: endpoint, body, prefer: extraHeaders.Prefer || (method === "POST" ? "return=representation" : "") }
    });
  } catch (err) {
    if (err.status === 401 && typeof window !== "undefined" && /admin\.html/.test(location.pathname)) {
      sessionStorage.removeItem(ADMIN_TOKEN_KEY);
      alert(err.message);
      location.href = "index.html";
    }
    throw err;
  }
}

// Trang admin: GET kem tong so dong (phan trang). Tra { rows, total }
async function supabasePage(endpoint) {
  return await apiRequest("admin/rest", { method: "POST", body: { method: "GET", path: endpoint, count: true } });
}

// Ma hoa gia tri dua vao duong dan PostgREST (dau cach, dau phay, ky tu tieng Viet...)
const pgValue = v => encodeURIComponent(v);

// API cho thi sinh: de da bo dap an, nop bai de server cham, thoat can mat khau giam thi
const StudentApi = {
  // Phan trang phia server: { items, total, page, size }
  listExams: ({ q = "", page = 1, size = 3, student = "" } = {}) => apiRequest("exams", { query: { q, page, size, student } }),
  // entry: { password } (vua nhap) hoac { token } (ve vao de lan truoc) - gui qua header, khong de trong URL
  getExam: (id, student, entry = {}) => apiRequest("exam", {
    query: { id, student },
    headers: {
      ...(entry.password ? { "X-Exam-Password": entry.password } : {}),
      ...(entry.token ? { "X-Exam-Entry": entry.token } : {}),
      ...(entry.attemptTicket ? { "X-Exam-Attempt": entry.attemptTicket } : {}),
      ...(entry.submissionKey ? { "X-Exam-Submission": entry.submissionKey } : {})
    }
  }),
  // Admin: mat khau vao de ({ enabled?, regenerate? })
  entryPassword: (examId, changes = {}) => apiRequest("admin/entry-password", { method: "POST", body: { exam_id: examId, ...changes } }),
  history: (student, page = 1, size = 3, examId = "") => apiRequest("history", { query: { student, page, size, exam_id: examId } }),
  submit: payload => apiRequest("submit", { method: "POST", body: payload }),
  proctorExit: payload => apiRequest("proctor-exit", { method: "POST", body: payload }),
  // Giam thi nhap ma de cho thi sinh lam them 1 luot
  retake: payload => apiRequest("retake", { method: "POST", body: payload }),
  // Admin: xem mat khau de (chung cho moi de) cua de
  proctorCode: (examId, regenerate = false) => apiRequest("admin/proctor-code", { method: "POST", body: { exam_id: examId, regenerate } }),
  // Admin: cai dat Safe Exam Browser cua de ({ require_seb?, regenerate_password? })
  sebSettings: (examId, changes = {}) => apiRequest("admin/seb", { method: "POST", body: { exam_id: examId, ...changes } }),
  adminLogin: password => apiRequest("admin/login", { method: "POST", body: { password } })
};

// 9. Thao tac voi bang exams (Quan ly de thi)
const ExamService = {
  async getAllExams() {
    return await supabaseRequest("exams?select=id,title,duration_minutes,assigned_to,require_seb,require_password,created_at&order=id.desc");
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

  // Sua de thi da tao. RLS chan update -> Supabase tra mang rong.
  async updateExam(examId, patch) {
    const rows = await supabaseRequest(`exams?id=eq.${examId}`, "PATCH", patch, { "Prefer": "return=representation" });
    if (!rows || rows.length === 0) {
      throw new Error("Supabase chưa cho phép cập nhật bảng exams. Hãy chạy npm run db:migrate.");
    }
    return rows[0];
  },

  // Xoa cung de thi
  async deleteExam(examId) {
    return await supabaseRequest(`exams?id=eq.${examId}`, "DELETE");
  }
};

// 10. Thao tac voi bang exam_results
const ResultService = {
  async getAllResults() {
    return await supabaseRequest("exam_results?select=*&order=id.desc");
  },

  // Cap nhat ket qua (giao vien cham tay). RLS chan update -> Supabase tra mang rong.
  async updateResult(id, patch) {
    const rows = await supabaseRequest(`exam_results?id=eq.${id}`, "PATCH", patch, { "Prefer": "return=representation" });
    if (!rows || rows.length === 0) {
      throw new Error("Không cập nhật được exam_results. Hãy chạy npm run db:migrate.");
    }
    return rows[0];
  }
};

// 10a. Su co phong thi (bang exam_events). Server ghi khi giam thi nhap mat khau; admin chi doc.
const EventService = {
  async getAll() {
    return await supabaseRequest("exam_events?select=*&order=id.desc");
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
// savedLogs: nhat ky cu (khoi phuc ban nhap). onLog: goi sau moi lan ghi (de luu nhap).
class ActionTracker {
  constructor(savedLogs = null, onLog = null) {
    this.logs = Array.isArray(savedLogs) ? savedLogs : [];
    this.onLog = onLog;
    this.active = true;
    this.startTime = new Date().toISOString();
    if (!this.logs.length) this.addLog("BAT_DAU", "Thí sinh bắt đầu làm bài");

    // Su kien roi man hinh / mat tieu diem do Lockdown (lockdown.js) theo doi va ghi vao day
  }

  addLog(type, detail, questionIndex = null, selectedOption = null) {
    if (!this.active) return;
    this.logs.push({
      time: new Date().toLocaleTimeString("vi-VN"),
      timestamp: new Date().toISOString(),
      type,
      detail,
      question_index: questionIndex,
      selected_option: selectedOption
    });
    if (this.onLog) this.onLog();
  }

  getLogs() {
    return this.logs;
  }

  // Ngung ghi (sau khi nop bai / thoat)
  stop() {
    this.active = false;
  }
}

// Cac loai log bi coi la vi pham (to do ben admin, dem so lan)
const VIOLATION_TYPES = ["ROI_MAN_HINH", "MAT_TIEU_DIEM", "THOAT_TOAN_MAN_HINH", "PHIM_BI_CHAN", "CHUOT_PHAI", "SAO_CHEP", "CHUOT_RA_NGOAI", "TAI_LAI_TRANG", "SAI_MAT_KHAU", "NUT_BACK",
  "CUA_SO_NOI", "CHIA_MAN_HINH", "CHUP_MAN_HINH", "IN_TRANG", "KEO_THA", "GO_GHIM"];

// 12. Quan ly bo nho tam LocalStorage
const StorageHelper = {
  // lock: { leaves, locked } so lan roi bai + bai dang bi khoa (tai lai trang khong go duoc khoa)
  // Ban nhap gan voi DE + THI SINH: cung 1 trinh duyet, thi sinh khac khong thay / khong mo duoc bai cua nhau
  key: (examId, student) => `safe_exam_draft_${examId}_${student}`,

  saveDraft(examId, student, answers, deadline, logs = null, lock = null) {
    try {
      localStorage.setItem(this.key(examId, student), JSON.stringify({ answers, deadline, logs, lock, savedAt: Date.now() }));
    } catch (e) {
      console.warn("Khong the luu nhap:", e);
    }
  },

  getDraft(examId, student) {
    try {
      const data = localStorage.getItem(this.key(examId, student));
      return data ? JSON.parse(data) : null;
    } catch (e) {
      return null;
    }
  },

  clearDraft(examId, student) {
    try {
      localStorage.removeItem(this.key(examId, student));
    } catch (e) { }
  }
};

// 13. Safe Exam Browser (SEB): SEB luon them "SEB/<phien ban>" vao User-Agent
const Seb = {
  isActive: () => /\bSEB\/\d/.test(navigator.userAgent),
  // Link mo SEB voi cau hinh cua de: https -> sebs://, http (chay local) -> seb://
  link: examId => `${location.origin}/api/seb-config?exam_id=${examId}`.replace(/^http(s?):\/\//, (m, s) => `seb${s}://`),
  DOWNLOAD_URL: "https://safeexambrowser.org/download_en.html"
};

// 14. Ve vao de co mat khau (server cap khi nhap dung): luu de tai lai trang / vao lai khong phai nhap nua
const EntryToken = {
  key: (examId, student) => `safe_exam_entry_${examId}_${student}`,
  get(examId, student) {
    try { return localStorage.getItem(this.key(examId, student)); } catch (e) { return null; }
  },
  set(examId, student, token) {
    try { localStorage.setItem(this.key(examId, student), token); } catch (e) { }
  },
  clear(examId, student) {
    try { localStorage.removeItem(this.key(examId, student)); } catch (e) { }
  }
};

// Khoa chong nop trung cua 1 luot lam bai: tao khi bat dau luot moi, giu khi vao lai bai lam do,
// xoa khi nop thanh cong. Nop lai cung khoa -> server tra lai ket qua da luu (khong tao ban ghi moi).
const SubmissionKey = {
  key: (examId, student) => `safe_exam_submit_${examId}_${student}`,
  get(examId, student) {
    try { return localStorage.getItem(this.key(examId, student)); } catch (e) { return null; }
  },
  // fresh: luot lam moi -> tao khoa moi; vao lai bai lam do -> dung lai khoa cu (chua co thi tao)
  ensure(examId, student, fresh) {
    let k = null;
    try { k = fresh ? null : localStorage.getItem(this.key(examId, student)); } catch (e) { }
    if (!k) {
      k = (window.crypto && typeof crypto.randomUUID === "function")
        ? crypto.randomUUID()
        : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
      try { localStorage.setItem(this.key(examId, student), k); } catch (e) { }
    }
    return k;
  },
  clear(examId, student) {
    try { localStorage.removeItem(this.key(examId, student)); } catch (e) { }
  }
};

// Ve luot dang lam (server cap khi vao de): luot da vao thi tai lai / nop duoc du admin doi cai dat giua chung
const AttemptTicket = {
  key: (examId, student) => `safe_exam_attempt_${examId}_${student}`,
  get(examId, student) {
    try { return localStorage.getItem(this.key(examId, student)); } catch (e) { return null; }
  },
  set(examId, student, ticket) {
    try { localStorage.setItem(this.key(examId, student), ticket); } catch (e) { }
  },
  clear(examId, student) {
    try { localStorage.removeItem(this.key(examId, student)); } catch (e) { }
  }
};

// 15. Thanh phan trang: "‹ Trước | Trang 2/5 · 14 mục | Sau ›" (onGo: ten ham toan cuc nhan so trang)
function pagerHtml({ page, size, total }, onGo) {
  const pages = Math.max(1, Math.ceil(total / size));
  if (pages <= 1) return total ? `<div class="pager"><span class="field-hint">${total} mục</span></div>` : "";
  return `<div class="pager">
    <button type="button" class="btn btn-outline btn-sm" ${page <= 1 ? "disabled" : ""} onclick="${onGo}(${page - 1})">‹ Trước</button>
    <span class="field-hint">Trang ${page}/${pages} · ${total} mục</span>
    <button type="button" class="btn btn-outline btn-sm" ${page >= pages ? "disabled" : ""} onclick="${onGo}(${page + 1})">Sau ›</button>
  </div>`;
}
