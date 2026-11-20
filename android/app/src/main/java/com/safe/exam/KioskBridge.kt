package com.safe.exam

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.webkit.JavascriptInterface

/**
 * Cau noi JavaScript (window.KioskBridge) cho trang web cua he thong thi.
 * WebView chi mo trang cua he thong (MainActivity chan link ra ngoai), nen chi trang thi goi duoc cac ham nay.
 */
class KioskBridge(private val activity: Activity) {

    /** exam.js goi khi bat dau lam bai. */
    @JavascriptInterface
    fun startLock() {
        activity.runOnUiThread { KioskManager.startLock(activity) }
    }

    /** exam.js goi khi nop bai xong: bo ghim man hinh nhung van o lai app (xem ket qua, thoat khong can ma). */
    @JavascriptInterface
    fun unlock() {
        activity.runOnUiThread { KioskManager.stopLock(activity) }
    }

    /** exam.js goi khi thoat: thoat khan cap (da xac nhan ma giam thi) hoac nut Thoat sau khi nop. */
    @JavascriptInterface
    fun stopLock() {
        activity.runOnUiThread {
            KioskManager.stopLock(activity)
            activity.finish()
        }
    }

    /**
     * Ung dung tro nang dang bat (doc man hinh, tu bam, giai bai bang AI...): ten goi, cach nhau dau phay.
     * lockdown.js ghi vao nhat ky khi bat dau lam bai de admin xem (co app tro nang hop le nen khong tinh vi pham).
     */
    @JavascriptInterface
    fun accessibilityServices(): String {
        val enabled = android.provider.Settings.Secure.getString(
            activity.contentResolver, android.provider.Settings.Secure.ENABLED_ACCESSIBILITY_SERVICES
        ) ?: return ""
        return enabled.split(':').filter { it.isNotBlank() }
            .map { it.substringBefore('/') }
            .filter { it != activity.packageName }
            .distinct()
            .joinToString(", ")
    }

    /**
     * Trang bao app da cu: mo link tai app moi (/tai-app) bang trinh duyet cua may
     * (WebView chan link ra ngoai). Chi mo link https cua chinh he thong thi.
     */
    @JavascriptInterface
    fun openDownload(url: String) {
        val uri = Uri.parse(url)
        if (uri.scheme != "https" || uri.host != Uri.parse(BuildConfig.EXAM_URL).host) return
        activity.runOnUiThread {
            KioskManager.stopLock(activity)
            try {
                activity.startActivity(Intent(Intent.ACTION_VIEW, uri).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    /** Phien ban app, hien o cuoi trang: "v1.1" (file VERSION luc build). */
    @JavascriptInterface
    fun appVersion(): String = "v${BuildConfig.VERSION_NAME}"

    /** Trang dang nhap hien nut "Go khoa thiet bi" khi app dang la Device Owner. */
    @JavascriptInterface
    fun isDeviceOwner(): Boolean = KioskManager.isDeviceOwner(activity)

    /** index.html goi SAU KHI server xac nhan mat khau quan tri: go han Device Owner, dong app. */
    @JavascriptInterface
    fun releaseDevice() {
        activity.runOnUiThread {
            KioskManager.release(activity)
            activity.finish()
        }
    }
}
