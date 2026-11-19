// Dieu phoi UI admin. Logic dang cau + cau truc de nam o question-types.js.
let parsedQuestions = [];   // Cau hoi phang (co part, points), chi giu trong bo nho
let allResultsData = [];
let templates = clone(DEFAULT_TEMPLATES);
let editingTplId = null;    // mau dang sua o trang cau truc
let editing = null;         // { index | null, part } cau dang sua trong modal
let editingExamId = null;   // de da xuat ban dang duoc sua (null = tao de moi)
let customRules = {};       // { [templateId]: quy tac dinh dang da chinh sua }
let rulesTplId = null;      // mau dang mo trong modal quy tac
let detailIndex = null;    // ket qua dang xem
let detailExam = null;      // de thi cua ket qua dang xem (de hien noi dung cau tu luan)
let allEvents = [];         // su co phong thi (bang exam_events)

function clone(v) { return JSON.parse(JSON.stringify(v)); }

window.addEventListener("DOMContentLoaded", async () => {
  if (!sessionStorage.getItem(ADMIN_TOKEN_KEY)) {
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
  sessionStorage.removeItem(ADMIN_TOKEN_KEY);
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
  const rules = await SettingsService.get("format_rules");
  customRules = rules && typeof rules === "object" && !Array.isArray(rules) ? rules : {};
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
  if (customRules[editingTplId] !== undefined) {
    delete customRules[editingTplId];
    await SettingsService.set("format_rules", customRules);
  }
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
// Quy tac co the chinh sua & luu rieng cho tung mau (app_settings key "format_rules").
// Day chi la van ban huong dan de sao chep; viec kiem tra JSON khi nhap van theo mau cau truc.
function openRulesModal(tplId) {
  const tpl = templates.find(t => t.id === tplId) || currentTemplate();
  rulesTplId = tpl.id;
  document.getElementById("rulesModalTitle").textContent = `Quy tắc định dạng — ${tpl.name}`;
  document.getElementById("rulesText").value = customRules[tpl.id] ?? buildRulesText(tpl);
  renderRulesStatus();
  openModal("rulesModal");
}

function renderRulesStatus() {
  const custom = customRules[rulesTplId] !== undefined;
  const dirty = document.getElementById("rulesText").value !== (customRules[rulesTplId] ?? buildRulesText(templates.find(t => t.id === rulesTplId)));
  document.getElementById("rulesStatus").textContent = (custom
    ? "Đang dùng quy tắc đã chỉnh sửa. Nếu đổi số phần / số câu của mẫu, hãy cập nhật lại quy tắc hoặc bấm Khôi phục mặc định."
    : "Quy tắc mặc định, tự sinh từ mẫu cấu trúc. Có thể sửa trực tiếp rồi bấm Lưu quy tắc.")
    + (dirty ? " (Có thay đổi chưa lưu)" : "");
  document.getElementById("btnSaveRules").disabled = !dirty;
  document.getElementById("btnResetRules").disabled = !custom && !dirty;
}

function onRulesInput() { renderRulesStatus(); }

async function saveRules() {
  const text = document.getElementById("rulesText").value;
  const tpl = templates.find(t => t.id === rulesTplId);
  if (!text.trim() || text === buildRulesText(tpl)) delete customRules[rulesTplId];
  else customRules[rulesTplId] = text;
  await SettingsService.set("format_rules", customRules);
  if (customRules[rulesTplId] === undefined) document.getElementById("rulesText").value = buildRulesText(tpl);
  renderRulesStatus();
  showToast("Đã lưu quy tắc định dạng.");
}

async function resetRules() {
  if (!confirm("Khôi phục quy tắc mặc định (tự sinh từ mẫu cấu trúc)? Nội dung đã chỉnh sửa sẽ mất.")) return;
  delete customRules[rulesTplId];
  await SettingsService.set("format_rules", customRules);
  document.getElementById("rulesText").value = buildRulesText(templates.find(t => t.id === rulesTplId));
  renderRulesStatus();
}

function openJsonModal() {
  document.getElementById("jsonInputArea").value = "";
  document.getElementById("jsonModalError").style.display = "none";
  document.getElementById("jsonImportModeRow").style.display = parsedQuestions.length ? "flex" : "none";
  openModal("jsonModal");
  document.getElementById("jsonInputArea").focus();
}

// Thu tu dang cau cua cac phan trong JSON. Co "parts" -> lay theo phan;
// mang cau phang -> theo thu tu xuat hien dau tien cua moi dang.
function jsonPartTypes(data) {
  if (Array.isArray(data?.parts)) {
    return data.parts.map(p => typeIdOf({ type: p?.type || p?.questions?.[0]?.type }));
  }
  const list = Array.isArray(data) ? data : data?.questions;
  return Array.isArray(list) ? [...new Set(list.map(typeIdOf))] : [];
}

// Diem pho bien nhat cua cac cau trong 1 phan (mac dinh 1)
function commonPoints(questions) {
  const counts = {};
  (questions || []).forEach(q => {
    const p = Number(String(q?.points ?? "").replace(",", "."));
    if (q?.points !== undefined && q?.points !== "" && p >= 0) counts[p] = (counts[p] || 0) + 1;
  });
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best ? Number(best[0]) : 1;
}

// Tu nhan dien mau cau truc cho JSON: uu tien mau dang chon, roi mau cung thu tu dang
// va khong loi. Khong co mau nao khop -> de xuat mau moi tu chinh JSON (giao vien sua trong modal).
function detectTemplate(data) {
  const types = jsonPartTypes(data);
  if (!types.length) return { tpl: currentTemplate(), created: false };
  const unknown = types.find(t => !QUESTION_TYPES[t]);
  if (unknown) return { error: `Dạng câu "${unknown}" không tồn tại.` };
  if (types.length > ROMAN.length) return { error: `Tối đa ${ROMAN.length} phần.` };

  // Uu tien: khop hoan toan > chi thieu/du so cau (van cho nhap, bo sung sau) > tao moi
  const sameTypes = t => t.parts.length === types.length && t.parts.every((p, i) => p.type === types[i]);
  const errorsOf = t => normalizeExam(data, t).errors;
  const onlyCountErrors = t => errorsOf(t).every(e => /: cần \d+ câu, hiện có \d+\.$/.test(e));
  const current = currentTemplate();
  const candidates = [current, ...templates.filter(t => t !== current)].filter(sameTypes);
  const match = candidates.find(t => !errorsOf(t).length) || candidates.find(onlyCountErrors);
  if (match) return { tpl: match, created: false };

  const lists = Array.isArray(data?.parts)
    ? data.parts.map(p => p?.questions)
    : types.map(t => (Array.isArray(data) ? data : data.questions).filter(q => typeIdOf(q) === t));
  const tpl = {
    id: "tpl" + Date.now(),
    name: types.map(t => QUESTION_TYPES[t].label).join(" + "),
    parts: types.map((type, i) => ({ type, count: 0, points: commonPoints(lists[i]) }))
  };
  const counts = lists.map(l => (Array.isArray(l) ? l.length : 0));
  return { tpl, created: true, counts };
}

async function submitJsonModal() {
  const raw = document.getElementById("jsonInputArea").value.trim();
  if (!raw) return showErrorList("jsonModalError", "", ["Vui lòng dán nội dung JSON."]);

  let data;
  try {
    data = JSON.parse(fixJsonBackslashes(raw));
  } catch (e) {
    return showErrorList("jsonModalError", "JSON không hợp lệ:", [e.message + " (kiểm tra dấu ngoặc, dấu phẩy, dấu nháy)"]);
  }

  // Noi them: giu cau truc dang chon. Nhap moi: tu nhan dien cau truc tu JSON.
  const appendMode = document.querySelector('input[name="jsonImportMode"]:checked')?.value === "append" && parsedQuestions.length;
  const detected = appendMode ? { tpl: currentTemplate(), created: false } : detectTemplate(data);
  if (detected.error) return showErrorList("jsonModalError", "Lỗi định dạng:", [detected.error]);
  const result = normalizeExam(data, detected.tpl);
  // Chi chan nhung loi theo tung cau / sai cau truc phan; thieu so cau thi cho nhap roi bo sung bang nut +
  const blocking = result.errors.filter(e => !/: cần \d+ câu, hiện có \d+\.$/.test(e));
  if (blocking.length || !result.questions.length) {
    return showErrorList("jsonModalError", "Lỗi định dạng:", blocking.length ? blocking : result.errors);
  }

  // Chua co mau khop -> mo modal de giao vien sua mau truoc khi luu
  if (detected.created) return openDetectTplModal(data, detected.tpl, detected.counts);
  finishJsonImport(data, detected.tpl, { appendMode });
}

// ---- Modal sua cau truc moi nhan dien tu JSON
let pendingJsonImport = null; // { data, tpl }

function openDetectTplModal(data, tpl, counts) {
  pendingJsonImport = { data, tpl };
  document.getElementById("detectTplName").value = tpl.name;
  document.getElementById("detectTplError").style.display = "none";
  document.getElementById("detectTplParts").innerHTML = tpl.parts.map((p, i) => `
    <tr>
      <td><strong>${ROMAN[i]}</strong></td>
      <td>${escapeHtml(QUESTION_TYPES[p.type].label)} <code>${p.type}</code></td>
      <td>
        <input type="number" class="form-control dt-count" min="0" step="1" value="${counts[i]}" oninput="updateDetectTplTotal()">
        <small class="field-hint">JSON có ${counts[i]} câu</small>
      </td>
      <td><input type="number" class="form-control dt-points" min="0" step="0.05" value="${p.points}" oninput="updateDetectTplTotal()"></td>
      <td class="dt-sum"></td>
    </tr>`).join("");
  updateDetectTplTotal();
  openModal("detectTplModal");
  document.getElementById("detectTplName").select();
}

function readDetectTplParts() {
  const rows = [...document.querySelectorAll("#detectTplParts tr")];
  return pendingJsonImport.tpl.parts.map((p, i) => ({
    type: p.type,
    count: Math.max(0, parseInt(rows[i].querySelector(".dt-count").value, 10) || 0),
    points: Math.max(0, Number(rows[i].querySelector(".dt-points").value) || 0)
  }));
}

function updateDetectTplTotal() {
  const parts = readDetectTplParts();
  document.querySelectorAll("#detectTplParts .dt-sum").forEach((td, i) => {
    td.textContent = parts[i].count ? fmtNum(parts[i].count * parts[i].points) + "đ" : "—";
  });
  const { fixed, total } = templateTotal({ parts });
  document.getElementById("detectTplTotal").textContent = fixed
    ? `Tổng: ${fmtNum(total)} điểm${Math.abs(total - 10) > 1e-9 ? " (sẽ quy về thang 10)" : ""}`
    : "Có phần tuỳ ý số câu: điểm quy về thang 10";
}

async function confirmDetectedTemplate() {
  if (!pendingJsonImport) return;
  const name = document.getElementById("detectTplName").value.trim();
  if (!name) return showErrorList("detectTplError", "", ["Vui lòng nhập tên mẫu."]);
  if (templates.some(t => t.name === name)) return showErrorList("detectTplError", "", [`Đã có mẫu tên "${name}".`]);

  const { data } = pendingJsonImport;
  const tpl = { id: pendingJsonImport.tpl.id, name, parts: readDetectTplParts() };
  templates.push(tpl);
  try {
    await SettingsService.set("exam_templates", templates);
  } catch (err) {
    templates = templates.filter(t => t !== tpl);
    return showErrorList("detectTplError", "Không lưu được mẫu:", [err.message]);
  }
  renderTemplateSelect();
  pendingJsonImport = null;
  closeModal("detectTplModal");
  finishJsonImport(data, tpl, { appendMode: false, created: true });
}

// Ap JSON da kiem tra vao khung soan voi mau cau truc da chon
function finishJsonImport(data, tpl, { appendMode, created = false }) {
  const result = normalizeExam(data, tpl);
  document.getElementById("examTemplate").value = tpl.id;
  document.getElementById("templateSummary").innerHTML = templateChips(tpl);

  if (result.title) document.getElementById("examTitle").value = result.title;
  if (result.duration_minutes >= 1) document.getElementById("examDuration").value = result.duration_minutes;

  parsedQuestions = appendMode ? normalizeExam(parsedQuestions.concat(result.questions), tpl).questions : result.questions;
  const tplNote = appendMode ? "" : created
    ? ` Đã tạo cấu trúc mới "${tpl.name}".`
    : ` Cấu trúc: "${tpl.name}".`;
  showUploadStatus(`Đã nhập ${result.questions.length} câu hỏi.${tplNote}`);

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

// O "ma base64" la nguon du lieu cua hinh; chon file / dan anh se dien base64 vao o nay.
function setModalImage(src) {
  document.getElementById("modalQImageB64").value = src || "";
  onImageB64Input();
}

function onImageB64Input() {
  const { src, error } = normalizeImage(document.getElementById("modalQImageB64").value);
  const err = document.getElementById("modalQImageB64Err");
  err.textContent = error || "";
  err.style.display = error ? "block" : "none";
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
    image: document.getElementById("modalQImageB64").value,
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
  if (!parsedQuestions.length && editingExamId === null) return resetImport();
  renderPreview();
}

function cancelImport() {
  if (editingExamId !== null) return cancelEditExam();
  if (confirm(`Huỷ toàn bộ ${parsedQuestions.length} câu hỏi đang nhập?`)) resetImport();
}

function resetImport() {
  parsedQuestions = [];
  editingExamId = null;
  document.getElementById("examTitle").value = "";
  document.getElementById("examDuration").value = "45";
  showUploadStatus("");
  updateEditModeUi();
  renderPreview();
  loadExistingExams();
}

// =================================================== SUA DE DA TAO
// Doan mau cau truc khop voi de: moi cau phai roi vao phan cung dang; uu tien mau khong loi.
function guessTemplate(questions) {
  const fits = t => questions.every(q => {
    const id = typeIdOf(q);
    return Number.isInteger(q.part) ? t.parts[q.part]?.type === id : t.parts.some(p => p.type === id);
  });
  const candidates = templates.filter(fits);
  return candidates.find(t => !normalizeExam(questions, t).errors.length) || candidates[0] || currentTemplate();
}

async function editExam(examId) {
  if (editingExamId === examId) return;
  if (parsedQuestions.length && !confirm("Đang có đề chưa lưu trong khung soạn. Bỏ đề đó để sửa đề #" + examId + "?")) return;
  let exam;
  try {
    exam = await ExamService.getExamDetail(examId);
  } catch (err) {
    return alert("Không tải được đề thi: " + err.message);
  }
  if (!exam) return alert("Không tìm thấy đề thi #" + examId);

  const questions = Array.isArray(exam.questions) ? exam.questions : [];
  const tpl = guessTemplate(questions);
  document.getElementById("examTemplate").value = tpl.id;
  document.getElementById("templateSummary").innerHTML = templateChips(tpl);
  document.getElementById("examTitle").value = exam.title || "";
  document.getElementById("examDuration").value = exam.duration_minutes || 45;
  parsedQuestions = normalizeExam(clone(questions), tpl).questions;
  editingExamId = exam.id;
  showUploadStatus("");
  updateEditModeUi();
  renderPreview();
  loadExistingExams();
  document.getElementById("examEditorCard").scrollIntoView({ behavior: "smooth" });
}

function cancelEditExam() {
  if (confirm(`Huỷ sửa đề #${editingExamId}? Các thay đổi chưa lưu sẽ mất.`)) resetImport();
}

function updateEditModeUi() {
  const on = editingExamId !== null;
  document.getElementById("examEditorHeading").textContent = on ? `Sửa đề thi #${editingExamId}` : "Tạo đề thi mới";
  document.getElementById("btnCancelEdit").style.display = on ? "inline-flex" : "none";
  document.getElementById("btnCancelImport").style.display = on ? "none" : "";
  const submitted = on ? allResultsData.filter(r => r.exam_id === editingExamId).length : 0;
  const note = document.getElementById("editExamNote");
  note.style.display = on ? "block" : "none";
  note.textContent = !on ? "" : submitted
    ? `Đề này đã có ${submitted} bài nộp. Điểm các bài cũ không được chấm lại; thêm / xoá / đổi thứ tự câu có thể làm lệch phần xem lại bài cũ.`
    : "Đang sửa đề đã xuất bản. Bấm \"Lưu thay đổi\" để cập nhật cho thí sinh.";
}

// =================================================== XEM TRUOC THEO PHAN
function renderPreview() {
  const section = document.getElementById("previewSection");
  const show = parsedQuestions.length > 0 || editingExamId !== null;
  section.style.display = show ? "block" : "none";
  if (!show) return;

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
  const action = editingExamId !== null ? `Lưu thay đổi đề #${editingExamId}` : "Xuất bản đề thi lên hệ thống";
  btn.textContent = result.errors.length
    ? `Còn ${result.errors.length} lỗi, chưa thể ${editingExamId !== null ? "lưu" : "xuất bản"}`
    : mathErrors ? `${action} (cảnh báo: ${mathErrors} công thức lỗi hiển thị)` : action;
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
    if (editingExamId !== null) {
      await ExamService.updateExam(editingExamId, { title, duration_minutes: duration, questions: parsedQuestions });
      alert(`Đã lưu thay đổi đề thi #${editingExamId}.`);
    } else {
      await ExamService.createExam(title, duration, parsedQuestions);
      alert("Đã xuất bản đề thi! Tất cả thí sinh có thể vào làm.");
    }
    resetImport();
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
        <tr class="${ex.id === editingExamId ? "editing-exam" : ""}">
          <td>#${ex.id}</td>
          <td><strong>${escapeHtml(ex.title)}</strong>${ex.id === editingExamId ? ' <span class="badge badge-blue">Đang sửa</span>' : ""}${ex.require_seb ? ' <span class="badge badge-amber">Bắt buộc SEB</span>' : ""}${ex.require_password ? ' <span class="badge badge-blue">Có mật khẩu</span>' : ""}</td>
          <td>${ex.duration_minutes} phút</td>
          <td>${ex.created_at ? new Date(ex.created_at).toLocaleDateString("vi-VN") : "--"}</td>
          <td class="nowrap">
            <button class="btn btn-outline btn-sm btn-icon" title="Mã giám thị 6 số" aria-label="Mã giám thị đề #${ex.id}" onclick="showProctorCode(${ex.id})"><svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="4.5"/><path d="M10.7 12.3 21 2"/><path d="m16 7 3 3"/><path d="m19 4 2 2"/></svg></button>
            <button class="btn btn-outline btn-sm" title="Safe Exam Browser" onclick="showSebSettings(${ex.id})">SEB</button>
            <button class="btn btn-outline btn-sm" onclick="editExam(${ex.id})">✎ Sửa</button>
            <button class="btn btn-outline btn-sm btn-danger-outline" onclick="deleteExam(${ex.id})">Xoá</button>
          </td>
        </tr>`).join("")
      : '<tr><td colspan="5" style="text-align: center; color: var(--text-muted);">Chưa có đề thi nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--danger);">Lỗi tải danh sách đề thi.</td></tr>';
  }
}

// =================================================== MA GIAM THI 6 SO
// Moi de co 1 ma (server sinh ngau nhien): thoat khan cap, thoat ung dung, cho thi sinh lam lai.
let proctorCodeExamId = null;

async function showProctorCode(examId, regenerate = false) {
  proctorCodeExamId = examId;
  if (!regenerate) loadEntryPassword(examId);
  const box = document.getElementById("proctorCodeValue");
  document.getElementById("proctorCodeTitle").textContent = `Mã giám thị · Đề #${examId}`;
  box.textContent = "······";
  openModal("proctorCodeModal");
  try {
    const { code } = await StudentApi.proctorCode(examId, regenerate);
    box.textContent = code;
    if (regenerate) showToast("Đã đổi mã mới. Mã cũ hết hiệu lực.");
  } catch (err) {
    box.textContent = "Lỗi";
    alert("Không lấy được mã giám thị: " + err.message);
  }
}

// Mat khau vao de (mac dinh tat): bat -> hoc sinh nhap moi bat dau lam duoc. Khac ma giam thi.
async function loadEntryPassword(examId, changes = {}) {
  const box = document.getElementById("entryPasswordValue");
  try {
    const s = await StudentApi.entryPassword(examId, changes);
    document.getElementById("entryPasswordEnabled").checked = s.enabled;
    document.getElementById("entryPasswordBox").style.display = s.enabled ? "flex" : "none";
    box.textContent = s.password || "······";
    if ("enabled" in changes) {
      showToast(s.enabled ? "Đã bật mật khẩu vào đề." : "Đã tắt mật khẩu vào đề.");
      loadExistingExams();
    }
    if (changes.regenerate) showToast("Đã đổi mật khẩu vào đề. Mật khẩu cũ hết hiệu lực.");
  } catch (err) {
    alert("Không lấy được mật khẩu vào đề: " + err.message);
  }
}

function toggleEntryPassword() {
  loadEntryPassword(proctorCodeExamId, { enabled: document.getElementById("entryPasswordEnabled").checked });
}

function regenerateEntryPassword() {
  if (!confirm("Đổi mật khẩu vào đề? Học sinh chưa vào đề phải dùng mật khẩu mới.")) return;
  loadEntryPassword(proctorCodeExamId, { regenerate: true });
}

function regenerateProctorCode() {
  if (!confirm("Đổi sang mã mới? Mã cũ sẽ hết hiệu lực ngay (giám thị phải dùng mã mới).")) return;
  showProctorCode(proctorCodeExamId, true);
}

// =================================================== SAFE EXAM BROWSER
// Moi de: bat buoc SEB hay khong, file .seb, link mo SEB, mat khau thoat SEB (du phong)
let sebExamId = null;

async function showSebSettings(examId, changes = {}) {
  sebExamId = examId;
  document.getElementById("sebModalTitle").textContent = `Safe Exam Browser · Đề #${examId}`;
  openModal("sebModal");
  try {
    const s = await StudentApi.sebSettings(examId, changes);
    document.getElementById("sebRequire").checked = s.require_seb;
    document.getElementById("sebLink").value = s.seb_link;
    document.getElementById("sebDownload").href = s.config_url;
    document.getElementById("sebQuitPassword").textContent = s.quit_password;
    if ("require_seb" in changes) {
      showToast(s.require_seb ? "Đề đã bắt buộc làm trên Safe Exam Browser." : "Đã tắt bắt buộc SEB.");
      loadExistingExams();
    }
    if (changes.regenerate_password) showToast("Đã đổi mật khẩu thoát SEB. Cần phát lại file .seb mới.");
  } catch (err) {
    alert("Không lấy được cài đặt SEB: " + err.message);
  }
}

function toggleSebRequired() {
  showSebSettings(sebExamId, { require_seb: document.getElementById("sebRequire").checked });
}

function regenerateSebPassword() {
  if (!confirm("Đổi mật khẩu thoát SEB? File .seb đã phát trước đó sẽ dùng mật khẩu cũ, cần phát lại file / link mới.")) return;
  showSebSettings(sebExamId, { regenerate_password: true });
}

async function deleteExam(examId) {
  if (!confirm(`Xoá vĩnh viễn đề thi #${examId}?`)) return;
  try {
    await ExamService.deleteExam(examId);
    if (examId === editingExamId) resetImport();
    loadExistingExams();
    loadResults();
  } catch (err) {
    alert("Lỗi khi xoá đề thi: " + err.message);
  }
}

// =================================================== KET QUA + CHAM TU LUAN
// So lan vi pham + co thoat khan cap trong nhat ky
function logFlags(logs) {
  const list = Array.isArray(logs) ? logs : [];
  const violations = list.filter(l => VIOLATION_TYPES.includes(l.type)).length;
  const exits = list.filter(l => l.type === "THOAT_KHAN_CAP").length;
  return (violations ? ` <span class="badge badge-red">Vi phạm ${violations}</span>` : "") +
    (exits ? ` <span class="badge badge-amber">Thoát khẩn cấp ${exits}</span>` : "");
}

function renderLogs(logs) {
  return Array.isArray(logs) && logs.length
    ? logs.map(log => `
      <div class="log-row ${VIOLATION_TYPES.includes(log.type) || log.type === "THOAT_KHAN_CAP" ? "log-violation" : ""}">
        <span style="color: var(--text-muted);">[${escapeHtml(log.time || "--")}]</span>
        <strong>${escapeHtml(log.type)}:</strong>
        <span>${escapeHtml(log.detail)}</span>
      </div>`).join("")
    : '<p style="color: var(--text-muted);">Không có nhật ký thao tác.</p>';
}

const EVENT_LABELS = {
  THOAT_KHAN_CAP: ["Thoát khẩn cấp", "badge-red"],
  THOAT_UNG_DUNG: ["Thoát ứng dụng", "badge-muted"],
  SAI_MAT_KHAU: ["Sai mã giám thị", "badge-amber"],
  CHO_LAM_LAI: ["Cho làm lại", "badge-blue"],
  MO_KHOA: ["Mở khoá bài thi", "badge-amber"]
};

async function loadEvents() {
  const tbody = document.getElementById("eventsTableBody");
  try {
    allEvents = await EventService.getAll() || [];
    tbody.innerHTML = allEvents.length
      ? allEvents.map((ev, i) => `
        <tr>
          <td>${ev.created_at ? new Date(ev.created_at).toLocaleString("vi-VN") : "--"}</td>
          <td><strong>${escapeHtml(ev.student_name)}</strong></td>
          <td>${escapeHtml(ev.exam_title || (ev.exam_id ? `#${ev.exam_id}` : "--"))}</td>
          <td><span class="badge ${(EVENT_LABELS[ev.type] || EVENT_LABELS.THOAT_UNG_DUNG)[1]}">${(EVENT_LABELS[ev.type] || [ev.type])[0]}</span></td>
          <td style="max-width: 360px;">${escapeHtml(ev.detail)}</td>
          <td>${(ev.action_logs || []).length ? `<button class="btn btn-outline btn-sm" onclick="viewEventLogs(${i})">Xem</button>` : "--"}</td>
        </tr>`).join("")
      : '<tr><td colspan="6" style="text-align: center; color: var(--text-muted);">Chưa có sự cố nào.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: var(--danger);">Không tải được sự cố. Hãy chạy npm run db:migrate để tạo bảng exam_events.</td></tr>';
  }
}

function viewEventLogs(i) {
  const ev = allEvents[i];
  if (!ev) return;
  detailIndex = null;
  document.getElementById("modalTitle").textContent = `${ev.student_name} — sự cố lúc ${new Date(ev.created_at).toLocaleString("vi-VN")}`;
  document.getElementById("modalAnswersList").innerHTML = `<p>${escapeHtml(ev.detail)}</p>`;
  document.getElementById("gradeBar").style.display = "none";
  document.getElementById("modalLogsList").innerHTML = renderLogs(ev.action_logs);
  openModal("detailModal");
}

async function loadResults() {
  loadEvents();
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
          <td>${pending ? `<span class="badge badge-amber">Chờ chấm ${pending} câu</span>` : '<span class="badge badge-green">Đã chấm</span>'}${logFlags(res.action_logs)}</td>
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

  document.getElementById("modalLogsList").innerHTML = renderLogs(item.action_logs);

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
