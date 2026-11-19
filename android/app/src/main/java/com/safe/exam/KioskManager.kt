package com.safe.exam

import android.app.Activity
import android.app.admin.DevicePolicyManager
import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.os.UserManager

/**
 * Khoa cung thiet bi khi app la Device Owner (dat 1 lan bang adb, xem docs/android-kiosk.md).
 *
 * - Lock task THAT: khong Home, khong da nhiem, khong thanh thong bao, khong menu nguon,
 *   khong go ghim duoc. Khong phai Device Owner thi chi la "ghim man hinh" (go duoc).
 * - Han che thiet bi: cam Safe mode (app khong chay -> thoat duoc), cam khoi phuc cai dat goc
 *   tu Cai dat (se xoa quyen Device Owner), cam them nguoi dung.
 * - Dang thi ma may bi khoi dong lai -> BootReceiver mo lai app (wasActive).
 */
object KioskManager {
    private const val PREFS = "safe_exam_kiosk"
    private const val KEY_ACTIVE = "exam_active"

    private val RESTRICTIONS = listOf(
        UserManager.DISALLOW_SAFE_BOOT,
        UserManager.DISALLOW_FACTORY_RESET,
        UserManager.DISALLOW_ADD_USER
    )

    private fun dpm(context: Context): DevicePolicyManager =
        context.getSystemService(Context.DEVICE_POLICY_SERVICE) as DevicePolicyManager

    private fun admin(context: Context) = ComponentName(context, AdminReceiver::class.java)

    private fun prefs(context: Context) = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun isDeviceOwner(context: Context): Boolean = dpm(context).isDeviceOwnerApp(context.packageName)

    /** Goi khi app mo: cho phep app chay lock task that + bat cac han che thiet bi. */
    fun applyPolicies(context: Context) {
        if (!isDeviceOwner(context)) return
        val dpm = dpm(context)
        val admin = admin(context)
        dpm.setLockTaskPackages(admin, arrayOf(context.packageName))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            // Tat het: Home, da nhiem, thanh thong bao, menu giu nut nguon, man hinh khoa he thong
            dpm.setLockTaskFeatures(admin, DevicePolicyManager.LOCK_TASK_FEATURE_NONE)
        }
        RESTRICTIONS.forEach { dpm.addUserRestriction(admin, it) }
    }

    /** Vao che do khoa. Device Owner: khoa that, khong hoi. Khong phai: Android hoi "Ghim ung dung?". */
    fun startLock(activity: Activity) {
        prefs(activity).edit().putBoolean(KEY_ACTIVE, true).apply()
        try {
            activity.startLockTask()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /** Ra khoi che do khoa (giam thi da nhap dung ma, server xac nhan). */
    fun stopLock(activity: Activity) {
        prefs(activity).edit().putBoolean(KEY_ACTIVE, false).apply()
        try {
            activity.stopLockTask()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    /** Dang khoa thi may bi tat / khoi dong lai -> mo lai app khi khoi dong xong. */
    fun wasActive(context: Context): Boolean = prefs(context).getBoolean(KEY_ACTIVE, false)

    /** Go han Device Owner, tra dien thoai ve binh thuong (chi goi sau khi da xac thuc mat khau quan tri). */
    fun release(activity: Activity): Boolean {
        if (!isDeviceOwner(activity)) return false
        val dpm = dpm(activity)
        val admin = admin(activity)
        stopLock(activity)
        RESTRICTIONS.forEach { dpm.clearUserRestriction(admin, it) }
        dpm.setLockTaskPackages(admin, arrayOf<String>())
        @Suppress("DEPRECATION")
        dpm.clearDeviceOwnerApp(activity.packageName)
        return true
    }
}
