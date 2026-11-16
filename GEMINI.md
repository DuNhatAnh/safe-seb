# BẢN HỢP ĐỒNG PHÁT TRIỂN DỰ ÁN (PROJECT CONTRACT)
> **Dự án**: Safe Exam Browser / Kiểm tra bài thi an toàn (Khóa màn hình & Ngăn thoát sau khi nộp bài)
> **Phạm vi áp dụng**: Luôn kích hoạt cho Agent trong mọi lần đọc, lập kế hoạch và viết code tại workspace này.

---

## 🎯 1. MỤC TIÊU CỐT LÕI CỦA DỰ ÁN
Xây dựng giải pháp thi an toàn (Kiosk / Exam Lockdown mode) với cơ chế nghiêm ngặt:
- Ngăn chặn thí sinh tự ý thoát, đóng ứng dụng, chuyển tab hoặc can thiệp hệ thống trước và **ngay cả sau khi đã hoàn thành/nộp bài thi**.
- Chỉ cho phép thoát hoặc mở khóa màn hình khi có **xác thực từ Giám thị (Proctor Unlock Key / Master Passcode)** hoặc tín hiệu giải phóng phòng thi từ máy chủ giám sát.
- Đảm bảo **an toàn dữ liệu tuyệt đối (Zero Data Loss)**: Không để xảy ra tình trạng mất bài thi vì sự cố mạng hoặc lỗi giao diện.

---

## 📜 2. BỘ 3 SKILL BẮT BUỘC & QUY TẮC THI CÔNG

Bất kỳ khi nào Agent thực hiện phân tích, lập kế hoạch, viết mã hoặc review code, BẮT BUỘC phải đồng thời tuân thủ 3 trụ cột kỹ năng sau:

```
[ Lập trình tối giản & Native First ] ---> (ponytail)
[ Trải nghiệm & Trực quan phòng thi ] ---> (ui-ux-pro-max)
[ An toàn dữ liệu & Chống Bypass   ] ---> (senior-code-reviewer)
```

---

### 🛡️ Trụ cột 1: `ponytail` (Tư duy tối giản - Native First - YAGNI)
1. **Không over-engineering**: Giải pháp tốt nhất là giải pháp ngắn gọn, đơn giản, ít tầng trừu tượng nhất mà giải quyết triệt để vấn đề.
2. **Native APIs trước tiên**: 
   - Ưu tiên sử dụng API gốc của nền tảng (Web Fullscreen API, Pointer Lock API, `beforeunload`, `navigator.keyboard.lock()`, Electron `setKiosk(true)`, `globalShortcut`) trước khi nghĩ đến cài thêm thư viện npm nặng nề.
3. **Không boilerplate thừa**: Viết code trực diện, không tạo trước các abstraction/interface khi chưa có từ 3 use-case thực tế.

---

### 🎨 Trụ cột 2: `ui-ux-pro-max` (Thiết kế phòng thi & Trạng thái khóa)
1. **Màn hình khóa sau nộp bài (Lockout / Completion State)**:
   - Thể hiện rõ ràng: Đã nộp bài thành công (Mã bài thi, dấu thời gian Timestamp chính xác).
   - Tránh gây hoảng loạn: Thông báo rõ ràng *"Bài thi đã được ghi nhận an toàn. Vui lòng giữ nguyên màn hình và đợi giám thị mở khóa để rời phòng thi."*
2. **Cơ chế mở khóa cho Giám thị (Proctor Gate)**:
   - Form nhập mã mở khóa của giám thị (Proctor Master Code) thiết kế ẩn hoặc kích hoạt qua hotkey đặc biệt/nút bấm bảo mật, giao diện nhập liệu rõ ràng, có rate-limiting chống brute-force.
3. **Phản hồi vi phạm & Cảnh báo**:
   - Khi thí sinh cố tình nhấn phím tắt cấm hoặc click ra ngoài: Hiển thị toast/overlay cảnh báo vi phạm ngắn gọn, ghi nhận log sự kiện vi phạm vào lịch sử bài thi.

---

### 🔒 Trụ cột 3: `senior-code-reviewer` (Toàn vẹn dữ liệu & Chống Bypass)
1. **Quy tắc vàng "Lưu trước - Khóa sau"**:
   - **TUYỆT ĐỐI KHÔNG** khóa cứng màn hình nếu trạng thái nộp bài chưa nhận được phản hồi xác nhận thành công từ Backend (`HTTP 200 / ACK OK`).
   - Nếu nộp bài gặp lỗi mạng: Giữ nguyên trạng thái bài làm trong bộ nhớ an toàn (Encrypted LocalStorage / IndexedDB), kích hoạt cơ chế retry tự động và cung cấp phương án cho giám thị trích xuất dữ liệu khẩn cấp.
2. **Chống Bypass & Gian lận**:
   - Chặn các phím tắt nguy hiểm: `F12`, `Ctrl+Shift+I` / `Cmd+Option+I` (DevTools), `F11` (Thoát fullscreen), `Alt+Tab`, `Cmd+Tab`, `Cmd+Q`, `Ctrl+W`.
   - Vô hiệu hóa chuột phải (Context Menu), Copy/Paste, Print (`Ctrl+P`).
   - Lắng nghe sự kiện `visibilitychange` và `window.blur` để ghi nhận vi phạm khi có hành vi rời màn hình.
3. **Xử lý lỗi & Tránh Deadlock**:
   - Luôn có cơ chế Fallback (Mã cứu hộ khẩn cấp offline) để giám thị có thể can thiệp nếu hệ thống gặp sự cố mất điện/mất mạng đột ngột.
   - Code phải có try/catch đúng phạm vi, không nuốt lỗi (swallow errors), log rõ ràng trạng thái chuyển đổi máy trạng thái (State Machine: `IN_PROGRESS` -> `SUBMITTING` -> `SUBMITTED_CONFIRMED` -> `LOCKED` -> `RELEASED`).

---

## 🚀 3. QUY TRÌNH LÀM VIỆC MẶC ĐỊNH
Mỗi khi Agent nhận yêu cầu code tính năng mới trong dự án này:
1. **Bước 1 (Lập kế hoạch)**: Phân tích luồng nghiệp vụ và trạng thái (State Machine), kiểm tra các kịch bản ngoại lệ (rớt mạng, tắt ngang).
2. **Bước 2 (Viết code)**: Viết code theo phong cách `ponytail` (ngắn gọn, chuẩn native API).
3. **Bước 3 (Giao diện)**: Áp dụng quy chuẩn UI/UX của `ui-ux-pro-max` cho trải nghiệm phòng thi chuyên nghiệp.
4. **Bước 4 (Tự kiểm tra)**: Chạy checklist của `senior-code-reviewer` trước khi bàn giao code cho người dùng.
