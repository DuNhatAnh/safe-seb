package com.safe.exam

import android.annotation.SuppressLint
import android.os.Bundle
import android.view.WindowManager
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.appcompat.app.AppCompatActivity

class MainActivity : AppCompatActivity() {

    private lateinit var webView: WebView

    // Thay doi thanh dia chi Vercel cua ban sau khi deploy
    // Mac dinh tro toi trang dang nhap he thong Safe Exam
    private val examUrl = "http://10.0.2.2:3000/index.html"

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        // Giu man hinh luon sang
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        setContentView(R.layout.activity_main)

        webView = findViewById(R.id.webView)

        val settings: WebSettings = webView.settings
        settings.javaScriptEnabled = true
        settings.domStorageEnabled = true
        settings.databaseEnabled = true
        settings.useWideViewPort = true
        settings.loadWithOverviewMode = true

        // Gan cau noi KioskBridge vao JavaScript
        webView.addJavascriptInterface(KioskBridge(this), "KioskBridge")

        webView.webViewClient = object : WebViewClient() {
            override fun onPageFinished(view: WebView?, url: String?) {
                super.onPageFinished(view, url)
                // Kich hoat khoa man hinh khi vao ung dung
                try {
                    startLockTask()
                } catch (e: Exception) {
                    e.printStackTrace()
                }
            }
        }

        webView.loadUrl(examUrl)
    }

    // Chan nut Back vat ly cua he dieu hanh
    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        // Khong lam gi ca de chan thoat ra ngoai
    }
}
