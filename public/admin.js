let parsedQuestions = [];
let allResultsData = [];

window.addEventListener("DOMContentLoaded", () => {
  loadExistingExams();
  loadResults();
});

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

// 1. Xu ly Upload file JSON
function handleJsonUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error("File JSON phai la mot mang danh sach cac cau hoi!");
      }
      parsedQuestions = data;
      showUploadStatus(`Da nap thanh cong ${parsedQuestions.length} cau hoi tu file JSON.`, false);
      renderPreview();
    } catch (err) {
      showUploadStatus("Loi dinh dang file JSON: " + err.message, true);
    }
  };
  reader.readAsText(file);
}

// 2. Xu ly Upload file PDF chuan qua API backend
async function handlePdfUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  showUploadStatus("Dang xu ly doc van ban tu file PDF...", false);

  const formData = new FormData();
  formData.append("pdf", file);

  try {
    const res = await fetch("/api/parse-pdf", {
      method: "POST",
      body: formData
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(err);
    }

    const result = await res.json();
    if (!result.questions || result.questions.length === 0) {
      throw new Error("Khong tim thay cau hoi nao trong file PDF!");
    }

    parsedQuestions = result.questions;
    showUploadStatus(`Da boc tach thanh cong ${parsedQuestions.length} cau hoi tu PDF!`, false);
    renderPreview();
  } catch (err) {
    showUploadStatus("Loi khi doc file PDF: " + err.message + " (Goi y: Ban co the dung che do nap file JSON de chuan xac nhat).", true);
  }
}

function showUploadStatus(msg, isError) {
  const el = document.getElementById("uploadStatus");
  el.textContent = msg;
  el.style.display = "block";
  el.className = isError ? "alert-box alert-danger" : "alert-box alert-info";
}

// 3. Hien thi ban xem truoc (Preview)
function renderPreview() {
  const container = document.getElementById("previewList");
  const countEl = document.getElementById("previewCount");
  document.getElementById("previewSection").style.display = "block";

  countEl.textContent = parsedQuestions.length;
  let html = "";
  const prefixes = ["A", "B", "C", "D", "E"];

  parsedQuestions.forEach((q, qIdx) => {
    html += `
      <div style="background: #ffffff; border: 1px solid var(--border); border-radius: var(--radius); padding: 10px; margin-bottom: 10px;">
        <div style="font-weight: 600; margin-bottom: 6px;">Cau ${qIdx + 1}: ${escapeHtml(q.question)}</div>
        <div style="display: flex; flex-direction: column; gap: 4px;">
    `;

    q.options.forEach((opt, optIdx) => {
      const isCorrect = opt.is_correct === true || opt.correct === true;
      const badge = isCorrect ? '<span class="badge badge-green" style="margin-left: 6px;">Dap an dung</span>' : '';
      html += `
        <div style="display: flex; align-items: center; font-size: 0.85rem;">
          <input type="radio" name="correct_${qIdx}" ${isCorrect ? "checked" : ""} onchange="setCorrectOption(${qIdx}, ${optIdx})" style="margin-right: 8px;">
          <span><strong>${prefixes[optIdx] || optIdx}.</strong> ${escapeHtml(opt.text || opt)} ${badge}</span>
        </div>
      `;
    });

    html += `
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
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

// 4. Luu de thi len Supabase
async function saveExam() {
  const title = document.getElementById("examTitle").value.trim();
  const duration = document.getElementById("examDuration").value.trim();
  const assignedTo = document.getElementById("assignedTo").value.trim();

  if (!title) {
    alert("Vui long nhap tieu de de thi!");
    return;
  }
  if (!parsedQuestions || parsedQuestions.length === 0) {
    alert("Vui long tai len de thi co it nhat 1 cau hoi!");
    return;
  }

  const btn = document.getElementById("btnSaveExam");
  btn.disabled = true;
  btn.textContent = "Dang luu de thi...";

  try {
    await ExamService.createExam(title, duration, assignedTo, parsedQuestions);
    alert("Da xuat ban de thi thanh cong!");
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

// 5. Lay danh sach de thi da tao
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
          <td><span class="badge badge-blue">${escapeHtml(ex.assigned_to)}</span></td>
          <td>${dateStr}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; color: var(--danger);">Loi tai danh sach de thi.</td></tr>`;
  }
}

// 6. Lay danh sach ket qua & Nhat ky thao tac (Audit Logs)
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

// 7. Xem chi tiet nhat ky thao tac va bai lam
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
      const prefixes = ["A", "B", "C", "D"];
      const chosen = a.selected_index !== null ? (prefixes[a.selected_index] || a.selected_index) : "Chua chon";
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
          <strong style="color: var(--primary); font-size: 0.85rem;">${log.type}:</strong>
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

function escapeHtml(str) {
  if (typeof str !== "string") return str;
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
