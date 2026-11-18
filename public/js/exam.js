// Trang thai phien thi hien tai
let currentStudent = "";
let currentExam = null;
let currentQuestions = [];
let userAnswers = {}; // { [questionIndex]: optionIndex (number) hoac textValue (string) }
let currentQuestionIndex = 0;
let remainingSeconds = 0;
let deadline = 0;
let timerInterval = null;
let tracker = null;
let isSubmitting = false;
let shortDebounceTimer = null;

// Khoi tao khi tai trang
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentStudent = (urlParams.get("user") || "").trim();
  if (!currentStudent) {
    window.location.href = "index.html";
    return;
  }
  document.getElementById("studentBadge").textContent = currentStudent;

  loadAssignedExams();
});

// Dem so cau da tra loi hop le
function getAnsweredCount() {
  let count = 0;
  if (!currentQuestions || currentQuestions.length === 0) return 0;
  currentQuestions.forEach((q, idx) => {
    const val = userAnswers[idx];
    if (val !== undefined && val !== null && String(val).trim() !== "") {
      count++;
    }
  });
  return count;
}

// 1. Lazy load: Lay danh sach de thi cho thi sinh
async function loadAssignedExams() {
  const container = document.getElementById("examListContainer");
  try {
    const exams = await ExamService.getAvailableExams();
    if (!exams || exams.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 24px;">
          <p>Hiện tại chưa có đề thi nào trên hệ thống.</p>
        </div>
      `;
      return;
    }

    let html = "";
    exams.forEach(exam => {
      html += `
        <div class="card" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
          <div>
            <h3 style="font-size: 1.05rem;">${escapeHtml(exam.title)}</h3>
            <p style="font-size: 0.85rem; margin-top: 4px; color: var(--text-muted);">Thời gian: ${exam.duration_minutes} phút</p>
          </div>
          <button class="btn btn-primary" onclick="startExam(${exam.id})">Vào làm bài</button>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    console.error("Lỗi khi tải danh sách đề thi:", err);
    container.innerHTML = `
      <div class="card alert-box alert-danger">
        Không thể tải danh sách đề thi. Vui lòng kiểm tra kết nối mạng.
      </div>
    `;
  }
}

// 2. Bat dau lam bai thi (Lazy load chi tiet de thi)
async function startExam(examId) {
  try {
    const examDetail = await ExamService.getExamDetail(examId);
    if (!examDetail || !examDetail.questions || examDetail.questions.length === 0) {
      alert("Đề thi này chưa có nội dung câu hỏi!");
      return;
    }

    currentExam = examDetail;
    currentQuestions = examDetail.questions;
    currentQuestionIndex = 0;
    userAnswers = {};
    isSubmitting = false;

    // Khoi tao bo theo doi thao tac
    tracker = new ActionTracker();
    tracker.addLog("CHON_DE", `Bắt đầu làm đề: ${currentExam.title}`, null, null);

    // Khoi phuc ban nhap neu con han (mat mang / tat nguon / tai lai trang)
    const draft = StorageHelper.getDraft(examId);
    if (draft && draft.deadline && draft.deadline > Date.now()) {
      userAnswers = draft.answers || {};
      deadline = draft.deadline;
      tracker.addLog("KHOI_PHUC", `Khôi phục bài làm dở dang: ${getAnsweredCount()} câu đã trả lời`);
    } else {
      deadline = Date.now() + (currentExam.duration_minutes || 45) * 60000;
      StorageHelper.saveDraft(examId, userAnswers, deadline);
    }

    // Kich hoat Kiosk Mode tren Android neu co
    if (window.KioskBridge && typeof window.KioskBridge.startLock === "function") {
      window.KioskBridge.startLock();
    } else {
      requestWebFullscreen();
    }

    // Chuyen giao dien
    document.getElementById("viewExamList").style.display = "none";
    document.getElementById("viewExamPlay").style.display = "block";
    document.getElementById("headerTitle").textContent = currentExam.title;

    // Khoi dong dong ho dem nguoc
    document.getElementById("timerDisplay").style.display = "block";
    renderQuestion();
    tick();
    timerInterval = setInterval(tick, 1000);
  } catch (err) {
    alert("Lỗi khi tải đề thi: " + err.message);
  }
}

function tick() {
  remainingSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  updateTimerText();
  if (remainingSeconds <= 0) {
    clearInterval(timerInterval);
    tracker.addLog("HET_GIO", "Đồng hồ về 00:00, tự động nộp bài");
    doSubmitExam();
  }
}

// Hien thi cau hoi hien tai
function renderQuestion() {
  const q = currentQuestions[currentQuestionIndex];
  if (!q) return;

  document.getElementById("questionCounter").textContent = `Câu ${currentQuestionIndex + 1} / ${currentQuestions.length}`;
  document.getElementById("answeredStatus").textContent = `Đã trả lời: ${getAnsweredCount()} / ${currentQuestions.length}`;
  document.getElementById("questionText").innerHTML = renderMath(q.question);

  const container = document.getElementById("optionsContainer");
  const isShort = q.type === "short";

  if (isShort) {
    const isNumber = q.answer_kind !== "text";
    const currentVal = userAnswers[currentQuestionIndex] !== undefined ? String(userAnswers[currentQuestionIndex]) : "";
    const placeholder = isNumber ? "Nhập đáp án số (ví dụ: 3/4, 0.75, 2 1/3, -5)..." : "Nhập câu trả lời bằng chữ...";
    const helperText = isNumber ? "Hỗ trợ: số nguyên, số thập phân, phân số (a/b), hỗn số (a b/c)." : "Nhập câu trả lời chính xác.";

    container.innerHTML = `
      <div style="margin-bottom: 12px;">
        <div style="margin-bottom: 8px;">
          <span class="badge badge-blue">Tự luận ${isNumber ? "Số" : "Chữ"}</span>
        </div>
        <input 
          type="text" 
          id="shortAnswerInput" 
          class="form-control" 
          ${isNumber ? 'inputmode="decimal"' : ''} 
          placeholder="${placeholder}" 
          value="${escapeHtml(currentVal)}" 
          autocomplete="off"
          oninput="handleShortInput(this.value)"
          onchange="handleShortChange(this.value)"
          style="font-size: 1.05rem; padding: 12px;"
        >
        <div id="shortInputError" class="field-error" style="display: none;"></div>
        <div style="font-size: 0.8rem; color: var(--text-muted); margin-top: 6px;">${helperText}</div>
        <div id="shortMathPreviewContainer" style="margin-top: 10px; display: ${currentVal ? 'block' : 'none'};">
          <span style="font-size: 0.8rem; color: var(--text-muted);">Xem trước hiển thị:</span>
          <div id="shortMathPreview" class="math-preview">${currentVal ? renderMath(currentVal) : ""}</div>
        </div>
      </div>
    `;
  } else {
    // Trac nghiem (single)
    const opts = Array.isArray(q.options) ? q.options : [];
    let html = "";
    opts.forEach((opt, idx) => {
      const isSelected = userAnswers[currentQuestionIndex] === idx;
      const selectedClass = isSelected ? "selected" : "";
      html += `
        <div class="option-item ${selectedClass}" onclick="selectOption(${idx})">
          <span class="option-prefix">${PREFIXES[idx] || (idx + 1)}</span>
          <span>${renderMath(opt.text)}</span>
        </div>
      `;
    });
    container.innerHTML = html;
  }

  // Cap nhat trang thai nut truoc/sau
  document.getElementById("btnPrev").disabled = currentQuestionIndex === 0;
  document.getElementById("btnNext").disabled = currentQuestionIndex === currentQuestions.length - 1;
}

// Chon dap an trac nghiem
function selectOption(optionIndex) {
  if (isSubmitting) return;
  const prevSelection = userAnswers[currentQuestionIndex];
  userAnswers[currentQuestionIndex] = optionIndex;

  // Ghi log thao tac
  const chosenPrefix = PREFIXES[optionIndex] || optionIndex;
  if (prevSelection !== undefined && prevSelection !== optionIndex) {
    tracker.addLog("DOI_DAP_AN", `Đổi đáp án câu ${currentQuestionIndex + 1} sang ${chosenPrefix}`, currentQuestionIndex + 1, chosenPrefix);
  } else {
    tracker.addLog("CHON_DAP_AN", `Chọn đáp án câu ${currentQuestionIndex + 1} là ${chosenPrefix}`, currentQuestionIndex + 1, chosenPrefix);
  }

  // Luu nhap local
  StorageHelper.saveDraft(currentExam.id, userAnswers, deadline);

  renderQuestion();
}

// Xu ly nhap dap an tu luan ngan (Debounce 300ms)
function handleShortInput(val) {
  clearTimeout(shortDebounceTimer);
  shortDebounceTimer = setTimeout(() => {
    validateAndSaveShortInput(val);
  }, 300);
}

function handleShortChange(val) {
  clearTimeout(shortDebounceTimer);
  validateAndSaveShortInput(val);

  const trimmed = val.trim();
  if (tracker) {
    tracker.addLog("NHAP_DAP_AN", `Nhập đáp án câu ${currentQuestionIndex + 1}: ${trimmed || "(để trống)"}`, currentQuestionIndex + 1, trimmed);
  }
}

function validateAndSaveShortInput(val) {
  const q = currentQuestions[currentQuestionIndex];
  if (!q || q.type !== "short") return;

  const inputEl = document.getElementById("shortAnswerInput");
  const errorEl = document.getElementById("shortInputError");
  const previewBox = document.getElementById("shortMathPreview");
  const previewContainer = document.getElementById("shortMathPreviewContainer");
  const answeredEl = document.getElementById("answeredStatus");

  const trimmed = val.trim();

  if (!trimmed) {
    if (inputEl) inputEl.classList.remove("input-invalid");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
    if (previewContainer) previewContainer.style.display = "none";
    delete userAnswers[currentQuestionIndex];
    StorageHelper.saveDraft(currentExam.id, userAnswers, deadline);
    if (answeredEl) answeredEl.textContent = `Đã trả lời: ${getAnsweredCount()} / ${currentQuestions.length}`;
    return;
  }

  if (q.answer_kind === "number") {
    const num = parseNumber(trimmed);
    if (num === null) {
      if (inputEl) inputEl.classList.add("input-invalid");
      if (errorEl) {
        errorEl.textContent = "Sai định dạng số. Ví dụ hợp lệ: 3/4, 0.75, 2 1/3, -5";
        errorEl.style.display = "block";
      }
      if (previewContainer) previewContainer.style.display = "none";
      // Xoa khoi userAnswers de khong tinh la da lam
      delete userAnswers[currentQuestionIndex];
    } else {
      if (inputEl) inputEl.classList.remove("input-invalid");
      if (errorEl) {
        errorEl.textContent = "";
        errorEl.style.display = "none";
      }
      userAnswers[currentQuestionIndex] = trimmed;
      if (previewBox && previewContainer) {
        previewContainer.style.display = "block";
        previewBox.innerHTML = renderMath(trimmed);
      }
    }
  } else {
    // text
    if (inputEl) inputEl.classList.remove("input-invalid");
    if (errorEl) {
      errorEl.textContent = "";
      errorEl.style.display = "none";
    }
    userAnswers[currentQuestionIndex] = trimmed;
    if (previewBox && previewContainer) {
      previewContainer.style.display = "block";
      previewBox.innerHTML = renderMath(trimmed);
    }
  }

  StorageHelper.saveDraft(currentExam.id, userAnswers, deadline);
  if (answeredEl) answeredEl.textContent = `Đã trả lời: ${getAnsweredCount()} / ${currentQuestions.length}`;
}

// Dieu huong qua lai giua cac cau
function navigateQuestion(step) {
  // Luu lai neu dang o o nhap tu luan
  const inputEl = document.getElementById("shortAnswerInput");
  if (inputEl) {
    validateAndSaveShortInput(inputEl.value);
  }

  const nextIndex = currentQuestionIndex + step;
  if (nextIndex >= 0 && nextIndex < currentQuestions.length) {
    currentQuestionIndex = nextIndex;
    renderQuestion();
  }
}

// Dong ho dem nguoc
function updateTimerText() {
  const mins = Math.floor(remainingSeconds / 60);
  const secs = remainingSeconds % 60;
  const timerElem = document.getElementById("timerDisplay");
  timerElem.textContent = `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;

  if (remainingSeconds < 300) {
    timerElem.classList.add("warning");
  } else {
    timerElem.classList.remove("warning");
  }
}

// Xac nhan nop bai
function confirmSubmit() {
  if (isSubmitting) return;

  // Luu o nhap hien tai neu co
  const inputEl = document.getElementById("shortAnswerInput");
  if (inputEl) {
    validateAndSaveShortInput(inputEl.value);
  }

  const answeredCount = getAnsweredCount();
  const totalCount = currentQuestions.length;
  let msg = `Bạn đã trả lời ${answeredCount} / ${totalCount} câu. Bạn có chắc chắn muốn nộp bài thi không?`;

  if (answeredCount < totalCount) {
    msg = `Cảnh báo: Còn ${totalCount - answeredCount} câu chưa trả lời hoặc sai định dạng! Bạn có chắc chắn muốn nộp bài?`;
  }

  if (confirm(msg)) {
    doSubmitExam();
  }
}

// Thuc hien nop bai ("Luu truoc - Khoa sau")
async function doSubmitExam() {
  if (isSubmitting) return;
  isSubmitting = true;
  if (timerInterval) clearInterval(timerInterval);

  const btnSubmit = document.getElementById("btnSubmit");
  btnSubmit.disabled = true;
  btnSubmit.textContent = "Đang nộp bài...";

  // 1. Tinh diem
  let correctCount = 0;
  const formattedAnswers = [];

  currentQuestions.forEach((q, idx) => {
    const userVal = userAnswers[idx];
    let isCorrect = false;

    if (q.type === "short") {
      isCorrect = isShortCorrect(userVal, q.answers, q.answer_kind);
      if (isCorrect) correctCount++;
      formattedAnswers.push({
        question_index: idx + 1,
        type: "short",
        answer_kind: q.answer_kind || "number",
        text_answer: userVal !== undefined && userVal !== null ? String(userVal) : "",
        is_correct: isCorrect
      });
    } else {
      // type === "single"
      const selectedIndex = typeof userVal === "number" ? userVal : null;
      if (selectedIndex !== null && q.options && q.options[selectedIndex]) {
        const opt = q.options[selectedIndex];
        if (opt.is_correct === true || opt.correct === true) {
          isCorrect = true;
        }
      }
      if (isCorrect) correctCount++;
      formattedAnswers.push({
        question_index: idx + 1,
        type: "single",
        selected_index: selectedIndex,
        is_correct: isCorrect
      });
    }
  });

  const total = currentQuestions.length;
  const score = total > 0 ? parseFloat(((correctCount / total) * 10).toFixed(1)) : 0;
  const durationSpent = Math.max(1, Math.round(((currentExam.duration_minutes || 45) * 60 - remainingSeconds) / 60));

  tracker.addLog("NOP_BAI", `Nộp bài thành công với số điểm ${score}/10`, null, null);

  // 2. Gui len Supabase qua REST API
  try {
    await ResultService.submitResult(
      currentExam.id,
      currentStudent,
      score,
      total,
      durationSpent,
      formattedAnswers,
      tracker.getLogs()
    );

    // Luu thanh cong -> Xoa ban nhap -> Chuyen sang man hinh Khoa Kiosk
    StorageHelper.clearDraft(currentExam.id);

    document.getElementById("finalScore").textContent = score;
    document.getElementById("finalSummary").textContent = `Đúng: ${correctCount} / ${total} câu (Thời gian: ${durationSpent} phút)`;
    document.getElementById("viewExamPlay").style.display = "none";
    document.getElementById("viewLockScreen").style.display = "flex";
  } catch (err) {
    console.error("Lỗi khi nộp bài:", err);
    isSubmitting = false;
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Thử nộp lại";
    alert("Không thể nộp bài do lỗi kết nối mạng. Vui lòng kiểm tra Wifi/4G và bấm Thử nộp lại. Bài làm của bạn vẫn được giữ nguyên!");
  }
}

// 3. Co che Mo khoa cho Giam thi
function showUnlockDialog() {
  document.getElementById("proctorInput").value = "";
  document.getElementById("unlockError").style.display = "none";
  document.getElementById("viewUnlockModal").style.display = "flex";
  document.getElementById("proctorInput").focus();
}

function hideUnlockDialog() {
  document.getElementById("viewUnlockModal").style.display = "none";
}

function verifyUnlock() {
  const val = document.getElementById("proctorInput").value.trim();
  if (val === PROCTOR_PASSWORD_DEFAULT) {
    if (window.KioskBridge && typeof window.KioskBridge.stopLock === "function") {
      window.KioskBridge.stopLock();
    }
    alert("Mở khóa thành công!");
    window.location.href = "index.html";
  } else {
    document.getElementById("unlockError").style.display = "block";
  }
}

function requestWebFullscreen() {
  const el = document.documentElement;
  if (el.requestFullscreen) {
    el.requestFullscreen().catch(() => { });
  } else if (el.webkitRequestFullscreen) {
    el.webkitRequestFullscreen().catch(() => { });
  }
}
