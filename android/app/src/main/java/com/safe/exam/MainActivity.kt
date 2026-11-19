package com.safe.exam

import android.annotation.SuppressLint
import android.net.Uri
import android.os.Bundle
import android.view.View
import android.view.WindowManager
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

        setContentView(R.layout.activity_main)
        hideSystemBars()

        webView = findViewById(R.id.webView)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true // ban nhap bai lam luu trong localStorage
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        // Gan cau noi KioskBridge vao JavaScript (exam.js goi startLock / stopLock)
        webView.addJavascriptInterface(KioskBridge(this), "KioskBridge")

        webView.webViewClient = object : WebViewClient() {
            // Chi cho mo trang cua he thong thi; link ra ngoai bi chan (khong mo trinh duyet khac)
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return request?.url?.host != examHost
            }

            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Kich hoat khoa man hinh (ghim ung dung) khi vao ung dung
                try {
                    startLockTask()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        webView.loadUrl(examUrl)
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemBars()
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
