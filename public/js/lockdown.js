// Lop khoa trinh duyet khi lam bai (tang 1 cua ke hoach "tua SEB").
// Trinh duyet KHONG the chan tuyet doi Esc / Alt+Tab / phim Windows. Lop nay lam 3 viec:
//  1. Chan nhung gi trang web chan duoc (chuot phai, sao chep, phim tat, nut Back, tai lai trang).
//  2. Khoa ban phim trong che do toan man hinh (Keyboard Lock API - Chrome/Edge): phai GIU Esc moi thoat duoc.
//  3. Phat hien moi lan roi bai thi (thoat toan man hinh, chuyen cua so, tai lai trang...) -> ghi log
//     + che kin de thi. Roi bai qua FREE_LEAVES lan -> KHOA BAI: chi giam thi nhap ma 6 so cua de moi mo duoc
//     (trang thai khoa luu trong ban nhap -> tai lai trang khong go duoc khoa).
// Tren app Android (KioskBridge) va Safe Exam Browser, he dieu hanh da khoa nen khong bat buoc toan man hinh.
// So lan duoc roi bai ma chi bi canh bao. 0 = roi bai (thoat toan man hinh, chuyen cua so / tab,
// tai lai trang) la KHOA NGAY, chi giam thi nhap ma cua de moi mo duoc.
const FREE_LEAVES = 0;

const Lockdown = {
  active: false,
  leaves: 0,           // so lan roi bai (moi lan roi + quay lai = 1 lan)
  locked: false,       // bai dang bi khoa, can ma giam thi
  wasOk: false,        // dang o trong bai dung che do (de dem 1 lan roi bai chi 1 lan)
  onChange: null,      // goi khi leaves / locked doi (exam.js luu ban nhap)
  strict: false,       // admin bat "Khoa bai khi roi trang": roi trang -> khoa, can ma giam thi
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

  // App Android bao: dang co cua so noi (bong bong chat...) / man hinh bai thi mat tieu diem
  nativeOverlay: false,
  nativeBlur: false,
  nativeSplit: false,   // app bao dang chia doi man hinh
  nativeUnpinned: false, // app bao man hinh CHUA / KHONG CON duoc ghim
  wasPinned: false,      // da tung ghim trong luot nay (go ghim sau do moi tinh la roi bai)
  shrunk: false,        // cua so bai thi bi hep di nhieu (chia doi man hinh / thu nho cua so)
  hiddenAt: 0,          // thoi diem roi bai (tinh so giay roi bai)
  // Loai con tro cua lan cham / bam gan nhat: "touch" (dien thoai) / "mouse" / "pen"
  lastPointer: "mouse",

  // state: { leaves, locked } khoi phuc tu ban nhap; onChange: luu lai khi doi
  start(tracker, { leaves = 0, locked = false, onChange = null, strict = false } = {}) {
    this.nativeOverlay = false;
    this.nativeBlur = false;
    this.nativeSplit = false;
    this.nativeUnpinned = false;
    this.wasPinned = false;
    // App Android ban moi: hoi ngay trang thai ghim (khong cho tin hieu - tin hieu co the den truoc khi trang san sang)
    try {
      if (window.KioskBridge && typeof window.KioskBridge.isPinned === "function") {
        const pinned = !!window.KioskBridge.isPinned();
        this.wasPinned = pinned;
        this.nativeUnpinned = !pinned;
      }
    } catch (e) { }
    this.shrunk = this.isShrunk();
    this.hiddenAt = 0;
    this.strict = !!strict;
    this.tracker = tracker;
    this.violations = (tracker.getLogs() || []).filter(l => VIOLATION_TYPES.includes(l.type)).length;
    this.leaves = leaves;
    this.locked = !!locked;
    this.wasOk = false;
    this.onChange = onChange;
    if (this.active) { this.check(); return; }
    this.active = true;
    document.body.classList.add("exam-locked");

    for (const [target, type, fn] of this.handlers()) target.addEventListener(type, fn, true);
    history.pushState({ exam: true }, "", location.href);

    const env = this.env();
    this.log("MOI_TRUONG", `Môi trường thi: ${env === "SEB" ? "Safe Exam Browser" : env === "ANDROID_KIOSK" ? "Ứng dụng Android (Kiosk)" : "Trình duyệt web"}`, false);
    this.logAccessibilityApps();
    this.enterFullscreen().then(() => this.check());
  },

  stop() {
    if (!this.active) return;
    this.active = false;
    document.body.classList.remove("exam-locked");
    for (const [target, type, fn] of this.handlers()) target.removeEventListener(type, fn, true);
    if (navigator.keyboard && navigator.keyboard.unlock) navigator.keyboard.unlock();
    this.keyboardLocked = false;
    this.locked = false;
    this.onChange = null;
    this.hideShield();
  },

  state() {
    return { leaves: this.leaves, locked: this.locked };
  },

  // Ghi nhan 1 lan roi bai; qua FREE_LEAVES lan -> khoa bai
  recordLeave(how) {
    this.leaves++;
    if (this.strict && this.leaves > FREE_LEAVES && !this.locked) {
      this.locked = true;
      this.log("KHOA_BAI", `Bài thi bị khoá: rời bài lần ${this.leaves} (${how}). Cần giám thị nhập mã để làm tiếp.`, false);
    }
    if (this.onChange) this.onChange();
  },

  // Giam thi da nhap dung ma (server xac nhan) -> mo khoa. So lan roi bai giu nguyen: roi tiep la khoa lai ngay.
  unlock() {
    this.locked = false;
    if (this.onChange) this.onChange();
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
    // Moi vao bai, chua bam "Ghim" tren hop thoai cua Android: che bai, KHONG tinh roi bai
    if (this.nativeUnpinned && !this.wasPinned) {
      this.showShield("Bấm \"Ghim\" trên hộp thoại của điện thoại để bắt đầu làm bài (bài thi phải được ghim màn hình).");
      return;
    }
    const fsOk = !this.needFullscreen() || this.isFullscreen();
    const focusOk = !document.hidden && (document.hasFocus() || this.suspended()) && !this.nativeBlur && !this.nativeOverlay
      && !this.nativeSplit && !this.shrunk && !this.nativeUnpinned;
    if (fsOk && focusOk) {
      this.wasOk = true;
      if (this.locked) this.showShield();
      else this.hideShield();
      return;
    }
    // Vua tu trong bai roi ra ngoai (lan dau vao chua toan man hinh thi khong tinh)
    if (this.wasOk) {
      this.wasOk = false;
      this.recordLeave(!fsOk ? "thoát toàn màn hình" : "chuyển cửa sổ / tab");
    }
    this.showShield(reason || (!fsOk ? "Bài thi yêu cầu chế độ toàn màn hình."
      : this.nativeUnpinned ? "Màn hình bài thi đã bị gỡ ghim. Bấm \"Ghim\" trên hộp thoại của điện thoại để làm tiếp (chỉ giám thị nhập mật khẩu mới thoát được)."
      : this.nativeOverlay ? "Đang có bong bóng chat hoặc cửa sổ nổi của ứng dụng khác trên màn hình. Tắt nó đi rồi bấm \"Quay lại bài thi\"."
        : this.nativeSplit || this.shrunk ? "Cửa sổ bài thi bị chia đôi / thu nhỏ. Mở bài thi toàn màn hình rồi bấm \"Quay lại bài thi\"."
          : "Cửa sổ bài thi không còn được chọn."));
  },

  showShield(reason) {
    const el = document.getElementById("viewShield");
    if (!el) return;
    const locked = this.locked;
    const left = FREE_LEAVES - this.leaves; // so lan con duoc roi bai truoc khi bi khoa
    document.getElementById("shieldTitle").textContent = locked ? "BÀI THI ĐÃ BỊ KHOÁ" : this.leaves ? "BẠN ĐÃ RỜI BÀI THI" : "CHẾ ĐỘ THI";
    document.getElementById("shieldReason").textContent = locked
      ? `Bạn đã rời bài thi ${this.leaves} lần. Gọi giám thị nhập mật khẩu đề để làm tiếp. Thời gian làm bài vẫn chạy.`
      : (reason || "Bạn đã rời bài thi.");
    document.getElementById("shieldCount").textContent = locked
      ? "Việc mở khoá được ghi vào nhật ký gửi về quản trị viên."
      : !this.strict
        ? (this.leaves ? `Đã ghi nhận ${this.leaves} lần rời bài thi. Giám thị sẽ thấy trong nhật ký.` : "Mỗi lần rời bài thi (thoát toàn màn hình, chuyển cửa sổ / tab) đều được ghi vào nhật ký.")
        : left > 0
          ? `Cảnh báo: còn ${left} lần rời bài trước khi bài bị KHOÁ. Đã ghi nhận ${this.leaves} lần rời bài.`
          : "Trong lúc làm bài, nếu thoát toàn màn hình, chuyển cửa sổ / tab hoặc tải lại trang, bài sẽ bị KHOÁ NGAY và chỉ giám thị mở được.";
    document.getElementById("btnShieldResume").textContent = this.leaves ? "Quay lại bài thi" : "Vào làm bài (toàn màn hình)";
    document.getElementById("shieldLocked").style.display = locked ? "block" : "none";
    document.getElementById("btnShieldResume").style.display = locked ? "none" : "block";
    if (el.style.display !== "flex") {
      document.getElementById("shieldCode").value = "";
      document.getElementById("shieldError").style.display = "none";
    }
    el.style.display = "flex";
  },

  // Cua so bai thi hep hon 70% chieu ngang man hinh: chia doi man hinh / cua so nho / mo app ben canh.
  // Chi xet chieu ngang (ban phim dien thoai chi lam thap chieu cao). Chi ap dung khi KHONG bat buoc toan man hinh
  // (app Android, SEB): trinh duyet may tinh da bat buoc toan man hinh, cua so chua phong to la chuyen binh thuong.
  isShrunk() {
    if (this.needFullscreen()) return false;
    const sw = (window.screen && window.screen.width) || 0;
    return sw > 0 && window.innerWidth > 0 && window.innerWidth < sw * 0.7;
  },

  // App Android: ghi ten cac ung dung tro nang dang bat (doc man hinh, tu bam, giai bai AI...) - khong tinh vi pham
  logAccessibilityApps() {
    try {
      if (!window.KioskBridge || typeof window.KioskBridge.accessibilityServices !== "function") return;
      const apps = String(window.KioskBridge.accessibilityServices() || "").trim();
      if (apps) this.log("UNG_DUNG_TRO_NANG", `Điện thoại đang bật ứng dụng trợ năng (có thể đọc / điều khiển màn hình): ${apps}`, false);
    } catch (e) { }
  },

  hideShield() {
    const el = document.getElementById("viewShield");
    if (el) el.style.display = "none";
  },

  // Thi sinh bam "Quay lai bai thi" tren man che (thao tac nguoi dung -> duoc phep vao toan man hinh)
  async resume() {
    // Con cua so noi thi lan cham tiep theo app lai bao -> man che hien lai
    this.nativeOverlay = false;
    // Chua ghim -> hoi ghim lai ngay (app Android)
    if (this.nativeUnpinned && window.KioskBridge && typeof window.KioskBridge.startLock === "function") window.KioskBridge.startLock();
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
      if (document.hidden) {
        this.hiddenAt = Date.now();
        this.log("ROI_MAN_HINH", "Rời khỏi tab hoặc chuyển ứng dụng khác");
      } else {
        const secs = this.hiddenAt ? Math.round((Date.now() - this.hiddenAt) / 1000) : 0;
        this.hiddenAt = 0;
        this.log("QUAY_LAI", secs ? `Quay lại màn hình bài thi sau ${secs} giây` : "Quay lại màn hình bài thi", false);
      }
      this.check();
    };

    // Cua so bi chia doi / thu nho (web) - kiem tra lai moi khi doi kich thuoc
    const onResize = () => {
      const now = this.isShrunk();
      if (now === this.shrunk) return;
      this.shrunk = now;
      if (now) this.log("CHIA_MAN_HINH", `Cửa sổ bài thi bị chia đôi / thu nhỏ (rộng ${window.innerWidth}px / màn hình ${window.screen.width}px)`);
      this.check();
    };

    // In trang (menu trinh duyet) / phim chup man hinh tren may tinh (khong chan duoc he dieu hanh, chi ghi lai)
    const onBeforePrint = () => this.log("IN_TRANG", "Mở in trang bài thi");
    const onKeyUp = e => {
      if (e.key === "PrintScreen") this.log("CHUP_MAN_HINH", "Bấm phím chụp màn hình (PrintScreen)");
    };

    // Keo tha chu / tep tu ngoai vao bai
    const onDrop = e => {
      e.preventDefault();
      this.log("KEO_THA", "Kéo thả nội dung từ bên ngoài vào bài thi");
    };
    const onDragOver = e => e.preventDefault();

    // Mang: khong phai vi pham, ghi de admin biet ly do nop cham
    const onOffline = () => this.log("MAT_MANG", "Mất kết nối mạng", false);
    const onOnline = () => this.log("CO_MANG", "Có mạng trở lại", false);

    const onBlur = e => {
      if (e.target !== window) return;
      // App Android / SEB: he dieu hanh da khoa; blur o day thuong do hop thoai he thong (vd: "Ghim ung dung?")
      // -> chi tinh khi trang bi an (visibilitychange), khong tinh blur
      if (this.env() !== "WEB") return;
      // Doi 1 nhip: hop thoai cua chinh trang / chuyen focus vao iframe khong tinh
      setTimeout(() => {
        if (!this.active || this.suspended() || document.hasFocus()) return;
        this.log("MAT_TIEU_DIEM", "Cửa sổ bài thi mất tiêu điểm (Alt+Tab, bấm ra ngoài, mở ứng dụng khác)");
        this.check();
      }, 150);
    };

    const onFocus = e => { if (e.target === window) this.check(); };

    const onPointerDown = e => { this.lastPointer = e.pointerType || "mouse"; };

    // Dien thoai: cham giu lau cung ban su kien "contextmenu" nhu chuot phai -> ghi rieng, khong tinh vi pham
    const onContextMenu = e => {
      if (isField(e.target)) return;
      e.preventDefault();
      const kind = e.pointerType || this.lastPointer;
      if (kind === "touch" || kind === "pen") this.log("GIU_LAU", "Chạm giữ lâu trên màn hình (điện thoại / máy tính bảng)", false);
      else this.log("CHUOT_PHAI", "Bấm chuột phải");
    };

    // App Android bao (MainActivity.notifyWeb)
    const onNative = e => {
      const type = e.detail && e.detail.type;
      if (type === "overlay") {
        this.nativeOverlay = true;
        this.log("CUA_SO_NOI", "Có bong bóng chat / cửa sổ nổi của ứng dụng khác trên màn hình bài thi");
      } else if (type === "blur") {
        if (this.suspended()) return; // hop thoai cua chinh trang (vd: xac nhan nop bai)
        this.nativeBlur = true;
        this.log("MAT_TIEU_DIEM", "Màn hình bài thi mất tiêu điểm: bấm vào bong bóng chat / thanh thông báo / cửa sổ ứng dụng khác");
      } else if (type === "focus") {
        this.nativeBlur = false;
      } else if (type === "pinned") {
        this.wasPinned = true;
        this.nativeUnpinned = false;
      } else if (type === "unpinned") {
        this.nativeUnpinned = true;
        if (this.wasPinned) this.log("GO_GHIM", "Gỡ ghim màn hình bài thi (thoát chế độ khoá của điện thoại)");
      } else if (type === "split") {
        this.nativeSplit = true;
        this.log("CHIA_MAN_HINH", "Chia đôi màn hình / cửa sổ nhỏ trên điện thoại");
      } else if (type === "split-off") {
        this.nativeSplit = false;
      } else return;
      this.check();
    };

    const onMouseOut = e => {
      if (this.lastPointer !== "mouse") return; // man hinh cam ung: khong co chuot
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

    // Trang that su bi dong / tai lai -> tinh 1 lan roi bai (luu vao ban nhap qua onChange)
    const onPageHide = () => {
      if (this.active) this.recordLeave("tải lại / đóng trang");
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
      [document, "pointerdown", onPointerDown],
      [window, "safeexam-native", onNative],
      [document, "mouseout", onMouseOut],
      [document, "contextmenu", onContextMenu],
      [document, "copy", prevent("SAO_CHEP", "Sao chép nội dung")],
      [document, "cut", prevent("SAO_CHEP", "Cắt nội dung")],
      [document, "paste", prevent("SAO_CHEP", "Dán nội dung từ bên ngoài")],
      [document, "selectstart", prevent(null)],
      [document, "dragstart", prevent(null)],
      [document, "drop", onDrop],
      [document, "dragover", onDragOver],
      [window, "resize", onResize],
      [window, "beforeprint", onBeforePrint],
      [window, "keyup", onKeyUp],
      [window, "offline", onOffline],
      [window, "online", onOnline],
      [window, "beforeunload", onBeforeUnload],
      [window, "pagehide", onPageHide],
      [window, "popstate", onPopState]
    ];
    return this._handlers;
  }
};
