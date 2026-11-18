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
let submittedByExam = {}; // { [examId]: ket qua da nop } -> moi de chi lam 1 lan
let exitMode = null;      // "emergency" (dang lam bai) | "exit" (sau khi nop)
let wrongPasswordCount = 0;

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

// Luu ban nhap (dap an + han nop + nhat ky) de khoi phuc khi mat mang / tai lai trang
function saveDraftNow() {
  if (!currentExam || isSubmitting) return;
  StorageHelper.saveDraft(currentExam.id, userAnswers, deadline, tracker ? tracker.getLogs() : null);
}

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
  updateSubmitState();
}

// Chi cho nop khi da tra loi du (het gio thi tu dong nop bat ke)
function missingCount() {
  return answerableIndexes().length - getAnsweredCount();
}

function updateSubmitState() {
  if (isSubmitting) return;
  const missing = missingCount();
  const invalid = Object.keys(invalidInputs).length;
  const btn = document.getElementById("btnSubmit");
  const hint = document.getElementById("submitHint");
  btn.disabled = missing > 0 && remainingSeconds > 0;
  if (missing > 0) {
    hint.textContent = `Còn ${missing} câu chưa trả lời${invalid ? ` (${invalid} câu sai định dạng)` : ""}. Làm đủ tất cả các câu mới nộp được bài.`;
    hint.style.display = "block";
  } else {
    hint.style.display = "none";
  }
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

// 1. Lazy load: Lay danh sach de thi + lich su lam bai cua thi sinh
async function loadAssignedExams() {
  const container = document.getElementById("examListContainer");
  try {
    const [exams, results] = await Promise.all([
      StudentApi.listExams(),
      StudentApi.history(currentStudent).catch(err => {
        console.warn("Khong tai duoc lich su lam bai:", err.message);
        return null;
      })
    ]);
    submittedByExam = {};
    (results || []).forEach(r => { if (r.exam_id != null && !submittedByExam[r.exam_id]) submittedByExam[r.exam_id] = r; });
    renderHistory(results, exams || []);

    if (!exams || exams.length === 0) {
      container.innerHTML = `
        <div class="card" style="text-align: center; padding: 24px;">
          <p>Hiện tại chưa có đề thi nào trên hệ thống.</p>
        </div>
      `;
      return;
    }

    container.innerHTML = exams.map(exam => {
      const done = submittedByExam[exam.id];
      const draft = StorageHelper.getDraft(exam.id);
      const inProgress = !done && draft && draft.deadline;
      const expired = inProgress && draft.deadline <= Date.now();
      let status = "";
      let action = `<button class="btn btn-primary" onclick="startExam(${exam.id})">Vào làm bài</button>`;
      if (done) {
        status = `<span class="badge badge-green">Đã nộp · ${scoreText(done)}</span>`;
        action = `<button class="btn btn-outline" disabled>Đã nộp bài</button>`;
      } else if (expired) {
        status = `<span class="badge badge-red">Đã hết giờ, chưa nộp</span>`;
        action = `<button class="btn btn-primary" onclick="startExam(${exam.id})">Nộp bài</button>`;
      } else if (inProgress) {
        status = `<span class="badge badge-amber">Đang làm dở</span>`;
        action = `<button class="btn btn-primary" onclick="startExam(${exam.id})">Tiếp tục làm bài</button>`;
      }
      return `
        <div class="card" style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px;">
          <div>
            <h3 style="font-size: 1.05rem;">${escapeHtml(exam.title)}</h3>
            <p style="font-size: 0.85rem; margin-top: 4px; color: var(--text-muted);">Thời gian: ${exam.duration_minutes} phút ${status}</p>
          </div>
          ${action}
        </div>`;
    }).join("");
  } catch (err) {
    console.error("Lỗi khi tải danh sách đề thi:", err);
    // Co ma loi = server da tra loi (vd: chua cau hinh) -> hien dung loi; khong co = mat mang
    const reason = err.status
      ? `Máy chủ báo lỗi: ${escapeHtml(err.message)}`
      : "Không kết nối được máy chủ. Vui lòng kiểm tra kết nối mạng.";
    container.innerHTML = `
      <div class="card alert-box alert-danger">
        Không thể tải danh sách đề thi. ${reason}
      </div>
    `;
    document.getElementById("historyContainer").innerHTML = '<p class="field-hint">Không tải được lịch sử làm bài.</p>';
  }
}

// Diem hien thi: con cau giao vien cham -> ghi chu "cho cham"
function scoreText(r) {
  const pending = r.pending || 0;
  return pending ? `${fmtNum(Number(r.score))}/10 (chờ chấm ${pending} câu)` : `${fmtNum(Number(r.score))}/10`;
}

function renderHistory(results, exams) {
  const box = document.getElementById("historyContainer");
  if (results === null) {
    box.innerHTML = '<p class="field-hint">Không tải được lịch sử làm bài.</p>';
    return;
  }
  if (!results.length) {
    box.innerHTML = '<p class="field-hint">Bạn chưa nộp bài thi nào.</p>';
    return;
  }
  const titles = Object.fromEntries(exams.map(e => [e.id, e.title]));
  box.innerHTML = `
    <div class="table-responsive">
      <table>
        <thead><tr><th>Đề thi</th><th>Điểm</th><th>Thời lượng</th><th>Nộp lúc</th></tr></thead>
        <tbody>
          ${results.map(r => `
            <tr>
              <td>${escapeHtml(titles[r.exam_id] || (r.exam_id ? `Đề #${r.exam_id} (đã xoá)` : "--"))}</td>
              <td><strong>${scoreText(r)}</strong></td>
              <td>${r.duration_minutes || "--"} phút</td>
              <td>${r.submitted_at ? new Date(r.submitted_at).toLocaleString("vi-VN") : "--"}</td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

// 2. Bat dau lam bai thi (Lazy load chi tiet de thi)
async function startExam(examId) {
  if (submittedByExam[examId]) {
    alert("Bạn đã nộp bài thi này rồi. Xem kết quả ở mục Lịch sử làm bài.");
    return;
  }
  try {
    // Server tra de da bo dap an; da nop roi -> 409
    const examDetail = await StudentApi.getExam(examId, currentStudent);
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

    wrongPasswordCount = 0;

    // Khoi phuc ban nhap neu con han (mat mang / tat nguon / tai lai trang / thoat khan cap)
    const draft = StorageHelper.getDraft(examId);
    // Ban nhap da qua han (vd: thoat khan cap roi het gio) van duoc khoi phuc -> tick() tu nop ngay
    const resume = !!(draft && draft.deadline);
    userAnswers = resume ? (draft.answers || {}) : {};
    deadline = resume ? draft.deadline : Date.now() + (currentExam.duration_minutes || 45) * 60000;

    // Bo theo doi thao tac: tiep noi nhat ky cu neu khoi phuc, moi log deu luu vao ban nhap
    tracker = null;
    tracker = new ActionTracker(resume ? draft.logs : null, saveDraftNow);
    if (resume) tracker.addLog("KHOI_PHUC", `Vào lại bài làm dở dang: ${getAnsweredCount()} câu đã trả lời`);
    else tracker.addLog("CHON_DE", `Bắt đầu làm đề: ${currentExam.title}`, null, null);
    saveDraftNow();

    // Kich hoat Kiosk Mode tren Android neu co; tren web Lockdown bat toan man hinh + khoa phim
    if (window.KioskBridge && typeof window.KioskBridge.startLock === "function") {
      window.KioskBridge.startLock();
    }

    // Chuyen giao dien
    document.getElementById("viewExamList").style.display = "none";
    document.getElementById("btnLogout").style.display = "none";
    document.getElementById("viewExamPlay").style.display = "block";
    document.getElementById("headerTitle").textContent = currentExam.title;
    document.getElementById("btnSubmit").textContent = "Nộp bài thi";
    Lockdown.start(tracker);

    // Khoi dong dong ho dem nguoc
    document.getElementById("timerDisplay").style.display = "block";
    renderQuestion();
    tick();
    timerInterval = setInterval(tick, 1000);
  } catch (err) {
    alert(err.status === 409 ? err.message : "Lỗi khi tải đề thi: " + err.message);
    if (err.status === 409) loadAssignedExams();
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

  saveDraftNow();

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

// Xac nhan nop bai: chi khi da tra loi du tat ca cac cau
function confirmSubmit() {
  if (isSubmitting) return;

  flushPendingInput();
  if (remainingSeconds <= 0) return doSubmitExam(); // het gio, lan nop tu dong truoc bi loi mang

  const missing = missingCount();
  if (missing > 0) {
    updateSubmitState();
    Lockdown.dialog(() => alert(`Còn ${missing} câu chưa trả lời. Bạn cần làm đủ tất cả các câu mới được nộp bài.`));
    return;
  }

  const manual = currentQuestions.length - answerableIndexes().length;
  let msg = `Bạn đã trả lời đủ ${getAnsweredCount()} / ${answerableIndexes().length} câu.`;
  if (manual) msg += ` (${manual} câu tự luận làm trên giấy.)`;
  msg += " Sau khi nộp sẽ không sửa được bài. Bạn chắc chắn muốn nộp?";

  if (Lockdown.dialog(() => confirm(msg))) {
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

  const durationSpent = Math.max(1, Math.round(((currentExam.duration_minutes || 45) * 60 - remainingSeconds) / 60));
  tracker.addLog("NOP_BAI", `Gửi bài lên máy chủ (${getAnsweredCount()}/${answerableIndexes().length} câu đã trả lời)`, null, null);

  // Server tu cham diem theo dap an chi server biet ("Luu truoc - Khoa sau")
  let result;
  try {
    result = await StudentApi.submit({
      exam_id: currentExam.id,
      student_name: currentStudent,
      answers: userAnswers,
      duration_minutes: durationSpent,
      action_logs: tracker.getLogs()
    });
  } catch (err) {
    if (err.status === 409 && err.data && err.data.result) {
      result = err.data.result; // lan nop truoc da luu nhung mat phan hoi
    } else {
      console.error("Lỗi khi nộp bài:", err);
      isSubmitting = false;
      btnSubmit.disabled = false;
      btnSubmit.textContent = "Thử nộp lại";
      const network = !err.status || err.status >= 500;
      Lockdown.dialog(() => alert(network
        ? "Không thể nộp bài do lỗi kết nối. Vui lòng kiểm tra Wifi/4G và bấm Thử nộp lại. Bài làm của bạn vẫn được giữ nguyên!"
        : "Không nộp được bài: " + err.message));
      return;
    }
  }

  // Luu thanh cong -> Xoa ban nhap -> Ngung theo doi -> Man hinh ket qua (thiet bi van o che do Kiosk)
  StorageHelper.clearDraft(currentExam.id);
  tracker.stop();
  Lockdown.stop();
  document.getElementById("timerDisplay").style.display = "none";

  const minutes = result.duration_minutes || durationSpent;
  if (result.pending) {
    // Con cau tu luan cho cham: chi bao diem phan tu dong
    document.getElementById("finalScore").textContent = `${fmtNum(result.earned)} / ${fmtNum(result.autoMax)}`;
    document.getElementById("finalSummary").textContent = `Điểm phần chấm tự động. ${result.pending} câu tự luận (${fmtNum(result.total - result.autoMax)} điểm) chờ giáo viên chấm. Thời gian: ${minutes} phút.`;
  } else {
    document.getElementById("finalScore").textContent = fmtNum(result.score);
    document.getElementById("finalSummary").textContent = `Đạt ${fmtNum(result.earned)} / ${fmtNum(result.total)} điểm câu (Thời gian: ${minutes} phút)`;
  }
  document.getElementById("viewExamPlay").style.display = "none";
  document.getElementById("viewLockScreen").style.display = "flex";
}

// 3. Sau khi nop: xem lich su (khong can mat khau, thiet bi van khoa Kiosk)
function backToList() {
  currentExam = null;
  document.getElementById("viewLockScreen").style.display = "none";
  document.getElementById("viewExamPlay").style.display = "none";
  document.getElementById("viewExamList").style.display = "block";
  document.getElementById("btnLogout").style.display = "";
  document.getElementById("headerTitle").textContent = "Safe Exam";
  loadAssignedExams();
  document.getElementById("historySection").scrollIntoView({ behavior: "smooth" });
}

// 4. Thoat can mat khau giam thi, moi lan thoat deu gui log len admin (bang exam_events)
//    mode "emergency": thoat khan cap khi dang lam bai (giu ban nhap de vao lam tiep)
//    mode "exit": thoat ung dung sau khi da nop bai
function showExitDialog(mode) {
  exitMode = mode;
  const emergency = mode === "emergency";
  document.getElementById("exitTitle").textContent = emergency ? "Thoát khẩn cấp" : "Thoát ứng dụng";
  document.getElementById("exitText").textContent = emergency
    ? "Chỉ giám thị được thực hiện. Bài làm được giữ lại, thời gian vẫn tiếp tục chạy. Thao tác được ghi vào nhật ký gửi về quản trị viên."
    : "Nhập mật khẩu giám thị để thoát ứng dụng. Thao tác được ghi vào nhật ký gửi về quản trị viên.";
  document.getElementById("exitReasonGroup").style.display = emergency ? "block" : "none";
  document.getElementById("exitReason").value = "";
  document.getElementById("proctorInput").value = "";
  document.getElementById("unlockError").style.display = "none";
  document.getElementById("viewUnlockModal").style.display = "flex";
  if (emergency && tracker && tracker.active) tracker.addLog("YEU_CAU_THOAT", "Mở hộp thoại thoát khẩn cấp");
  document.getElementById("proctorInput").focus();
}

function hideUnlockDialog() {
  document.getElementById("viewUnlockModal").style.display = "none";
  if (exitMode === "emergency" && tracker && tracker.active) tracker.addLog("HUY_THOAT", "Huỷ yêu cầu thoát khẩn cấp");
  exitMode = null;
}

async function verifyUnlock() {
  const password = document.getElementById("proctorInput").value.trim();
  if (!password) return;
  const emergency = exitMode === "emergency" && currentExam;
  const btn = document.getElementById("btnConfirmExit");
  const errBox = document.getElementById("unlockError");
  btn.disabled = true;
  btn.textContent = "Đang xác thực...";
  errBox.style.display = "none";

  const wrongNote = wrongPasswordCount ? ` Sai mật khẩu ${wrongPasswordCount} lần trước đó.` : "";
  let detail = `Giám thị mở khoá, thí sinh thoát ứng dụng sau khi nộp bài.${wrongNote}`;
  if (emergency) {
    flushPendingInput();
    const reason = document.getElementById("exitReason").value.trim() || "không ghi lý do";
    const mins = Math.floor(remainingSeconds / 60), secs = remainingSeconds % 60;
    detail = `Giám thị cho thoát khẩn cấp. Lý do: ${reason}. Đã trả lời ${getAnsweredCount()}/${answerableIndexes().length} câu, còn ${mins} phút ${secs} giây.${wrongNote}`;
  }

  try {
    // Mat khau chi server biet; dung -> server ghi su co vao exam_events
    await StudentApi.proctorExit({
      password,
      type: emergency ? "THOAT_KHAN_CAP" : "THOAT_UNG_DUNG",
      student_name: currentStudent,
      exam_id: emergency ? currentExam.id : null,
      exam_title: emergency ? currentExam.title : null,
      detail,
      action_logs: emergency ? [...tracker.getLogs(), { time: new Date().toLocaleTimeString("vi-VN"), timestamp: new Date().toISOString(), type: "THOAT_KHAN_CAP", detail }] : []
    });
  } catch (err) {
    btn.disabled = false;
    btn.textContent = "Xác nhận thoát";
    document.getElementById("proctorInput").value = "";
    if (err.status === 401 || err.status === 429) {
      wrongPasswordCount++;
      if (tracker && tracker.active) tracker.addLog("SAI_MAT_KHAU", `Nhập sai mật khẩu giám thị khi ${emergency ? "thoát khẩn cấp" : "thoát ứng dụng"} (lần ${wrongPasswordCount})`);
      errBox.textContent = err.message;
    } else {
      errBox.textContent = "Không kết nối được máy chủ để xác thực giám thị. Kiểm tra mạng rồi thử lại.";
    }
    errBox.style.display = "block";
    return;
  }

  if (emergency) {
    if (timerInterval) clearInterval(timerInterval);
    tracker.addLog("THOAT_KHAN_CAP", detail);
    saveDraftNow(); // giu bai lam + nhat ky de vao lam tiep
    tracker.stop();
  }
  Lockdown.stop();
  if (window.KioskBridge && typeof window.KioskBridge.stopLock === "function") {
    window.KioskBridge.stopLock();
  } else {
    Lockdown.exitFullscreen();
  }
  window.location.href = "index.html";
}
