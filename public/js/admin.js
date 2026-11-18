let parsedQuestions = [];
let allResultsData = [];
let editingQuestionIndex = null; // null: them moi, number: dang sua cau tai index

window.addEventListener("DOMContentLoaded", () => {
  // Kiem tra xac thuc quan tri vien
  if (sessionStorage.getItem("safe_exam_admin_auth") !== "true") {
    alert("Vui long dang nhap tai khoan quan tri!");
    window.location.href = "index.html";
    return;
  }

  loadExistingExams();
  loadResults();
});

function logoutAdmin() {
  sessionStorage.removeItem("safe_exam_admin_auth");
  window.location.href = "index.html";
}

// Chuyen doi Tab
function switchTab(tabId) {
  document.querySelectorAll(".tab-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("tabUpload").style.display = "none";
  document.getElementById("tabResults").style.display = "none";

  if (tabId === "tabUpload") {
    document.querySelectorAll(".tab-btn")[0].classList.add("active");
    document.getElementById("tabUpload").style.display = "block";
    loadExistingExams();
  } else {
    document.querySelectorAll(".tab-btn")[1].classList.add("active");
    document.getElementById("tabResults").style.display = "block";
    loadResults();
  }
}

// 1. Modal Quy tac dinh dang
function openRulesModal() {
  const modal = document.getElementById("rulesModal");
  modal.style.display = "flex";

  // Render cong thuc toan trong bang tra cuu KaTeX
  if (window.katex) {
    modal.querySelectorAll(".katex-cell").forEach(cell => {
      const tex = cell.getAttribute("data-tex");
      if (tex && !cell.hasChildNodes()) {
        try {
          cell.innerHTML = window.katex.renderToString(tex, { throwOnError: false });
        } catch (e) {
          cell.textContent = tex;
        }
      }
    });
  }
}

function closeRulesModal() {
  document.getElementById("rulesModal").style.display = "none";
}

function copySampleText(elementId, btnId) {
  const el = document.getElementById(elementId);
  const btn = document.getElementById(btnId);
  if (!el || !btn) return;

  const text = el.innerText || el.textContent;

  const onSuccess = () => {
    const originalText = btn.textContent;
    btn.textContent = "Da chep";
    setTimeout(() => {
      btn.textContent = originalText;
    }, 1500);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onSuccess).catch(() => fallbackCopy(text, onSuccess));
  } else {
    fallbackCopy(text, onSuccess);
  }
}

function fallbackCopy(text, callback) {
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand("copy");
    if (callback) callback();
  } catch (e) {
    alert("Khong the sao chep tu dong. Vui long sao chep thu cong.");
  }
  document.body.removeChild(ta);
}

// 2. Modal Nhap JSON truc tiep
function openJsonModal() {
  document.getElementById("jsonInputArea").value = "";
  document.getElementById("jsonModalError").style.display = "none";

  // Hien thi lua chon thay the / noi tiep neu da co cau hoi
  const modeRow = document.getElementById("jsonImportModeRow");
  if (parsedQuestions.length > 0) {
    modeRow.style.display = "block";
  } else {
    modeRow.style.display = "none";
  }

  document.getElementById("jsonModal").style.display = "flex";
  document.getElementById("jsonInputArea").focus();
}

function closeJsonModal() {
  document.getElementById("jsonModal").style.display = "none";
}

function submitJsonModal() {
  const raw = document.getElementById("jsonInputArea").value.trim();
  const errorBox = document.getElementById("jsonModalError");
  errorBox.style.display = "none";

  if (!raw) {
    errorBox.textContent = "Vui long dan noi dung JSON!";
    errorBox.style.display = "block";
    return;
  }

  // Tu dong sua dau gach cheo nguoc \ truoc khi parse
  const fixedRaw = fixJsonBackslashes(raw);

  let data;
  try {
    data = JSON.parse(fixedRaw);
  } catch (e) {
    errorBox.textContent = "Dinh dang JSON khong hop le: " + e.message + " (Hay kiem tra cac dau ngoac hoac dau phay).";
    errorBox.style.display = "block";
    return;
  }

  // Chuan hoa bang normalizeQuestions
  const normalized = normalizeQuestions(data, true);
  if (normalized.errors.length > 0) {
    errorBox.innerHTML = "<strong>Loi dinh dang cau hoi:</strong><br>" + normalized.errors.map(err => `- ${escapeHtml(err)}`).join("<br>");
    errorBox.style.display = "block";
    return;
  }

  // Tu dong dien tieu de de thi neu co trong JSON
  if (normalized.title) {
    document.getElementById("examTitle").value = normalized.title;
  }

  // Tu dong dien thoi gian lam bai neu co trong JSON
  if (normalized.duration_minutes && normalized.duration_minutes >= 1) {
    document.getElementById("examDuration").value = normalized.duration_minutes;
  }

  // Kiem tra che do Thay the hoac Noi tiep
  const modeInput = document.querySelector('input[name="jsonImportMode"]:checked');
  const importMode = modeInput ? modeInput.value : "replace";

  if (importMode === "append" && parsedQuestions.length > 0) {
    parsedQuestions = parsedQuestions.concat(normalized.questions);
    showUploadStatus(`Da noi them ${normalized.questions.length} cau hoi thanh cong (Tong cong: ${parsedQuestions.length} cau)!`, false);
  } else {
    parsedQuestions = normalized.questions;
    showUploadStatus(`Da nap thanh cong ${parsedQuestions.length} cau hoi tu JSON!`, false);
  }

  closeJsonModal();
  renderPreview();
}

// 3. Modal Them / Sua cau hoi thu cong
function openAddQuestionModal() {
  editingQuestionIndex = null;
  document.getElementById("questionModalTitle").textContent = "Them cau hoi thu cong";
  document.getElementById("modalQText").value = "";
  document.getElementById("modalQError").style.display = "none";
  document.querySelector('input[name="modalQType"][value="single"]').checked = true;
  toggleQuestionType();

  // Reset phuong an trac nghiem ve 4 phuong an mac dinh
  const container = document.getElementById("modalOptionsList");
  container.innerHTML = "";
  for (let i = 0; i < 4; i++) {
    addModalOptionRow("", i === 0);
  }

  // Reset tu luan
  document.getElementById("modalShortAnswers").value = "";
  document.querySelector('input[name="modalShortKind"][value="number"]').checked = true;

  updateModalMathPreview();
  document.getElementById("questionModal").style.display = "flex";
  document.getElementById("modalQText").focus();
}

function openEditQuestionModal(index) {
  const q = parsedQuestions[index];
  if (!q) return;

  editingQuestionIndex = index;
  document.getElementById("questionModalTitle").textContent = `Chinh sua Cau ${index + 1}`;
  document.getElementById("modalQText").value = q.question;
  document.getElementById("modalQError").style.display = "none";

  const type = q.type || "single";
  const typeRadio = document.querySelector(`input[name="modalQType"][value="${type}"]`);
  if (typeRadio) typeRadio.checked = true;
  toggleQuestionType();

  if (type === "single") {
    const container = document.getElementById("modalOptionsList");
    container.innerHTML = "";
    (q.options || []).forEach(opt => {
      addModalOptionRow(opt.text, opt.is_correct === true);
    });
  } else {
    const kind = q.answer_kind || "number";
    const kindRadio = document.querySelector(`input[name="modalShortKind"][value="${kind}"]`);
    if (kindRadio) kindRadio.checked = true;
    document.getElementById("modalShortAnswers").value = (q.answers || []).join("\n");
  }

  updateModalMathPreview();
  document.getElementById("questionModal").style.display = "flex";
  document.getElementById("modalQText").focus();
}

function closeQuestionModal() {
  document.getElementById("questionModal").style.display = "none";
}

function toggleQuestionType() {
  const type = document.querySelector('input[name="modalQType"]:checked').value;
  const singleArea = document.getElementById("singleOptionsArea");
  const shortArea = document.getElementById("shortOptionsArea");

  if (type === "single") {
    singleArea.style.display = "block";
    shortArea.style.display = "none";
  } else {
    singleArea.style.display = "none";
    shortArea.style.display = "block";
  }
}

function updateModalMathPreview() {
  const text = document.getElementById("modalQText").value.trim();
  const preview = document.getElementById("modalQMathPreview");
  if (!text) {
    preview.textContent = "Xem truoc cong thuc se hien o day...";
    return;
  }
  preview.innerHTML = renderMath(text);
}

function addModalOptionRow(text = "", isCorrect = false) {
  const container = document.getElementById("modalOptionsList");
  const currentRows = container.querySelectorAll(".modal-opt-row");
  if (currentRows.length >= PREFIXES.length) {
    alert(`Toi da ${PREFIXES.length} phuong an!`);
    return;
  }

  const row = document.createElement("div");
  row.className = "modal-opt-row";
  row.style.cssText = "display: flex; align-items: center; gap: 8px; margin-bottom: 8px;";

  row.innerHTML = `
    <input type="radio" name="modalCorrectRadio" ${isCorrect ? "checked" : ""} style="cursor: pointer;">
    <input type="text" class="form-control modal-opt-input" value="${escapeHtml(text)}" placeholder="Noi dung phuong an (co the dung $...$)" style="flex: 1;">
    <button type="button" class="btn btn-outline" style="padding: 6px 10px; color: var(--danger); border-color: #fecaca;" onclick="this.parentElement.remove()">Xoa</button>
  `;

  container.appendChild(row);
}

function saveQuestionModal() {
  const qText = document.getElementById("modalQText").value.trim();
  const errorBox = document.getElementById("modalQError");
  errorBox.style.display = "none";

  if (!qText) {
    errorBox.textContent = "Vui long nhap noi dung cau hoi!";
    errorBox.style.display = "block";
    return;
  }

  const type = document.querySelector('input[name="modalQType"]:checked').value;
  let questionObj = {
    type,
    question: qText
  };

  if (type === "single") {
    const rows = document.querySelectorAll("#modalOptionsList .modal-opt-row");
    const options = [];
    rows.forEach(row => {
      const val = row.querySelector(".modal-opt-input").value.trim();
      const isCorrect = row.querySelector('input[type="radio"]').checked;
      options.push({ text: val, is_correct: isCorrect });
    });

    questionObj.options = options;
  } else {
    const kind = document.querySelector('input[name="modalShortKind"]:checked').value;
    const rawAnswers = document.getElementById("modalShortAnswers").value.split(/\r?\n/).map(a => a.trim()).filter(Boolean);
    questionObj.answer_kind = kind;
    questionObj.answers = rawAnswers;
  }

  // Kiem tra bang normalizeQuestions
  const validation = normalizeQuestions([questionObj], true);
  if (validation.errors.length > 0) {
    errorBox.innerHTML = validation.errors.map(err => `- ${escapeHtml(err)}`).join("<br>");
    errorBox.style.display = "block";
    return;
  }

  const validQ = validation.questions[0];

  if (editingQuestionIndex !== null && editingQuestionIndex >= 0) {
    parsedQuestions[editingQuestionIndex] = validQ;
  } else {
    parsedQuestions.push(validQ);
  }

  closeQuestionModal();
  renderPreview();
}

function deleteQuestion(index) {
  if (confirm(`Ban co chac chan muon xoa Cau ${index + 1} khong?`)) {
    parsedQuestions.splice(index, 1);
    renderPreview();
  }
}

// 4. Huy toan bo de dang nhap
function cancelImport() {
  if (confirm(`Ban co chac chan muon huy toan bo ${parsedQuestions.length} cau hoi dang nhap khong?`)) {
    resetImport();
  }
}

function resetImport() {
  parsedQuestions = [];
  document.getElementById("previewSection").style.display = "none";
  document.getElementById("btnCancelImport").style.display = "none";
  document.getElementById("uploadStatus").style.display = "none";
  document.getElementById("examTitle").value = "";
  document.getElementById("examDuration").value = "45";
}

// 5. Hien thi ban xem truoc (Preview)
function renderPreview() {
  const container = document.getElementById("previewList");
  const countEl = document.getElementById("previewCount");
  const saveBtn = document.getElementById("btnSaveExam");
  const cancelBtn = document.getElementById("btnCancelImport");
  const previewSection = document.getElementById("previewSection");

  if (parsedQuestions.length === 0) {
    previewSection.style.display = "none";
    cancelBtn.style.display = "none";
    return;
  }

  previewSection.style.display = "block";
  cancelBtn.style.display = "inline-flex";
  countEl.textContent = parsedQuestions.length;

  let html = "";
  let hasInvalidQuestion = false;

  parsedQuestions.forEach((q, qIdx) => {
    const isOk = hasCorrectAnswer(q);
    if (!isOk) hasInvalidQuestion = true;
    const borderStyle = isOk ? "var(--border)" : "#ef4444";
    const typeBadge = q.type === "short"
      ? `<span class="badge badge-blue">Tu luan ${q.answer_kind === "number" ? "So" : "Chu"}</span>`
      : `<span class="badge" style="background: #f1f5f9; color: var(--text-main);">Trac nghiem</span>`;

    html += `
      <div style="background: #ffffff; border: 2px solid ${borderStyle}; border-radius: var(--radius); padding: 12px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; gap: 8px;">
          <div>
            <span style="font-weight: 700; color: var(--primary); margin-right: 6px;">Cau ${qIdx + 1}</span>
            ${typeBadge}
            ${!isOk ? '<span class="badge" style="background: #fee2e2; color: #dc2626; margin-left: 6px;">Chua hop le</span>' : ''}
          </div>
          <div class="q-actions">
            <button class="btn btn-outline" onclick="openEditQuestionModal(${qIdx})">Sua</button>
            <button class="btn btn-outline" style="color: var(--danger); border-color: #fca5a5;" onclick="deleteQuestion(${qIdx})">Xoa</button>
          </div>
        </div>

        <div style="margin-bottom: 10px; font-size: 0.95rem; line-height: 1.5;">
          ${renderMath(q.question)}
        </div>
    `;

    if (q.type === "short") {
      html += `
        <div style="background: #f8fafc; border: 1px solid var(--border); border-radius: var(--radius); padding: 8px 12px; font-size: 0.85rem;">
          <strong style="color: var(--text-muted);">Dap an chap nhan:</strong>
          <span style="color: var(--success); font-weight: 600; margin-left: 6px;">${escapeHtml(q.answers.join(" | "))}</span>
        </div>
      `;
    } else {
      html += `<div style="display: flex; flex-direction: column; gap: 6px;">`;
      q.options.forEach((opt, optIdx) => {
        const isCorrect = opt.is_correct === true;
        const badge = isCorrect ? '<span class="badge badge-green" style="margin-left: 6px;">Dap an dung</span>' : '';
        html += `
          <label style="display: flex; align-items: center; font-size: 0.9rem; cursor: pointer; padding: 4px; border-radius: 4px;">
            <input type="radio" name="preview_correct_${qIdx}" ${isCorrect ? "checked" : ""} onchange="setCorrectOption(${qIdx}, ${optIdx})" style="margin-right: 8px;">
            <span><strong>${PREFIXES[optIdx] || optIdx}.</strong> ${renderMath(opt.text)} ${badge}</span>
          </label>
        `;
      });
      html += `</div>`;
    }

    html += `</div>`;
  });

  container.innerHTML = html;

  if (hasInvalidQuestion) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Con cau hoi chua hop le (khong the xuat ban)";
  } else {
    saveBtn.disabled = false;
    saveBtn.textContent = "Xuat ban de thi len he thong";
  }
}

function setCorrectOption(qIdx, optIdx) {
  if (parsedQuestions[qIdx] && parsedQuestions[qIdx].options) {
    parsedQuestions[qIdx].options.forEach((opt, i) => {
      opt.is_correct = (i === optIdx);
    });
    renderPreview();
  }
}

// 6. Luu de thi len Supabase
async function saveExam() {
  const title = document.getElementById("examTitle").value.trim();
  const durationInput = document.getElementById("examDuration").value.trim();
  const duration = parseInt(durationInput, 10);

  if (!title) {
    alert("Vui long nhap tieu de de thi!");
    document.getElementById("examTitle").focus();
    return;
  }

  if (isNaN(duration) || duration < 1) {
    alert("Thoi gian lam bai phai la so nguyen tu 1 phut tro len!");
    document.getElementById("examDuration").focus();
    return;
  }

  if (!parsedQuestions || parsedQuestions.length === 0) {
    alert("Vui long nhap de thi co it nhat 1 cau hoi!");
    return;
  }

  const invalid = parsedQuestions.find(q => !hasCorrectAnswer(q));
  if (invalid) {
    alert("Con cau hoi chua hop le. Vui long kiem tra lai truoc khi xuat ban!");
    return;
  }

  const btn = document.getElementById("btnSaveExam");
  btn.disabled = true;
  btn.textContent = "Dang luu de thi...";

  try {
    await ExamService.createExam(title, duration, parsedQuestions);
    alert("Da xuat ban de thi thanh cong! Tat ca thi sinh bay gio deu co the vao lam.");
    resetImport();
    loadExistingExams();
  } catch (err) {
    alert("Loi khi luu de thi: " + err.message);
  } finally {
    btn.disabled = false;
    btn.textContent = "Xuat ban de thi len he thong";
  }
}

// 7. Lay danh sach de thi da tao
async function loadExistingExams() {
  const tbody = document.getElementById("examTableBody");
  try {
    const exams = await ExamService.getAllExams();
    if (!exams || exams.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Chua co de thi nao.</td></tr>';
      return;
    }

    let html = "";
    exams.forEach(ex => {
      const dateStr = ex.created_at ? new Date(ex.created_at).toLocaleDateString("vi-VN") : "--";
      html += `
        <tr>
          <td>#${ex.id}</td>
          <td><strong>${escapeHtml(ex.title)}</strong></td>
          <td>${ex.duration_minutes} phut</td>
          <td>${dateStr}</td>
          <td>
            <button class="btn btn-outline" style="color: var(--danger); border-color: #fca5a5; padding: 4px 8px; font-size: 0.8rem;" onclick="deleteExam(${ex.id})">Xoa</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Loi tai danh sach de thi.</td></tr>`;
  }
}

// Xoa cung de thi khoi he thong
async function deleteExam(examId) {
  if (!confirm(`Ban co chac chan muon xoa vinh vien de thi #${examId} khoi he thong khong? Toan bo ket qua thi lien quan se bi anh huong.`)) {
    return;
  }

  try {
    await ExamService.deleteExam(examId);
    alert(`Da xoa vinh vien de thi #${examId} thanh cong!`);
    loadExistingExams();
    loadResults();
  } catch (err) {
    alert("Loi khi xoa de thi: " + err.message);
  }
}

// 8. Lay danh sach ket qua & Nhat ky thao tac (Audit Logs)
async function loadResults() {
  const tbody = document.getElementById("resultsTableBody");
  try {
    allResultsData = await ResultService.getAllResults();
    if (!allResultsData || allResultsData.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Chua co bai thi nao duoc nop.</td></tr>';
      return;
    }

    let html = "";
    allResultsData.forEach((res, index) => {
      const dateStr = res.submitted_at ? new Date(res.submitted_at).toLocaleString("vi-VN") : "--";
      html += `
        <tr>
          <td>#${res.id}</td>
          <td><strong>${escapeHtml(res.student_name)}</strong></td>
          <td><span class="badge badge-blue" style="font-size: 0.9rem;">${res.score} / 10</span></td>
          <td>${res.total_questions || "--"} cau</td>
          <td>${res.duration_minutes || "--"} phut</td>
          <td>${dateStr}</td>
          <td>
            <button class="btn btn-outline" style="padding: 4px 8px; font-size: 0.8rem;" onclick="viewResultDetail(${index})">Xem nhat ky</button>
          </td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--danger);">Loi tai ket qua thi.</td></tr>`;
  }
}

// 9. Xem chi tiet nhat ky thao tac va bai lam
function viewResultDetail(index) {
  const item = allResultsData[index];
  if (!item) return;

  document.getElementById("modalTitle").textContent = `Chi tiet bai lam: ${item.student_name} (Diem: ${item.score}/10)`;

  // Hien thi cau tra loi
  const answersList = document.getElementById("modalAnswersList");
  let ansHtml = "";
  if (Array.isArray(item.answers) && item.answers.length > 0) {
    item.answers.forEach(a => {
      const statusText = a.is_correct ? '<span style="color: var(--success); font-weight: 600;">Dung</span>' : '<span style="color: var(--danger); font-weight: 600;">Sai</span>';
      let answerText = "";

      if (a.text_answer !== undefined && a.text_answer !== null) {
        answerText = `Dien [${renderMath(String(a.text_answer))}]`;
      } else {
        const chosen = a.selected_index !== null ? (PREFIXES[a.selected_index] || a.selected_index) : "Chua chon";
        answerText = `Chon [${chosen}]`;
      }

      ansHtml += `<div style="padding: 6px 0; border-bottom: 1px solid #f1f5f9; display: flex; justify-content: space-between; align-items: center;">
        <span><strong>Cau ${a.question_index}:</strong> ${answerText}</span>
        <span>${statusText}</span>
      </div>`;
    });
  } else {
    ansHtml = '<p style="color: var(--text-muted);">Khong co du lieu cau tra loi chi tiet.</p>';
  }
  answersList.innerHTML = ansHtml;

  // Hien thi nhat ky thao tac (Action Logs)
  const logsList = document.getElementById("modalLogsList");
  let logsHtml = "";
  if (Array.isArray(item.action_logs) && item.action_logs.length > 0) {
    item.action_logs.forEach(log => {
      logsHtml += `
        <div style="padding: 5px 0; border-bottom: 1px solid #e2e8f0; font-family: monospace;">
          <span style="color: var(--text-muted); font-size: 0.8rem;">[${log.time || "--"}]</span>
          <strong style="color: var(--primary); font-size: 0.85rem;">${escapeHtml(log.type)}:</strong>
          <span>${escapeHtml(log.detail)}</span>
        </div>
      `;
    });
  } else {
    logsHtml = '<p style="color: var(--text-muted);">Khong co nhat ky thao tac nao duoc ghi lai.</p>';
  }
  logsList.innerHTML = logsHtml;

  document.getElementById("detailModal").style.display = "flex";
}

function closeDetailModal() {
  document.getElementById("detailModal").style.display = "none";
}

function showUploadStatus(msg, isError) {
  const el = document.getElementById("uploadStatus");
  el.textContent = msg;
  el.style.display = "block";
  el.className = isError ? "alert-box alert-danger" : "alert-box alert-info";
}
