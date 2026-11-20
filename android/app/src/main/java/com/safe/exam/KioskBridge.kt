package com.safe.exam

import android.app.Activity
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
