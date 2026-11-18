// Dieu phoi UI admin. Logic dang cau + cau truc de nam o question-types.js.
let parsedQuestions = [];   // Cau hoi phang (co part, points), chi giu trong bo nho
let allResultsData = [];
let templates = clone(DEFAULT_TEMPLATES);
let editingTplId = null;    // mau dang sua o trang cau truc
let editing = null;         // { index | null, part } cau dang sua trong modal
let modalImage = "";        // anh (data URL / link) cua cau dang sua
let detailIndex = null;     // ket qua dang xem
let detailExam = null;      // de thi cua ket qua dang xem (de hien noi dung cau tu luan)

function clone(v) { return JSON.parse(JSON.stringify(v)); }

window.addEventListener("DOMContentLoaded", async () => {
  if (sessionStorage.getItem("safe_exam_admin_auth") !== "true") {
    alert("Vui lòng đăng nhập tài khoản quản trị!");
    window.location.href = "index.html";
    return;
  }
  await loadTemplates();
  loadExistingExams();
  loadResults();

  // Dan anh truc tiep (Ctrl+V) khi dang mo modal cau hoi
  document.addEventListener("paste", e => {
    if (document.getElementById("questionModal").style.display !== "flex") return;
    const file = [...(e.clipboardData?.files || [])].find(f => f.type.startsWith("image/"));
    if (file) { e.preventDefault(); onImagePicked(file); }
  });
});

function logoutAdmin() {
  sessionStorage.removeItem("safe_exam_admin_auth");
  window.location.href = "index.html";
}

function showPage(pageId) {
  document.querySelectorAll(".page").forEach(p => { p.hidden = p.id !== pageId; });
  document.querySelectorAll(".sidebar-item").forEach(b => b.classList.toggle("active", b.dataset.page === pageId));
  if (pageId === "pageCreate") loadExistingExams();
  if (pageId === "pageStructure") renderStructurePage();
  if (pageId === "pageResults") loadResults();
}

function showErrorList(boxId, title, errors) {
  const box = document.getElementById(boxId);
  box.innerHTML = (title ? `<strong>${escapeHtml(title)}</strong><br>` : "") + errors.map(e => `- ${escapeHtml(e)}`).join("<br>");
  box.style.display = errors.length ? "block" : "none";
}

// =================================================== MAU CAU TRUC DE
async function loadTemplates() {
  const saved = await SettingsService.get("exam_templates");
  const valid = Array.isArray(saved)
    ? saved.filter(t => t && t.id && Array.isArray(t.parts) && t.parts.length && t.parts.every(p => QUESTION_TYPES[p.type]))
    : [];
  if (valid.length) templates = valid;
  renderTemplateSelect();
}

function currentTemplate() {
  const id = document.getElementById("examTemplate").value;
  return templates.find(t => t.id === id) || templates[0];
}

function templateChips(t) {
  return t.parts.map((p, i) => `<span class="chip">${ROMAN[i]}. ${escapeHtml(QUESTION_TYPES[p.type].label)}: ${p.count || "tuỳ ý"} câu × ${fmtNum(p.points)}đ</span>`).join("");
}

function renderTemplateSelect() {
  const select = document.getElementById("examTemplate");
  const keep = select.value;
  select.innerHTML = templates.map(t => `<option value="${escapeHtml(t.id)}">${escapeHtml(t.name)}</option>`).join("");
  if (templates.some(t => t.id === keep)) select.value = keep;
  document.getElementById("templateSummary").innerHTML = templateChips(currentTemplate());
}

function onTemplateChange() {
  document.getElementById("templateSummary").innerHTML = templateChips(currentTemplate());
  if (parsedQuestions.length) {
    parsedQuestions = normalizeExam(parsedQuestions.map(q => ({ ...q, part: undefined })), currentTemplate()).questions;
    renderPreview();
  }
}

// ---- Trang "Dinh dang cau truc de"
function renderStructurePage() {
  document.getElementById("structureLocalNote").style.display = SettingsService.isLocal ? "block" : "none";
  if (!templates.some(t => t.id === editingTplId)) editingTplId = templates[0]?.id;

  document.getElementById("templateTabs").innerHTML = templates.map(t => `
    <button class="chip chip-btn ${t.id === editingTplId ? "active" : ""}" onclick="selectTemplate('${escapeHtml(t.id)}')">${escapeHtml(t.name)}</button>`).join("")
    + '<button class="chip chip-btn" onclick="newTemplate()">+ Tạo mẫu mới</button>';

  const t = templates.find(x => x.id === editingTplId);
  document.getElementById("tplName").value = t.name;
  renderTemplateParts(clone(t.parts));

  document.getElementById("typeCards").innerHTML = Object.entries(QUESTION_TYPES).map(([id, type]) => `
    <div class="type-card">
      <div class="type-card-head"><div><strong>${escapeHtml(type.label)}</strong> <code>${id}</code></div></div>
      <p class="type-card-desc">${escapeHtml(type.description)}</p>
      <div class="type-card-example">
        <div style="margin-bottom: 6px;">${renderMath(type.example.question)}</div>
        ${type.renderPreview(type.example)}
      </div>
    </div>`).join("");
}

function renderTemplateParts(parts) {
  const opts = id => Object.entries(QUESTION_TYPES).map(([k, t]) => `<option value="${k}" ${k === id ? "selected" : ""}>${escapeHtml(t.label)}</option>`).join("");
  document.getElementById("tplParts").innerHTML = parts.map((p, i) => `
    <tr>
      <td><strong>${ROMAN[i]}</strong></td>
      <td><select class="form-control tp-type">${opts(p.type)}</select></td>
      <td><input type="number" class="form-control tp-count" min="0" step="1" value="${p.count}" oninput="updateTemplateTotal()"></td>
      <td><input type="number" class="form-control tp-points" min="0" step="0.05" value="${p.points}" oninput="updateTemplateTotal()"></td>
      <td class="tp-sum"></td>
      <td class="nowrap">
        <button class="btn btn-outline btn-sm" title="Lên" onclick="moveTemplatePart(${i}, -1)" ${i === 0 ? "disabled" : ""}>↑</button>
        <button class="btn btn-outline btn-sm" title="Xuống" onclick="moveTemplatePart(${i}, 1)" ${i === parts.length - 1 ? "disabled" : ""}>↓</button>
        <button class="btn btn-outline btn-sm btn-danger-outline" title="Xoá phần" onclick="removeTemplatePart(${i})">✕</button>
      </td>
    </tr>`).join("");
  updateTemplateTotal();
}

function readTemplateParts() {
  return [...document.querySelectorAll("#tplParts tr")].map(tr => ({
    type: tr.querySelector(".tp-type").value,
    count: Math.max(0, parseInt(tr.querySelector(".tp-count").value, 10) || 0),
    points: Math.max(0, Number(tr.querySelector(".tp-points").value) || 0)
  }));
}

function updateTemplateTotal() {
  const parts = readTemplateParts();
  document.querySelectorAll("#tplParts .tp-sum").forEach((td, i) => {
    td.textContent = parts[i].count ? fmtNum(parts[i].count * parts[i].points) + "đ" : "—";
  });
  const { fixed, total } = templateTotal({ parts });
  document.getElementById("tplTotal").textContent = fixed
    ? `Tổng: ${fmtNum(total)} điểm${Math.abs(total - 10) > 1e-9 ? " (sẽ quy về thang 10)" : ""}`
    : "Có phần tuỳ ý số câu: điểm quy về thang 10";
}

function addTemplatePart() {
  const parts = readTemplateParts();
  parts.push({ type: "single", count: 0, points: 0.25 });
  renderTemplateParts(parts);
}

function moveTemplatePart(i, d) {
  const parts = readTemplateParts();
  [parts[i], parts[i + d]] = [parts[i + d], parts[i]];
  renderTemplateParts(parts);
}

function removeTemplatePart(i) {
  const parts = readTemplateParts();
  parts.splice(i, 1);
  renderTemplateParts(parts);
}

function selectTemplate(id) {
  editingTplId = id;
  renderStructurePage();
}

function newTemplate() {
  const t = { id: "tpl" + Date.now(), name: "Mẫu mới", parts: [{ type: "single", count: 0, points: 0.25 }] };
  templates.push(t);
  editingTplId = t.id;
  renderStructurePage();
  document.getElementById("tplName").select();
}

async function persistTemplates() {
  await SettingsService.set("exam_templates", templates);
  renderTemplateSelect();
  renderStructurePage();
  if (parsedQuestions.length) onTemplateChange();
}

async function saveTemplate() {
  const name = document.getElementById("tplName").value.trim();
  const parts = readTemplateParts();
  if (!name) return alert("Vui lòng nhập tên mẫu.");
  if (!parts.length) return alert("Mẫu cần ít nhất 1 phần.");
  if (parts.length > ROMAN.length) return alert(`Tối đa ${ROMAN.length} phần.`);
  Object.assign(templates.find(t => t.id === editingTplId), { name, parts });
  await persistTemplates();
  showToast("Đã lưu mẫu cấu trúc.");
}

async function deleteTemplate() {
  if (templates.length === 1) return alert("Phải còn ít nhất 1 mẫu cấu trúc.");
  const t = templates.find(x => x.id === editingTplId);
  if (!confirm(`Xoá mẫu "${t.name}"?`)) return;
  templates = templates.filter(x => x.id !== editingTplId);
  editingTplId = templates[0].id;
  await persistTemplates();
}

function showToast(msg) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1800);
}

// =================================================== QUY TAC + NHAP JSON
function openRulesModal() {
  document.getElementById("rulesText").textContent = buildRulesText(currentTemplate());
  openModal("rulesModal");
}

function openJsonModal() {
  document.getElementById("jsonInputArea").value = "";
  document.getElementById("jsonModalError").style.display = "none";
  document.getElementById("jsonImportModeRow").style.display = parsedQuestions.length ? "flex" : "none";
  openModal("jsonModal");
  document.getElementById("jsonInputArea").focus();
}

function submitJsonModal() {
  const raw = document.getElementById("jsonInputArea").value.trim();
  if (!raw) return showErrorList("jsonModalError", "", ["Vui lòng dán nội dung JSON."]);

  let data;
  try {
    data = JSON.parse(fixJsonBackslashes(raw));
  } catch (e) {
    return showErrorList("jsonModalError", "JSON không hợp lệ:", [e.message + " (kiểm tra dấu ngoặc, dấu phẩy, dấu nháy)"]);
  }

  const tpl = currentTemplate();
  const result = normalizeExam(data, tpl);
  // Chi chan nhung loi theo tung cau / sai cau truc phan; thieu so cau thi cho nhap roi bo sung bang nut +
  const blocking = result.errors.filter(e => !/: cần \d+ câu, hiện có \d+\.$/.test(e));
  if (blocking.length || !result.questions.length) {
    return showErrorList("jsonModalError", "Lỗi định dạng:", blocking.length ? blocking : result.errors);
  }

  if (result.title) document.getElementById("examTitle").value = result.title;
  if (result.duration_minutes >= 1) document.getElementById("examDuration").value = result.duration_minutes;

  const append = document.querySelector('input[name="jsonImportMode"]:checked')?.value === "append" && parsedQuestions.length;
  parsedQuestions = append ? normalizeExam(parsedQuestions.concat(result.questions), tpl).questions : result.questions;
  showUploadStatus(`Đã nhập ${result.questions.length} câu hỏi.`);

  closeModal("jsonModal");
  renderPreview();
}

function showUploadStatus(msg) {
  const el = document.getElementById("uploadStatus");
  el.textContent = msg;
  el.style.display = msg ? "block" : "none";
}

// =================================================== THEM / SUA CAU
function openQuestionModal(index, part) {
  const tpl = currentTemplate();
  const q = index !== null ? parsedQuestions[index] : null;
  part = q ? q.part : part;
  const typeId = q ? q.type : tpl.parts[part].type;
  editing = { index, part, typeId };

  const label = q ? questionLabel(parsedQuestions, index).text : `${partLabel(part)} · Câu mới`;
  document.getElementById("questionModalTitle").textContent = `${q ? "Sửa" : "Thêm"} ${label} — ${QUESTION_TYPES[typeId].label}`;
  document.getElementById("modalQText").value = q ? q.question : "";
  document.getElementById("modalQPoints").value = q ? maxPoints(q) : tpl.parts[part]?.points ?? 1;
  document.getElementById("modalTypeEditor").innerHTML = QUESTION_TYPES[typeId].renderEditor(q);
  document.getElementById("modalQError").style.display = "none";
  setModalImage(q?.image || "");
  updateModalMathPreview();
  openModal("questionModal");
  document.getElementById("modalQText").focus();
}

function updateModalMathPreview() {
  const text = document.getElementById("modalQText").value.trim();
  document.getElementById("modalQMathPreview").innerHTML = text ? renderMath(text) : "Xem trước công thức sẽ hiện ở đây...";
}

function setModalImage(src) {
  modalImage = src;
  document.getElementById("modalQImage").src = src || "";
  document.getElementById("modalQImageBox").style.display = src ? "flex" : "none";
}

async function onImagePicked(file) {
  if (!file) return;
  try {
    setModalImage(await compressImage(file));
  } catch (err) {
    alert(err.message);
  }
}

function saveQuestionModal() {
  const { index, part, typeId } = editing;
  const raw = {
    type: typeId,
    part,
    question: document.getElementById("modalQText").value,
    points: document.getElementById("modalQPoints").value,
    image: modalImage,
    ...QUESTION_TYPES[typeId].readEditor(document.getElementById("modalTypeEditor"))
  };
  const { q, errors } = normalizeOne(raw);
  if (errors.length) return showErrorList("modalQError", "", errors);
  q.part = part;

  const list = parsedQuestions.slice();
  if (index !== null) list[index] = q;
  else list.push(q);
  parsedQuestions = normalizeExam(list, currentTemplate()).questions; // sap lai theo phan

  closeModal("questionModal");
  renderPreview();
}

function deleteQuestion(index) {
  if (!confirm(`Xoá ${questionLabel(parsedQuestions, index).text}?`)) return;
  parsedQuestions.splice(index, 1);
  if (!parsedQuestions.length) return resetImport();
  renderPreview();
}

function cancelImport() {
  if (confirm(`Huỷ toàn bộ ${parsedQuestions.length} câu hỏi đang nhập?`)) resetImport();
}

function resetImport() {
  parsedQuestions = [];
  document.getElementById("examTitle").value = "";
  document.getElementById("examDuration").value = "45";
  showUploadStatus("");
  renderPreview();
}

// =================================================== XEM TRUOC THEO PHAN
function renderPreview() {
  const section = document.getElementById("previewSection");
  section.style.display = parsedQuestions.length ? "block" : "none";
  if (!parsedQuestions.length) return;

  const tpl = currentTemplate();
  const result = normalizeExam(parsedQuestions, tpl);
  document.getElementById("previewCount").textContent = parsedQuestions.length;
  document.getElementById("previewPoints").textContent = fmtNum(parsedQuestions.reduce((s, q) => s + maxPoints(q), 0));

  // Loi cau truc (khong gan voi cau cu the) hien o dau
  showErrorList("previewErrors", "Chưa đúng cấu trúc đề:", result.errors.filter(e => /^PHẦN [IVX]+ \(|^Mẫu|^Đề thi/.test(e)));

  const groups = groupByPart(parsedQuestions);
  document.getElementById("previewList").innerHTML = tpl.parts.map((p, pi) => {
    const t = QUESTION_TYPES[p.type];
    const items = groups.find(g => g.part === pi)?.items || [];
    return `
      <div class="part-block">
        <div class="part-head">
          <strong>${partLabel(pi)}.</strong> ${escapeHtml(t.intro(items.length))}
          <span class="chip">${escapeHtml(t.label)} · ${items.length}${p.count ? "/" + p.count : ""} câu</span>
        </div>
        ${items.map(({ q, index, num }) => {
          const qErr = result.qErrors[index] || [];
          return `
          <div class="pv-card ${qErr.length ? "pv-invalid" : ""}">
            <div class="pv-head">
              <div><strong class="pv-num">Câu ${num}.</strong> <span class="badge badge-muted">${fmtNum(maxPoints(q))}đ</span></div>
              <div class="q-actions">
                <button class="btn btn-outline" onclick="openQuestionModal(${index})">✎ Sửa</button>
                <button class="btn btn-outline btn-danger-outline" onclick="deleteQuestion(${index})">🗑 Xoá</button>
              </div>
            </div>
            <div class="pv-question">${renderMath(q.question)}</div>
            ${q.image ? `<img class="q-image" src="${escapeHtml(q.image)}" alt="Hình vẽ">` : ""}
            ${t.renderPreview(q)}
            ${qErr.map(e => `<div class="field-error">${escapeHtml(e)}</div>`).join("")}
          </div>`;
        }).join("")}
        <button type="button" class="btn-icon-add" title="Thêm câu vào ${partLabel(pi)}" onclick="openQuestionModal(null, ${pi})">+</button>
      </div>`;
  }).join("");

  const mathErrors = document.querySelectorAll("#previewList .katex-error").length;
  const btn = document.getElementById("btnSaveExam");
  btn.disabled = result.errors.length > 0;
  btn.textContent = result.errors.length
    ? `Còn ${result.errors.length} lỗi, chưa thể xuất bản`
    : mathErrors ? `Xuất bản (cảnh báo: ${mathErrors} công thức lỗi hiển thị)` : "Xuất bản đề thi lên hệ thống";
}

// =================================================== XUAT BAN
async function saveExam() {
  const title = document.getElementById("examTitle").value.trim();
  const duration = parseInt(document.getElementById("examDuration").value, 10);

  if (!title) { alert("Vui lòng nhập tiêu đề đề thi!"); return document.getElementById("examTitle").focus(); }
  if (!(duration >= 1)) { alert("Thời gian làm bài phải từ 1 phút trở lên!"); return document.getElementById("examDuration").focus(); }
  if (normalizeExam(parsedQuestions, currentTemplate()).errors.length) return alert("Đề chưa đúng cấu trúc, hãy sửa các lỗi trước khi xuất bản.");

  const btn = document.getElementById("btnSaveExam");
  btn.disabled = true;
  btn.textContent = "Đang lưu đề thi...";
  try {
    await ExamService.createExam(title, duration, parsedQuestions);
    alert("Đã xuất bản đề thi! Tất cả thí sinh có thể vào làm.");
    resetImport();
    loadExistingExams();
  } catch (err) {
    alert("Lỗi khi lưu đề thi: " + err.message);
    renderPreview();
  }
}

async function loadExistingExams() {
  const tbody = document.getElementById("examTableBody");
  try {
    const exams = await ExamService.getAllExams();
    tbody.innerHTML = exams && exams.length
      ? exams.map(ex => `
        <tr>
          <td>#${ex.id}</td>
          <td><strong>${escapeHtml(ex.title)}</strong></td>
          <td>${ex.duration_minutes} phút</td>
          <td>${ex.created_at ? new Date(ex.created_at).toLocaleDateString("vi-VN") : "--"}</td>
          <td><button class="btn btn-outline btn-sm btn-danger-outline" onclick="deleteExam(${ex.id})">Xoá</button></td>
        </tr>`).join("")
      : '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Chưa có đề thi nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Lỗi tải danh sách đề thi.</td></tr>';
  }
}

async function deleteExam(examId) {
  if (!confirm(`Xoá vĩnh viễn đề thi #${examId}?`)) return;
  try {
    await ExamService.deleteExam(examId);
    loadExistingExams();
    loadResults();
  } catch (err) {
    alert("Lỗi khi xoá đề thi: " + err.message);
  }
}

// =================================================== KET QUA + CHAM TU LUAN
async function loadResults() {
  const tbody = document.getElementById("resultsTableBody");
  try {
    allResultsData = await ResultService.getAllResults() || [];
    tbody.innerHTML = allResultsData.length
      ? allResultsData.map((res, i) => {
        const pending = (res.answers || []).filter(e => e.pending).length;
        return `
        <tr>
          <td>#${res.id}</td>
          <td><strong>${escapeHtml(res.student_name)}</strong></td>
          <td><span class="badge badge-blue">${fmtNum(Number(res.score))} / 10</span></td>
          <td>${pending ? `<span class="badge badge-amber">Chờ chấm ${pending} câu</span>` : '<span class="badge badge-green">Đã chấm</span>'}</td>
          <td>${res.duration_minutes || "--"} phút</td>
          <td>${res.submitted_at ? new Date(res.submitted_at).toLocaleString("vi-VN") : "--"}</td>
          <td><button class="btn btn-outline btn-sm" onclick="viewResultDetail(${i})">${pending ? "Chấm bài" : "Xem"}</button></td>
        </tr>`;
      }).join("")
      : '<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">Chưa có bài thi nào được nộp.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--danger);">Lỗi tải kết quả thi.</td></tr>';
  }
}

async function viewResultDetail(index) {
  const item = allResultsData[index];
  if (!item) return;
  detailIndex = index;
  detailExam = null;
  document.getElementById("modalTitle").textContent = `${item.student_name} — ${fmtNum(Number(item.score))}/10`;
  renderResultAnswers();
  openModal("detailModal");

  document.getElementById("modalLogsList").innerHTML = Array.isArray(item.action_logs) && item.action_logs.length
    ? item.action_logs.map(log => `
      <div class="log-row">
        <span style="color: var(--text-muted);">[${escapeHtml(log.time || "--")}]</span>
        <strong style="color: var(--primary);">${escapeHtml(log.type)}:</strong>
        <span>${escapeHtml(log.detail)}</span>
      </div>`).join("")
    : '<p style="color: var(--text-muted);">Không có nhật ký thao tác.</p>';

  // Tai de de hien noi dung + loi giai cau tu luan cho giao vien
  if ((item.answers || []).some(e => QUESTION_TYPES[e.type]?.manual) && item.exam_id) {
    try {
      detailExam = await ExamService.getExamDetail(item.exam_id);
      if (detailIndex === index) renderResultAnswers();
    } catch (e) { /* van cham duoc, chi thieu noi dung cau */ }
  }
}

function renderResultAnswers() {
  const item = allResultsData[detailIndex];
  const entries = Array.isArray(item.answers) ? item.answers : [];
  const qs = detailExam?.questions || entries.map(e => ({ part: e.part ?? 0, type: e.type }));
  let manualCount = 0;

  document.getElementById("modalAnswersList").innerHTML = entries.length ? entries.map((e, i) => {
    const r = formatResultEntry(e);
    const label = questionLabel(qs, i).text;
    if (r.manual) {
      manualCount++;
      const q = detailExam?.questions?.[i];
      return `<div class="result-row result-manual">
        <div style="flex: 1;">
          <strong>${label}</strong> <small>(${escapeHtml(r.label)})</small>
          ${q ? `<div class="pv-question" style="margin-top: 4px;">${renderMath(q.question)}</div>` : ""}
          ${q?.solution ? `<div class="pv-row pv-correct">Lời giải: ${renderMath(q.solution)}</div>` : ""}
        </div>
        <label class="grade-input">
          <input type="number" class="form-control" data-entry="${i}" min="0" max="${r.max}" step="0.05" value="${r.pending ? "" : r.points ?? ""}" placeholder="?">
          / ${fmtNum(r.max)}đ
        </label>
      </div>`;
    }
    const color = r.points >= r.max ? "var(--success)" : r.points > 0 ? "#b45309" : "var(--danger)";
    return `<div class="result-row">
      <span><strong>${label}</strong> <small>(${escapeHtml(r.label)})</small>: ${r.text}</span>
      <strong style="color: ${color};">${fmtNum(r.points)}/${fmtNum(r.max)}đ</strong>
    </div>`;
  }).join("") : '<p style="color: var(--text-muted);">Không có dữ liệu câu trả lời.</p>';

  document.getElementById("gradeBar").style.display = manualCount ? "flex" : "none";
}

async function saveManualGrades() {
  const item = allResultsData[detailIndex];
  const entries = clone(item.answers);
  for (const input of document.querySelectorAll("#modalAnswersList [data-entry]")) {
    const e = entries[input.dataset.entry];
    if (input.value === "") continue; // chua cham cau nay
    const v = Number(input.value);
    if (!(v >= 0 && v <= e.max)) return alert(`Điểm phải từ 0 đến ${fmtNum(e.max)}.`);
    e.points = v;
    e.pending = false;
  }
  const { score } = summarizeEntries(entries);
  try {
    const updated = await ResultService.updateResult(item.id, { answers: entries, score });
    allResultsData[detailIndex] = { ...item, ...updated };
    document.getElementById("modalTitle").textContent = `${item.student_name} — ${fmtNum(score)}/10`;
    renderResultAnswers();
    showToast("Đã lưu điểm tự luận.");
    loadResults();
  } catch (err) {
    alert("Không lưu được điểm: " + err.message);
  }
}
