// Lop khoa trinh duyet khi lam bai (tang 1 cua ke hoach "tua SEB").
// Trinh duyet KHONG the chan tuyet doi Esc / Alt+Tab / phim Windows. Lop nay lam 3 viec:
//  1. Chan nhung gi trang web chan duoc (chuot phai, sao chep, phim tat, nut Back, tai lai trang).
//  2. Khoa ban phim trong che do toan man hinh (Keyboard Lock API - Chrome/Edge): phai GIU Esc moi thoat duoc.
//  3. Phat hien moi lan roi bai thi (thoat toan man hinh, chuyen cua so, chuot ra ngoai) -> ghi log
//     + che kin de thi cho toi khi thi sinh quay lai che do thi.
// Tren app Android (KioskBridge) va Safe Exam Browser, he dieu hanh da khoa nen khong bat buoc toan man hinh.
const Lockdown = {
  active: false,
  tracker: null,
  violations: 0,
  suspendedUntil: 0,   // tam bo qua blur khi chinh trang mo hop thoai confirm/alert
  lastLogAt: {},
  keyboardLocked: false,

  env() {
    if (window.KioskBridge) return "ANDROID_KIOSK";
    if (/\bSEB\//.test(navigator.userAgent)) return "SEB";
    return "WEB";
  },

  fullscreenSupported() {
    const el = document.documentElement;
    return !!(el.requestFullscreen || el.webkitRequestFullscreen);
  },

  // Chi web thuong moi bat buoc toan man hinh
  needFullscreen() {
    return this.env() === "WEB" && this.fullscreenSupported();
  },

  isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  },

  start(tracker) {
    this.tracker = tracker;
    this.violations = (tracker.getLogs() || []).filter(l => VIOLATION_TYPES.includes(l.type)).length;
    if (this.active) return;
    this.active = true;
    document.body.classList.add("exam-locked");

    for (const [target, type, fn] of this.handlers()) target.addEventListener(type, fn, true);
    history.pushState({ exam: true }, "", location.href);

    const env = this.env();
    this.log("MOI_TRUONG", `Môi trường thi: ${env === "SEB" ? "Safe Exam Browser" : env === "ANDROID_KIOSK" ? "Ứng dụng Android (Kiosk)" : "Trình duyệt web"}`, false);
    this.enterFullscreen().then(() => this.check());
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove("exam-locked");
    for (const [target, type, fn] of this.handlers()) target.removeEventListener(type, fn, true);
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    this.keyboardLocked = false;
    this.hideShield();
  },

  exitFullscreen() {
    if (!this.isFullscreen()) return;
    const fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) try { fn.call(document); } catch (e) { }
  },

  // Bao boc hop thoai cua chinh trang (confirm/alert gay blur gia)
  dialog(fn) {
    this.suspendedUntil = Date.now() + 60000;
    try { return fn(); } finally { this.suspendedUntil = Date.now() + 600; }
  },

  suspended() { return Date.now() < this.suspendedUntil; },

  // Ghi log; violation=true -> dem vi pham. Gioi han 1 log / 2s moi loai de khong spam.
  log(type, detail, violation = true) {
    if (!this.tracker) return;
    const now = Date.now();
    if (violation && now - (this.lastLogAt[type] || 0) < 2000) return;
    this.lastLogAt[type] = now;
    if (violation) this.violations++;
    this.tracker.addLog(type, detail);
  },

  async enterFullscreen() {
    if (!this.needFullscreen()) return;
    const el = document.documentElement;
    try {
      if (!this.isFullscreen()) {
        if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: "hide" });
        else if (el.webkitRequestFullscreen) await el.webkitRequestFullscreen();
      }
      // Khoa ban phim: Esc, phim Windows, Alt+... duoc chuyen cho trang thay vi trinh duyet
      if (navigator.keyboard && navigator.keyboard.lock && !this.keyboardLocked) {
        await navigator.keyboard.lock();
        this.keyboardLocked = true;
      }
    } catch (e) {
      // Thieu thao tac nguoi dung -> man che se hien nut de thi sinh bam vao lai
    }
  },

  // Kiem tra trang thai, hien / an man che
  check(reason) {
    if (!this.active) return;
    const fsOk = !this.needFullscreen() || this.isFullscreen();
    const focusOk = !document.hidden && (document.hasFocus() || this.suspended());
    if (fsOk && focusOk) this.hideShield();
    else this.showShield(reason || (!fsOk ? "Bài thi yêu cầu chế độ toàn màn hình." : "Cửa sổ bài thi không còn được chọn."));
  },

  showShield(reason) {
    const el = document.getElementById("viewShield");
    if (!el) return;
    document.getElementById("shieldReason").textContent = reason;
    document.getElementById("shieldCount").textContent = this.violations
      ? `Số lần rời bài thi đã ghi nhận: ${this.violations}. Giám thị sẽ thấy toàn bộ trong nhật ký.`
      : "Thao tác này được ghi vào nhật ký bài thi.";
    el.style.display = "flex";
  },

  hideShield() {
    const el = document.getElementById("viewShield");
    if (el) el.style.display = "none";
  },

  // Thi sinh bam "Quay lai bai thi" tren man che (thao tac nguoi dung -> duoc phep vao toan man hinh)
  async resume() {
    await this.enterFullscreen();
    window.focus();
    this.check();
  },

  handlers() {
    if (this._handlers) return this._handlers;
    const isField = t => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA");
    const keyName = e => [e.ctrlKey && "Ctrl", e.metaKey && "Meta", e.altKey && "Alt", e.shiftKey && "Shift", e.key].filter(Boolean).join("+");

    const onKey = e => {
      const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const ctrl = e.ctrlKey || e.metaKey;
      const blocked =
        k === "Escape" || k === "F12" || k === "F11" || k === "F5" || k === "Meta" || k === "OS" ||
        (ctrl && ["r", "p", "s", "u", "o", "f", "g", "h", "j", "l", "n", "t", "w", "+", "-", "=", "0"].includes(k)) ||
        (ctrl && e.shiftKey && ["i", "j", "c", "k", "delete"].includes(k)) ||
        (ctrl && ["c", "x", "v"].includes(k)) ||
        (ctrl && k === "a" && !isField(e.target)) ||
        (e.altKey && ["ArrowLeft", "ArrowRight", "Home", "F4", "Tab"].includes(k));
      if (!blocked) return;
      e.preventDefault();
      e.stopPropagation();
      this.log("PHIM_BI_CHAN", `Bấm phím bị chặn: ${keyName(e)}`);
    };

    const onFullscreen = () => {
      if (this.needFullscreen() && !this.isFullscreen()) {
        this.keyboardLocked = false;
        this.log("THOAT_TOAN_MAN_HINH", "Thoát chế độ toàn màn hình (Esc / F11 / thao tác trình duyệt)");
      }
      this.check();
    };

    const onVisibility = () => {
      if (document.hidden) this.log("ROI_MAN_HINH", "Rời khỏi tab hoặc chuyển ứng dụng khác");
      else this.log("QUAY_LAI", "Quay lại màn hình bài thi", false);
      this.check();
    };

    const onBlur = e => {
      if (e.target !== window) return;
      // Doi 1 nhip: hop thoai cua chinh trang / chuyen focus vao iframe khong tinh
      setTimeout(() => {
        if (!this.active || this.suspended() || document.hasFocus()) return;
        this.log("MAT_TIEU_DIEM", "Cửa sổ bài thi mất tiêu điểm (Alt+Tab, bấm ra ngoài, mở ứng dụng khác)");
        this.check();
      }, 150);
    };

    const onFocus = e => { if (e.target === window) this.check(); };

    const onMouseOut = e => {
      if (e.relatedTarget || e.toElement) return;
      this.log("CHUOT_RA_NGOAI", "Con trỏ chuột rời khỏi vùng bài thi (có thể dùng màn hình thứ 2)");
    };

    const prevent = (type, detail) => e => {
      if (type === "SAO_CHEP" || !isField(e.target)) {
        e.preventDefault();
        if (type) this.log(type, detail);
      }
    };

    const onBeforeUnload = e => {
      this.log("TAI_LAI_TRANG", "Cố tải lại / đóng trang khi đang làm bài");
      e.preventDefault();
      e.returnValue = "";
    };

    const onPopState = () => {
      history.pushState({ exam: true }, "", location.href);
      this.log("NUT_BACK", "Bấm nút Quay lại của trình duyệt");
    };

    this._handlers = [
      [window, "keydown", onKey],
      [document, "fullscreenchange", onFullscreen],
      [document, "webkitfullscreenchange", onFullscreen],
      [document, "visibilitychange", onVisibility],
      [window, "blur", onBlur],
      [window, "focus", onFocus],
      [document, "mouseout", onMouseOut],
      [document, "contextmenu", prevent("CHUOT_PHAI", "Bấm chuột phải")],
      [document, "copy", prevent("SAO_CHEP", "Sao chép nội dung")],
      [document, "cut", prevent("SAO_CHEP", "Cắt nội dung")],
      [document, "paste", prevent("SAO_CHEP", "Dán nội dung từ bên ngoài")],
      [document, "selectstart", prevent(null)],
      [document, "dragstart", prevent(null)],
      [window, "beforeunload", onBeforeUnload],
      [window, "popstate", onPopState]
    ];
    return this._handlers;
  }
};
