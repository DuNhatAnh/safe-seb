let parsedQuestions = [];
let allResultsData = [];

window.addEventListener("DOMContentLoaded", () => {
  // Kiem tra xac thuc quan tri vien
  if (sessionStorage.getItem("safe_exam_admin_auth") !== "true") {
    alert("Vui long dang nhap tai khoan quan tri!");
    window.location.href = "index.html";
    return;
  }

  setupDropzone();
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

// 1. Thiet lap Dropzone keo tha PDF
function setupDropzone() {
  const dropzone = document.getElementById("pdfDropzone");
  const fileInput = document.getElementById("pdfFileInput");

  if (!dropzone || !fileInput) return;

  dropzone.addEventListener("click", () => {
    fileInput.click();
  });

  fileInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (file) {
      handlePdfFile(file);
    }
    fileInput.value = "";
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });

  dropzone.addEventListener("dragleave", () => {
    dropzone.classList.remove("dragover");
  });

  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const file = e.dataTransfer.files[0];
    if (file) {
      handlePdfFile(file);
    }
  });
}

// 2. Xu ly goi API doc file PDF (gui raw body application/pdf)
async function handlePdfFile(file) {
  if (!file.name.toLowerCase().endsWith(".pdf")) {
    showUploadStatus("Chi chap nhan file dinh dang .pdf!", true);
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    showUploadStatus("Dung luong file PDF vuot qua gioi han 10MB!", true);
    return;
  }

  showUploadStatus("Dang doc van ban va phan tich de thi tu file PDF...", false);

  try {
    const res = await fetch("/api/parse-pdf", {
      method: "POST",
      headers: {
        "Content-Type": "application/pdf"
      },
      body: file
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || "Loi khong xac dinh khi doc PDF");
    }

    if (!data.questions || data.questions.length === 0) {
      throw new Error("Khong tim thay cau hoi nao trong file PDF!");
    }

    // Chuan hoa bang normalizeQuestions (strict = false de cho phep sua tay cau thieu dap an)
    const normalized = normalizeQuestions(data.questions, false);
    parsedQuestions = normalized.questions;

    // Hien thi canh bao neu co cau thieu dap an
    const warningsEl = document.getElementById("previewWarnings");
    const allWarnings = [...(data.warnings || []), ...(normalized.errors || [])];

    if (allWarnings.length > 0) {
      warningsEl.innerHTML = "<strong>Luu y can kiem tra:</strong><br>" + allWarnings.map(w => `- ${escapeHtml(w)}`).join("<br>");
      warningsEl.style.display = "block";
    } else {
      warningsEl.style.display = "none";
    }

    showUploadStatus(`Da trich xuat ${parsedQuestions.length} cau hoi tu PDF thanh cong. Vui long kiem tra dap an truoc khi xuat ban!`, false);
    renderPreview();
  } catch (err) {
    showUploadStatus("Loi khi doc file PDF: " + err.message, true);
  }
}

// 3. Modal Quy tac dinh dang
function openRulesModal() {
  document.getElementById("rulesModal").style.display = "flex";
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

// 4. Modal Nhap JSON
function openJsonModal() {
  document.getElementById("jsonInputArea").value = "";
  document.getElementById("jsonModalError").style.display = "none";
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

  let data;
  try {
    data = JSON.parse(raw);
  } catch (e) {
    errorBox.textContent = "Dinh dang JSON khong hop le: " + e.message;
    errorBox.style.display = "block";
    return;
  }

  // Chuan hoa voi strict = true (bat buoc moi cau dung 1 dap an)
  const normalized = normalizeQuestions(data, true);
  if (normalized.errors.length > 0) {
    errorBox.innerHTML = "<strong>Loi dinh dang cau hoi:</strong><br>" + normalized.errors.map(err => `- ${escapeHtml(err)}`).join("<br>");
    errorBox.style.display = "block";
    return;
  }

  parsedQuestions = normalized.questions;
  document.getElementById("previewWarnings").style.display = "none";
  showUploadStatus(`Da nap thanh cong ${parsedQuestions.length} cau hoi tu JSON!`, false);
  closeJsonModal();
  renderPreview();
}

// 5. Hien thi ban xem truoc (Preview)
function renderPreview() {
  const container = document.getElementById("previewList");
  const countEl = document.getElementById("previewCount");
  const saveBtn = document.getElementById("btnSaveExam");
  document.getElementById("previewSection").style.display = "block";

  countEl.textContent = parsedQuestions.length;
  let html = "";
  let hasInvalidQuestion = false;

  parsedQuestions.forEach((q, qIdx) => {
    const isOk = hasCorrectAnswer(q);
    if (!isOk) hasInvalidQuestion = true;
    const borderStyle = isOk ? "var(--border)" : "#ef4444";

    html += `
      <div style="background: #ffffff; border: 2px solid ${borderStyle}; border-radius: var(--radius); padding: 12px; margin-bottom: 12px;">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
          <div style="font-weight: 600;">Cau ${qIdx + 1}: ${escapeHtml(q.question)}</div>
          ${!isOk ? '<span class="badge" style="background: #fee2e2; color: #dc2626;">Chua co dap an dung</span>' : ''}
        </div>
        <div style="display: flex; flex-direction: column; gap: 6px;">
    `;

    q.options.forEach((opt, optIdx) => {
      const isCorrect = opt.is_correct === true;
      const badge = isCorrect ? '<span class="badge badge-green" style="margin-left: 6px;">Dap an dung</span>' : '';
      html += `
        <label style="display: flex; align-items: center; font-size: 0.9rem; cursor: pointer; padding: 4px; border-radius: 4px;">
          <input type="radio" name="correct_${qIdx}" ${isCorrect ? "checked" : ""} onchange="setCorrectOption(${qIdx}, ${optIdx})" style="margin-right: 8px;">
          <span><strong>${PREFIXES[optIdx] || optIdx}.</strong> ${escapeHtml(opt.text)} ${badge}</span>
        </label>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;

  // Neu con cau chua co dap an dung thi disable nut luu
  if (hasInvalidQuestion) {
    saveBtn.disabled = true;
    saveBtn.textContent = "Con cau hoi chua co dap an dung (khong the xuat ban)";
  } else {
    saveBtn.disabled = false;
    saveBtn.textContent = "Xuat ban de thi len he thong";
  }
}

function setCorrectOption(qIdx, optIdx) {
  parsedQuestions[qIdx].options.forEach((opt, i) => {
    opt.is_correct = (i === optIdx);
  });
  renderPreview();
}

function addSampleQuestion() {
  parsedQuestions.push({
    question: "Cau hoi moi vua them thu cong?",
    options: [
      { text: "Phuong an A", is_correct: true },
      { text: "Phuong an B", is_correct: false },
      { text: "Phuong an C", is_correct: false },
      { text: "Phuong an D", is_correct: false }
    ]
  });
  renderPreview();
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

  // Kiem tra lan cuoi xem con cau nao thieu dap an khong
  const invalid = parsedQuestions.find(q => !hasCorrectAnswer(q));
  if (invalid) {
    alert("Con cau hoi chua duoc chon dap an dung. Vui long chon dap an dung cho tat ca cac cau truoc khi xuat ban!");
    return;
  }

  const btn = document.getElementById("btnSaveExam");
  btn.disabled = true;
  btn.textContent = "Dang luu de thi...";

  try {
    await ExamService.createExam(title, duration, parsedQuestions);
    alert("Da xuat ban de thi thanh cong! Tat ca thi sinh bay gio deu co the vao lam.");
    document.getElementById("examTitle").value = "";
    parsedQuestions = [];
    document.getElementById("previewSection").style.display = "none";
    document.getElementById("uploadStatus").style.display = "none";
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
          <td><span class="badge badge-green">Tat ca thi sinh</span></td>
          <td>${dateStr}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Loi tai danh sach de thi.</td></tr>`;
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
      const chosen = a.selected_index !== null ? (PREFIXES[a.selected_index] || a.selected_index) : "Chua chon";
      ansHtml += `<div style="padding: 4px 0; border-bottom: 1px solid #f1f5f9;">Cau ${a.question_index}: Chon [${chosen}] - ${statusText}</div>`;
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
