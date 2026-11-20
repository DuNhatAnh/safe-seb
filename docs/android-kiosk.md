# App Android: cài về máy rồi làm bài

## Cách dùng (không cần cài đặt gì)

1. Trên điện thoại Android, mở trang đăng nhập hệ thống thi → bấm **Tải app Safe Exam (.apk)**
   (hoặc mở thẳng link: https://github.com/DuNhatAnh/safe-seb/releases/download/apk-latest/safe-exam.apk).
2. Mở file vừa tải → **Cài đặt** (nếu được hỏi, cho phép cài từ "nguồn không xác định").
3. Mở app **Safe Exam** → khi Android hỏi **"Ghim ứng dụng?"** bấm **Ghim / OK** → đăng nhập, làm bài.

Khi đã ghim: không có Home, đa nhiệm, thanh thông báo. Học sinh vẫn có thể gỡ ghim (giữ Back + đa nhiệm), nhưng
**rời khỏi app là bài thi bị khoá ngay**, chỉ giám thị nhập mật khẩu đề (mật khẩu chung hoặc mật khẩu riêng của đề) mới làm tiếp. Mọi lần khoá / mở khoá đều ghi nhật ký cho admin.

File `.apk` do GitHub tự build mỗi khi code trong `android/` thay đổi (`.github/workflows/android-apk.yml`).
Địa chỉ hệ thống thi trong app = biến `SAFE_EXAM_URL` (GitHub › Settings › Secrets and variables › Actions › Variables), không đặt thì lấy `safeExamUrl` trong `android/gradle.properties`.

---

# Tuỳ chọn: khoá cứng hẳn (Device Owner)

Khi app **Safe Exam** là *Device Owner* (chủ quản lý thiết bị), điện thoại bị khoá thật trong lúc mở app:

- Không có nút Home, đa nhiệm, thanh thông báo, menu giữ nút nguồn. **Không gỡ ghim được.**
- Cấm khởi động vào Safe mode, cấm khôi phục cài đặt gốc từ Cài đặt, cấm thêm người dùng.
- Học sinh giữ nút nguồn để khởi động lại máy giữa giờ thi → máy lên lại là **app tự mở**.
- Chặn chụp / quay màn hình; app chỉ mở trang của hệ thống thi.

Chỉ cần khi muốn chặn cả việc gỡ ghim. Không làm bước này thì app vẫn dùng bình thường theo cách ở trên.

## Yêu cầu

- Điện thoại **dùng riêng cho thi** (của trường), Android 9 trở lên (Android 8 vẫn khoá nhưng ít tuỳ chọn hơn).
- **Không có tài khoản nào trên máy** (Google, Samsung, Xiaomi...). Có tài khoản thì Android từ chối đặt Device Owner → gỡ hết tài khoản trong Cài đặt › Tài khoản, hoặc khôi phục cài đặt gốc rồi bỏ qua bước đăng nhập.
- Máy tính có Android Studio (đã kèm `adb` ở `%LOCALAPPDATA%\Android\Sdk\platform-tools\adb.exe`).

## Cài đặt (1 lần cho mỗi máy)

1. **Địa chỉ hệ thống thi**: sửa `safeExamUrl` trong [android/gradle.properties](../android/gradle.properties)
   (cùng Wi-Fi: `http://<IP máy tính>:3000/index.html`; đã deploy: `https://<tên-miền>/index.html`).
2. **Bật gỡ lỗi USB** trên điện thoại: Cài đặt › Thông tin điện thoại › bấm "Số hiệu bản tạo" 7 lần → Tuỳ chọn nhà phát triển › bật **Gỡ lỗi USB**.
   Xiaomi: bật thêm "Cài đặt qua USB" và "Gỡ lỗi USB (Cài đặt bảo mật)".
3. Cắm cáp USB, trên điện thoại chọn **Cho phép gỡ lỗi**.
4. **Cài app**: mở thư mục `android` bằng Android Studio, bấm ▶ **Run** (hoặc build APK rồi `adb install app-debug.apk`).
5. **Đặt Device Owner** (cửa sổ dòng lệnh trên máy tính):

   ```
   adb shell dpm set-device-owner com.safe.exam/.AdminReceiver
   ```

   Thành công sẽ in `Success: Device owner set to package com.safe.exam`.
   Báo lỗi *"already some accounts on the device"* → quay lại phần Yêu cầu, gỡ hết tài khoản.
6. Kiểm tra: `adb shell dpm list-owners` có dòng `com.safe.exam`. Rút cáp, mở app **Safe Exam**: màn hình bị khoá ngay.

## Dùng hằng ngày

| Việc | Cách làm |
|---|---|
| Học sinh thi | Mở app → đăng nhập → làm bài. Máy khoá suốt lúc app mở. |
| Thoát khẩn cấp (đang làm bài) | Giám thị nhập **mật khẩu đề**: mật khẩu chung hoặc mật khẩu riêng của đề (admin xem ở nút chìa khoá). Thí sinh về danh sách đề, app bỏ ghim màn hình. |
| Sau khi nộp | Không có nút thoát: chỉ **Xem lịch sử làm bài** / **Về trang đề thi**; màn hình đã bỏ ghim. |
| Thoát app khi chưa có ai thi | Màn đăng nhập › **Thoát ứng dụng (Quản trị)** › mật khẩu quản trị. |
| Trả điện thoại về bình thường | Màn đăng nhập › **Gỡ khoá thiết bị** › mật khẩu quản trị. Muốn khoá lại thì làm lại bước 5. |

Mật khẩu quản trị và mật khẩu đề đều do server kiểm tra (không lưu trong app). **Điện thoại phải có mạng** tới hệ thống thi mới thoát / gỡ khoá được.

## Khi kẹt (mất mạng, server hỏng, quên mật khẩu)

- Máy vẫn cắm được `adb` (bản cài bằng nút Run của Android Studio):
  `adb shell dpm remove-active-admin com.safe.exam/.AdminReceiver`
- Không còn cách nào khác: khôi phục cài đặt gốc bằng **phím cứng** (chế độ Recovery, thường là giữ Nguồn + Tăng âm lượng khi máy tắt). Cách này xoá toàn bộ dữ liệu trên máy.
