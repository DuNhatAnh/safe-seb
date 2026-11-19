package com.safe.exam

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

/**
 * Hoc sinh giu nut nguon de khoi dong lai may giua gio thi -> khoi dong xong mo lai app ngay.
 * (App Device Owner duoc phep mo man hinh tu nen; app thuong tren Android 10+ thi khong.)
 */
class BootReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != Intent.ACTION_BOOT_COMPLETED) return
        if (!KioskManager.wasActive(context)) return
        context.startActivity(
            Intent(context, MainActivity::class.java).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        )
    }
}
