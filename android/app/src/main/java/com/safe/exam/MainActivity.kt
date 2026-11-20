package com.safe.exam

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.os.SystemClock
import android.view.MotionEvent
import android.view.View
import android.view.WindowManager
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // Dia chi trang dang nhap. Dat trong android/gradle.properties (safeExamUrl), KHONG sua o day:
    //   - Cung Wi-Fi voi may chay `npm start`: http://<IP may tinh>:3000/index.html
    //   - Da deploy Vercel:                    https://<ten-mien>/index.html
    private val examUrl = BuildConfig.EXAM_URL
    private val examHost = Uri.parse(examUrl).host

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Giu man hinh luon sang + chan chup / quay man hinh trong luc thi
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
        // An bong bong chat / cua so noi cua app khac (Messenger, Zalo...) khi app thi dang mo (Android 12+)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) window.setHideOverlayWindows(true)

        setContentView(R.layout.activity_main)
        hideSystemBars()

        webView = findViewById(R.id.webView)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true // ban nhap bai lam luu trong localStorage
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        // Device Owner: cho phep khoa that + bat han che thiet bi (khong phai thi bo qua)
        KioskManager.applyPolicies(this)

        // Gan cau noi KioskBridge vao JavaScript (exam.js goi startLock / stopLock)
        webView.addJavascriptInterface(KioskBridge(this), "KioskBridge")

        webView.webViewClient = object : WebViewClient() {
            // Chi cho mo trang cua he thong thi; link ra ngoai bi chan (khong mo trinh duyet khac)
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return request?.url?.host != examHost
            }

        }

        // BAT BUOC de hien hop thoai alert / confirm cua trang (vd: "Ban chac chan muon nop bai?").
        // Khong co -> WebView tu tra "Huy" cho moi confirm -> bam Nop bai khong co tac dung.
        webView.webChromeClient = WebChromeClient()

        // Chi ghim / khoa man hinh khi hoc sinh bam vao de (exam.js goi KioskBridge.startLock),
        // nop bai xong tu bo ghim (KioskBridge.unlock)

        webView.loadUrl(examUrl)
    }

    // ---------------------------------------------------------------- Giu ghim man hinh khi dang thi
    // App cai thuong (khong phai Device Owner): Android luon cho go ghim (giu Quay lai + Da nhiem / vuot len giu).
    // Dang lam bai (KioskManager.wasActive) ma bi go ghim -> bao trang (che bai, tinh roi bai) va TU HOI GHIM LAI.
    // Chi het ghim khi trang goi KioskBridge.unlock / stopLock: nop bai xong hoac giam thi nhap mat khau thoat.
    private val handler = Handler(Looper.getMainLooper())
    private var lastPinned: Boolean? = null
    private var lastPinRequest = 0L

    private val pinWatch = object : Runnable {
        override fun run() {
            checkPin()
            handler.postDelayed(this, 1000)
        }
    }

    override fun onResume() {
        super.onResume()
        handler.removeCallbacks(pinWatch)
        handler.post(pinWatch)
    }

    override fun onPause() {
        handler.removeCallbacks(pinWatch)
        super.onPause()
    }

    private fun checkPin() {
        if (!KioskManager.wasActive(this)) {
            lastPinned = null
            return
        }
        val pinned = isPinned()
        if (pinned != lastPinned) {
            lastPinned = pinned
            notifyWeb(if (pinned) "pinned" else "unpinned")
        }
        // Chua ghim + app dang duoc chon (khong co hop "Ghim ung dung?" dang hien) -> hoi ghim lai, toi da 4 giay / lan
        val now = SystemClock.elapsedRealtime()
        if (!pinned && hasWindowFocus() && now - lastPinRequest > 4000) {
            lastPinRequest = now
            KioskManager.startLock(this)
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
        // Dang lam bai (da ghim): mat tieu diem = bam vao bong bong chat / keo thanh thong bao / cua so app khac.
        // Chua ghim xong (hop "Ghim ung dung?" cua he thong) thi bo qua.
        if (KioskManager.wasActive(this) && isPinned()) notifyWeb(if (hasFocus) "focus" else "blur")
    }

    // Cua so noi cua app khac (bong bong chat, loc anh sang xanh...) dang de len man hinh bai thi:
    // Android danh dau moi lan cham "bi che". Dang lam bai -> khong cho cham vao bai thi, bao trang hien man che.
    // (Android 12+ da an cua so noi bang setHideOverlayWindows, nen chu yeu co tac dung voi Android 8-11.)
    private var swallowGesture = false

    override fun dispatchTouchEvent(ev: MotionEvent): Boolean {
        if (ev.actionMasked == MotionEvent.ACTION_DOWN) {
            swallowGesture = KioskManager.wasActive(this) && isObscured(ev)
            if (swallowGesture) notifyWeb("overlay")
        }
        if (swallowGesture) {
            if (ev.actionMasked == MotionEvent.ACTION_UP || ev.actionMasked == MotionEvent.ACTION_CANCEL) swallowGesture = false
            return true
        }
        return super.dispatchTouchEvent(ev)
    }

    // Chia doi man hinh / cua so nho (manifest da cam resizeableActivity, may nao van cho thi bao trang)
    @Deprecated("Deprecated in Java")
    override fun onMultiWindowModeChanged(isInMultiWindowMode: Boolean) {
        @Suppress("DEPRECATION")
        super.onMultiWindowModeChanged(isInMultiWindowMode)
        if (KioskManager.wasActive(this)) notifyWeb(if (isInMultiWindowMode) "split" else "split-off")
    }

    private fun isObscured(ev: MotionEvent): Boolean {
        var mask = MotionEvent.FLAG_WINDOW_IS_OBSCURED
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) mask = mask or MotionEvent.FLAG_WINDOW_IS_PARTIALLY_OBSCURED
        return (ev.flags and mask) != 0
    }

    private fun isPinned(): Boolean {
        val am = getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
        return am.lockTaskModeState != ActivityManager.LOCK_TASK_MODE_NONE
    }

    // Gui su kien cho trang thi (lockdown.js nghe "safeexam-native")
    private fun notifyWeb(type: String) {
        if (!::webView.isInitialized) return
        webView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('safeexam-native',{detail:{type:'$type'}}))", null
        )
    }

    // An thanh trang thai + thanh dieu huong (toan man hinh)
    @Suppress("DEPRECATION")
    private fun hideSystemBars() {
        window.decorView.systemUiVisibility = (View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            or View.SYSTEM_UI_FLAG_FULLSCREEN
            or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
            or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN)
    }

    // Chan nut Back vat ly cua he dieu hanh
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Khong lam gi ca de chan thoat ra ngoai
    }
}
