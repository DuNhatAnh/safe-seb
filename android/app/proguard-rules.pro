# Giu cac ham JavaScript goi duoc (window.KioskBridge.startLock / stopLock) khi build release co rut gon code
-keepclassmembers class com.safe.exam.KioskBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
