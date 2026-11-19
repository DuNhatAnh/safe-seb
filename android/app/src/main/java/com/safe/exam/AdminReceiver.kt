package com.safe.exam

import android.app.admin.DeviceAdminReceiver

/**
 * Thanh phan quan tri thiet bi. Dat app lam Device Owner (1 lan, may chua co tai khoan nao):
 *   adb shell dpm set-device-owner com.safe.exam/.AdminReceiver
 */
class AdminReceiver : DeviceAdminReceiver()
