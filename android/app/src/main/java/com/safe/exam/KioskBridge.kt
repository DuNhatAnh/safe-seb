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

    /** exam.js goi sau khi server xac nhan ma giam thi (thoat khan cap / thoat ung dung). */
    @JavascriptInterface
    fun stopLock() {
        activity.runOnUiThread {
            KioskManager.stopLock(activity)
            activity.finish()
        }
    }

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
