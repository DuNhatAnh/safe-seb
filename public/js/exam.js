// Trang thai phien thi hien tai
let currentStudent = "";
let currentExam = null;
let currentQuestions = [];
let userAnswers = {};   // { [questionIndex]: dap an hop le (dinh dang theo tung dang, xem question-types.js) }
let invalidInputs = {}; // { [questionIndex]: chuoi thi sinh go sai dinh dang }
let currentQuestionIndex = 0;
let remainingSeconds = 0;
let deadline = 0;
let timerInterval = null;
let tracker = null;
let isSubmitting = false;
let inputDebounceTimer = null;

// Khoi tao khi tai trang
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  currentStudent = (urlParams.get("user") || "").trim();
  if (!currentStudent) {
    window.location.href = "index.html";
    return;
  }
  document.getElementById("studentBadge").textContent = currentStudent;

  // Lang nghe thao tac tra loi cho moi dang cau (phan tu co data-ans do registry sinh ra)
  const container = document.getElementById("optionsContainer");
  container.addEventListener("click", e => {
    const el = e.target.closest("[data-ans]");
    if (el && el.tagName !== "INPUT") handleAnswer(el, true);
  });
  container.addEventListener("input", e => {
    if (e.target.dataset.ans !== "input") return;
    clearTimeout(inputDebounceTimer);
    inputDebounceTimer = setTimeout(() => handleAnswer(e.target, false), 300);
  });
  container.addEventListener("change", e => {
    if (e.target.dataset.ans !== "input") return;
    clearTimeout(inputDebounceTimer);
    handleAnswer(e.target, true);
  });

  loadAssignedExams();
});

function logoutStudent() {
  if (confirm("Đăng xuất khỏi tài khoản thí sinh?")) window.location.href = "index.html";
}

// Dem so cau da tra loi hop le
// Cau tu luan giao vien cham (lam tren giay) khong tinh vao so cau can tra loi
function answerableIndexes() {
  return currentQuestions.map((q, i) => i).filter(i => !getType(currentQuestions[i]).manual);
}

function getAnsweredCount() {
  return answerableIndexes().filter(i => getType(currentQuestions[i]).isAnswered(userAnswers[i])).length;
}

function updateAnsweredStatus() {
  document.getElementById("answeredStatus").textContent = `Đã trả lời: ${getAnsweredCount()} / ${answerableIndexes().length}`;
  renderQuestionNav();
}

// De co chia phan (I, II, III...) hay la de cu (danh sach phang)
function hasParts() {
  return currentQuestions.some(q => Number.isInteger(q.part));
}

// Luoi dieu huong cau hoi, chia theo phan
function renderQuestionNav() {
  const groups = groupByPart(currentQuestions);
  document.getElementById("questionNav").innerHTML = groups.map(g => `
    <div class="q-nav-part">
      ${hasParts() ? `<span class="q-nav-label">${ROMAN[g.part] || g.part + 1}</span>` : ""}
      ${g.items.map(({ q, index, num }) => {
        const t = getType(q);
        const cls = [
          index === currentQuestionIndex ? "current" : "",
          t.manual ? "manual" : t.isAnswered(userAnswers[index]) ? "done" : "",
          invalidInputs[index] !== undefined ? "invalid" : ""
        ].join(" ");
        return `<button type="button" class="q-nav-btn ${cls}" onclick="goToQuestion(${index})">${hasParts() ? num : index + 1}</button>`;
      }).join("")}
    </div>`).join("");
}

function goToQuestion(index) {
  flushPendingInput();
  currentQuestionIndex = index;
  renderQuestion();
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
    invalidInputs = {};
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
    document.getElementById("btnLogout").style.display = "none";
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

// Hien thi cau hoi hien tai (giao dien theo dang lay tu registry)
function renderQuestion() {
  const i = currentQuestionIndex;
  const q = currentQuestions[i];
  if (!q) return;

  const label = questionLabel(currentQuestions, i);
  const header = document.getElementById("partHeader");
  if (hasParts()) {
    const group = groupByPart(currentQuestions).find(g => g.part === label.part);
    header.innerHTML = `<strong>${partLabel(label.part)}.</strong> ${escapeHtml(getType(q).intro(group.items.length))}`;
    header.style.display = "block";
    document.getElementById("questionCounter").textContent = `Câu ${label.num} · ${fmtNum(maxPoints(q))} điểm`;
  } else {
    header.style.display = "none";
    document.getElementById("questionCounter").textContent = `Câu ${i + 1} / ${currentQuestions.length} · ${getType(q).label}`;
  }
  updateAnsweredStatus();
  document.getElementById("questionText").innerHTML = (hasParts() ? `<strong>Câu ${label.num}.</strong> ` : "") + renderMath(q.question);
  const img = document.getElementById("questionImage");
  img.style.display = q.image ? "block" : "none";
  if (q.image) img.src = q.image;

  const container = document.getElementById("optionsContainer");
  container.innerHTML = getType(q).renderExam(q, userAnswers[i], invalidInputs[i]);
  const input = container.querySelector("[data-ans=input]");
  if (input && invalidInputs[i] !== undefined) showInputError(input, getType(q).update(q, null, input).invalid);

  document.getElementById("btnPrev").disabled = i === 0;
  document.getElementById("btnNext").disabled = i === currentQuestions.length - 1;
}

// Xu ly 1 thao tac tra loi. commit=true: ghi log (click, roi o nhap)
function handleAnswer(el, commit) {
  if (isSubmitting) return;
  const i = currentQuestionIndex;
  const q = currentQuestions[i];
  const result = getType(q).update(q, userAnswers[i], el);
  const isInput = el.tagName === "INPUT";

  if (result.invalid) {
    delete userAnswers[i];
    invalidInputs[i] = el.value;
  } else {
    delete invalidInputs[i];
    if (result.value === undefined) delete userAnswers[i];
    else userAnswers[i] = result.value;
  }

  if (commit && tracker) {
    const detail = result.invalid ? `nhập sai định dạng "${el.value.trim()}"` : (result.log || "xoá đáp án");
    tracker.addLog(isInput ? "NHAP_DAP_AN" : "CHON_DAP_AN", `Câu ${i + 1}: ${detail}`, i + 1, result.value ?? null);
  }

  StorageHelper.saveDraft(currentExam.id, userAnswers, deadline);

  if (isInput) {
    showInputError(el, result.invalid);
    updateAnsweredStatus();
  } else {
    renderQuestion();
  }
}

function showInputError(input, message) {
  if (!input) return;
  const box = input.parentElement.querySelector(".field-error");
  input.classList.toggle("input-invalid", !!message);
  box.textContent = message || "";
  box.style.display = message ? "block" : "none";
}

// Luu o nhap dang go do (truoc khi chuyen cau / nop bai)
function flushPendingInput() {
  clearTimeout(inputDebounceTimer);
  const input = document.querySelector("#optionsContainer [data-ans=input]");
  if (input) handleAnswer(input, false);
}

// Dieu huong qua lai giua cac cau
function navigateQuestion(step) {
  flushPendingInput();
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

  flushPendingInput();

  const answeredCount = getAnsweredCount();
  const totalCount = answerableIndexes().length;
  const invalidList = Object.keys(invalidInputs).map(i => questionLabel(currentQuestions, Number(i)).text);
  let msg = `Bạn đã trả lời ${answeredCount} / ${totalCount} câu. Bạn có chắc chắn muốn nộp bài thi không?`;

  if (answeredCount < totalCount) {
    msg = `Cảnh báo: Còn ${totalCount - answeredCount} câu chưa trả lời đủ.`;
    if (invalidList.length) msg += ` ${invalidList.join(", ")} đang sai định dạng nên sẽ tính là chưa làm.`;
    msg += " Bạn vẫn muốn nộp bài?";
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

  // 1. Cham diem qua registry
  const { entries, earned, total: maxTotal, autoMax, pending, score } = gradeAll(currentQuestions, userAnswers);
  const total = currentQuestions.length;
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
      entries,
      tracker.getLogs()
    );

    // Luu thanh cong -> Xoa ban nhap -> Chuyen sang man hinh Khoa Kiosk
    StorageHelper.clearDraft(currentExam.id);

    if (pending) {
      // Con cau tu luan cho cham: chi bao diem phan tu dong
      document.getElementById("finalScore").textContent = `${fmtNum(earned)} / ${fmtNum(autoMax)}`;
      document.getElementById("finalSummary").textContent = `Điểm phần chấm tự động. ${pending} câu tự luận (${fmtNum(maxTotal - autoMax)} điểm) chờ giáo viên chấm. Thời gian: ${durationSpent} phút.`;
    } else {
      document.getElementById("finalScore").textContent = fmtNum(score);
      document.getElementById("finalSummary").textContent = `Đạt ${fmtNum(earned)} / ${fmtNum(maxTotal)} điểm câu (Thời gian: ${durationSpent} phút)`;
    }
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
