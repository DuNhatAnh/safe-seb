// Phien ban (moi trang co file nay):
//  - Hien o cuoi trang (.app-version): "Phiên bản 1.3 · a1b2c3d" (+ "App v1.3" khi chay trong app Android).
//  - App Android cu hon phien ban toi thieu (server tra min_app_version) -> che trang, yeu cau tai app moi.
//  - Trang mo tu truoc khi co phien ban moi (server da doi phien ban) -> che trang, yeu cau tai lai trang.
//  Khong bao gio che giua luc dang lam bai: doi hoc sinh ra khoi bai thi roi moi che.
(function () {
  var CHECK_EVERY_MS = 5 * 60 * 1000;
  var loadedVersion = null; // phien ban luc mo trang
  var pending = null;       // thong bao dang cho (vi dang lam bai)
  var shown = false;

  function appVersion() {
    try {
      return window.KioskBridge && typeof window.KioskBridge.appVersion === "function" ? String(window.KioskBridge.appVersion()) : null;
    } catch (e) { return null; }
  }

  // So sanh "LON.NHO" theo so (1.10 > 1.9)
  function cmp(a, b) {
    var p = function (v) { var m = /(\d+)\.(\d+)/.exec(String(v || "")); return m ? [+m[1], +m[2]] : [0, 0]; };
    var x = p(a), y = p(b);
    return x[0] - y[0] || x[1] - y[1];
  }

  function examRunning() {
    return typeof Lockdown !== "undefined" && Lockdown.active;
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; });
  }

  function show(kind, data) {
    if (shown) return;
    if (examRunning()) { pending = { kind: kind, data: data }; return; }
    shown = true;
    var downloadUrl = location.origin + "/tai-app";
    var html;
    if (kind === "app") {
      html =
        '<div class="lock-title">CẦN CÀI APP PHIÊN BẢN MỚI</div>' +
        '<p style="margin-bottom: 12px;">App trên máy là bản <strong>' + esc(data.app || "cũ") + '</strong>, đã cũ. ' +
        'Từ phiên bản <strong>' + esc(data.min) + '</strong> mới làm bài được.</p>' +
        '<ol class="update-steps"><li>Gỡ app <strong>Safe Exam</strong> cũ.</li><li>Tải và cài bản mới.</li></ol>' +
        '<button type="button" class="btn btn-primary btn-block" id="btnUpdateApp">Tải app mới</button>' +
        '<p class="field-hint" style="margin-top: 10px;">Nếu bấm không mở được: mở Chrome, vào <strong>' + esc(downloadUrl) + '</strong>. ' +
        'Bài đã nộp không bị mất (lưu trên máy chủ).</p>';
    } else {
      html =
        '<div class="lock-title">ĐÃ CÓ PHIÊN BẢN MỚI</div>' +
        '<p style="margin-bottom: 16px;">Hệ thống đã cập nhật lên bản <strong>' + esc(data.version) + '</strong>. ' +
        'Tải lại trang để dùng bản mới.</p>' +
        '<button type="button" class="btn btn-primary btn-block" id="btnUpdateReload">Tải lại trang</button>';
    }
    var overlay = document.createElement("div");
    overlay.id = "updateOverlay";
    overlay.className = "overlay";
    overlay.style.zIndex = "300";
    overlay.innerHTML = '<div class="lock-screen" role="alertdialog" aria-modal="true" style="max-width: 420px;">' + html + "</div>";
    document.body.appendChild(overlay);
    var btnApp = document.getElementById("btnUpdateApp");
    if (btnApp) btnApp.onclick = function () {
      if (window.KioskBridge && typeof window.KioskBridge.openDownload === "function") window.KioskBridge.openDownload(downloadUrl);
      else window.location.href = downloadUrl;
    };
    var btnReload = document.getElementById("btnUpdateReload");
    if (btnReload) btnReload.onclick = function () { window.location.reload(); };
  }

  function footer(text) {
    document.querySelectorAll(".app-version").forEach(function (el) { el.textContent = text; });
  }

  function check() {
    var app = appVersion();
    fetch("/api/version", { cache: "no-store" })
      .then(function (r) { return r.json(); })
      .then(function (v) {
        if (loadedVersion === null) {
          loadedVersion = v.version;
          footer("Phiên bản " + v.version + " · " + v.commit + (app ? " · App " + app : ""));
        } else if (v.version !== loadedVersion) {
          show("reload", { version: v.version });
        }
        // Chay trong app Android ma app cu hon phien ban toi thieu (app qua cu khong bao duoc phien ban -> cung chan)
        if (window.KioskBridge && v.min_app_version && (!app || cmp(app, v.min_app_version) < 0)) {
          show("app", { app: app, min: v.min_app_version });
        }
      })
      .catch(function () { if (loadedVersion === null) footer(app ? "App " + app : ""); });
  }

  function start() {
    check();
    setInterval(check, CHECK_EVERY_MS);
    document.addEventListener("visibilitychange", function () { if (!document.hidden) check(); });
    // Dang lam bai thi doi; ra khoi bai thi la hien thong bao dang cho
    setInterval(function () {
      if (pending && !examRunning()) { var p = pending; pending = null; show(p.kind, p.data); }
    }, 2000);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
