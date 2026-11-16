package com.safe.exam

import android.app.Activity
import android.webkit.JavascriptInterface

class KioskBridge(private val activity: Activity) {

    @JavascriptInterface
    fun startLock() {
        activity.runOnUiThread {
            try {
                activity.startLockTask()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }

    @JavascriptInterface
    fun stopLock() {
        activity.runOnUiThread {
            try {
                activity.stopLockTask()
                activity.finish()
            } catch (e: Exception) {
                e.printStackTrace()
            }
        }
    }
}
