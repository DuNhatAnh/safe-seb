// Hien phien ban o cuoi trang (phan tu .app-version): "Phiên bản 1 · a1b2c3d" (+ "App 1 (bản 12)" khi chay trong app Android)
(function () {
  function apply(text) {
    document.querySelectorAll(".app-version").forEach(function (el) { el.textContent = text; });
  }
  function load() {
    var app = window.KioskBridge && typeof window.KioskBridge.appVersion === "function" ? " · App " + window.KioskBridge.appVersion() : "";
    fetch("/api/version")
      .then(function (r) { return r.json(); })
      .then(function (v) { apply("Phiên bản " + v.version + " · " + v.commit + app); })
      .catch(function () { apply(app ? app.slice(3) : ""); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load);
  else load();
})();
