// Trang thai phien thi hien tai
let currentStudent = "";
let currentExam = null;
let currentQuestions = [];
let userAnswers = {}; // { questionIndex: optionIndex }
let currentQuestionIndex = 0;
let remainingSeconds = 0;
let deadline = 0;
let timerInterval = null;
let tracker = null;
let isSubmitting = false;

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

// 1. Lazy load: Lay danh sach de thi cho thi sinh
async function loadAssignedExams() {
  const container = document.getElementById("examListContainer");
  try {
    const exams = await ExamService.getAvailableExams();
    if (!exams || exams.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 24px;">
          <p>Hien tai chua co de thi nao tren he thong.</p>
        </div>
      `;
      return;
    }

    let html = "";
    exams.forEach(exam => {
      html += `
        <div class="card" style="display: flex; justify-content: space-between; align-items: center;">
          <div>
            <h3 style="font-size: 1.05rem;">${escapeHtml(exam.title)}</h3>
            <p style="font-size: 0.85rem; margin-top: 4px;">Thoi gian: ${exam.duration_minutes} phut</p>
          </div>
          <button class="btn btn-primary" onclick="startExam(${exam.id})">Vao lam bai</button>
        </div>
      `;
    });
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = `
      <div class="card alert-box alert-danger">
        Khong the tai danh sach de thi. Vui long kiem tra ket noi mang.
      </div>
    `;
  }
}

// 2. Bat dau lam bai thi (Lazy load chi tiet de thi)
async function startExam(examId) {
  try {
    const examDetail = await ExamService.getExamDetail(examId);
    if (!examDetail || !examDetail.questions || examDetail.questions.length === 0) {
      alert("De thi nay chua co noi dung cau hoi!");
      return;
    }

    currentExam = examDetail;
    currentQuestions = examDetail.questions;
    currentQuestionIndex = 0;
    userAnswers = {};
    isSubmitting = false;

    // Khoi tao bo theo doi thao tac
    tracker = new ActionTracker();
    tracker.addLog("CHON_DE", `Bat dau lam de: ${currentExam.title}`, null, null);

    // Khoi phuc ban nhap neu co (mat mang / tat nguon / tai lai trang)
    const draft = StorageHelper.getDraft(examId);
    if (draft && draft.deadline) {
      userAnswers = draft.answers || {};
      deadline = draft.deadline;
      tracker.addLog("KHOI_PHUC", `Khoi phuc ban nhap: ${Object.keys(userAnswers).length} cau da chon`);
    } else {
      deadline = Date.now() + (currentExam.duration_minutes || 45) * 60000;
      StorageHelper.saveDraft(examId, userAnswers, deadline);
    }

    // Kich hoat Kiosk Mode tren Android neu co
    if (window.KioskBridge && typeof window.KioskBridge.startLock === "function") {
      window.KioskBridge.startLock();
    } else {
      // Thu toan man hinh tren trinh duyet Web
      requestWebFullscreen();
    }

    // Chuyen giao dien
    document.getElementById("viewExamList").style.display = "none";
    document.getElementById("viewExamPlay").style.display = "block";
    document.getElementById("headerTitle").textContent = currentExam.title;

    // Khoi dong dong ho dem nguoc theo moc deadline (khong lech khi tab bi throttle)
    document.getElementById("timerDisplay").style.display = "block";
    renderQuestion();
    tick();
    timerInterval = setInterval(tick, 1000);
  } catch (err) {
    alert("Loi khi tai de thi: " + err.message);
  }
}

function tick() {
  remainingSeconds = Math.max(0, Math.round((deadline - Date.now()) / 1000));
  updateTimerText();
  if (remainingSeconds <= 0) {
    clearInterval(timerInterval);
    tracker.addLog("HET_GIO", "Dong ho ve 00:00, tu dong nop bai");
    doSubmitExam();
  }
}

// Hien thi cau hoi hien tai
function renderQuestion() {
  const q = currentQuestions[currentQuestionIndex];
  document.getElementById("questionCounter").textContent = `Cau ${currentQuestionIndex + 1} / ${currentQuestions.length}`;
  document.getElementById("answeredStatus").textContent = `Da chon: ${Object.keys(userAnswers).length} / ${currentQuestions.length}`;
  document.getElementById("questionText").textContent = q.question;

  const container = document.getElementById("optionsContainer");
  let html = "";
  q.options.forEach((opt, idx) => {
    const isSelected = userAnswers[currentQuestionIndex] === idx;
    const selectedClass = isSelected ? "selected" : "";
    html += `
      <div class="option-item ${selectedClass}" onclick="selectOption(${idx})">
        <span class="option-prefix">${PREFIXES[idx] || (idx + 1)}</span>
        <span>${escapeHtml(opt.text)}</span>
      </div>
    `;
  });

  container.innerHTML = html;

  // Cap nhat trang thai nut truoc/sau
  document.getElementById("btnPrev").disabled = currentQuestionIndex === 0;
  document.getElementById("btnNext").disabled = currentQuestionIndex === currentQuestions.length - 1;
}

// Chon dap an
function selectOption(optionIndex) {
  if (isSubmitting) return;
  const prevSelection = userAnswers[currentQuestionIndex];
  userAnswers[currentQuestionIndex] = optionIndex;

  // Ghi log thao tac
  const chosenPrefix = PREFIXES[optionIndex] || optionIndex;
  if (prevSelection !== undefined && prevSelection !== optionIndex) {
    tracker.addLog("DOI_DAP_AN", `Doi dap an cau ${currentQuestionIndex + 1} sang ${chosenPrefix}`, currentQuestionIndex + 1, chosenPrefix);
  } else {
    tracker.addLog("CHON_DAP_AN", `Chon dap an cau ${currentQuestionIndex + 1} la ${chosenPrefix}`, currentQuestionIndex + 1, chosenPrefix);
  }

  // Luu nhap local
  StorageHelper.saveDraft(currentExam.id, userAnswers, deadline);

  renderQuestion();
}

// Dieu huong qua lai giua cac cau
function navigateQuestion(step) {
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
  const answeredCount = Object.keys(userAnswers).length;
  const totalCount = currentQuestions.length;
  let msg = `Ban da lam ${answeredCount} / ${totalCount} cau. Ban co chac chan muon nop bai khong?`;
  if (answeredCount < totalCount) {
    msg = `Canh bao: Con ${totalCount - answeredCount} cau chua lam! Ban van muon nop bai?`;
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
  btnSubmit.textContent = "Dang nop bai...";

  // 1. Tinh diem
  let correctCount = 0;
  const formattedAnswers = [];

  currentQuestions.forEach((q, idx) => {
    const userSelected = userAnswers[idx];
    let isCorrect = false;

    // Kiem tra dap an dung theo field is_correct
    if (userSelected !== undefined && q.options[userSelected]) {
      const selectedObj = q.options[userSelected];
      if (selectedObj.is_correct === true || selectedObj.correct === true) {
        isCorrect = true;
      }
    }

    if (isCorrect) correctCount++;

    formattedAnswers.push({
      question_index: idx + 1,
      selected_index: userSelected !== undefined ? userSelected : null,
      is_correct: isCorrect
    });
  });

  const total = currentQuestions.length;
  const score = total > 0 ? ((correctCount / total) * 10).toFixed(1) : 0;
  const durationSpent = Math.max(1, Math.round(((currentExam.duration_minutes || 45) * 60 - remainingSeconds) / 60));

  tracker.addLog("NOP_BAI", `Nop bai thanh cong voi so diem ${score}/10`, null, null);

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
    document.getElementById("finalSummary").textContent = `Dung: ${correctCount} / ${total} cau (Thoi gian: ${durationSpent} phut)`;
    document.getElementById("viewExamPlay").style.display = "none";
    document.getElementById("viewLockScreen").style.display = "flex";
  } catch (err) {
    isSubmitting = false;
    btnSubmit.disabled = false;
    btnSubmit.textContent = "Thu nop lai";
    alert("Khong the nop bai vi loi ket noi mang. Vui long kiem tra Wifi/4G va bam Thu nop lai. Bai lam cua ban van duoc giu nguyen!");
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
    // Goi API native Android neu co
    if (window.KioskBridge && typeof window.KioskBridge.stopLock === "function") {
      window.KioskBridge.stopLock();
    }
    alert("Mo khoa thanh cong!");
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
