# BẢN ĐẶC TẢ YÊU CẦU KỸ THUẬT VÀ KIẾN TRÚC HỆ THỐNG (SPEC)

Dự án: Safe Exam System (safe-seb)
Ngày cập nhật: 17/11/2026
Mục đích: Bản đặc tả chi tiết toàn bộ luồng hoạt động, cấu trúc dữ liệu, giao diện và logic kỹ thuật của hệ thống kiểm tra bài thi an toàn.

---

## 1. TỔNG QUAN HỆ THỐNG VÀ CÔNG NGHỆ

### 1.1. Mục tiêu cốt lõi
- Xây dựng hệ thống thi trắc nghiệm có cơ chế khóa màn hình nghiêm ngặt, ngăn chặn thí sinh thoát ứng dụng hoặc can thiệp hệ thống trong và sau khi hoàn thành bài thi.
- Đảm bảo an toàn dữ liệu tuyệt đối theo nguyên tắc "Lưu trước - Khóa sau": Dữ liệu bài làm phải được xác nhận lưu thành công trên máy chủ trước khi thiết bị chuyển sang trạng thái khóa cứng.
- Phía thí sinh trên điện thoại đảm bảo tải nhẹ nhất (dưới 40 KB dữ liệu tải về, file cài đặt APK dưới 3 MB).
- Phía quản trị viên (Admin) hỗ trợ tiếp nhận đề thi tự động qua định dạng PDF chuẩn hoặc JSON, phân quyền làm bài và theo dõi chi tiết toàn bộ nhật ký thao tác của thí sinh sau khi hoàn thành.

### 1.2. Công nghệ lựa chọn
- Giao diện người dùng (Frontend): HTML5, CSS3, JavaScript thuần (Vanilla JS). Không sử dụng các thư viện hay framework cồng kềnh như React hoặc Vue nhằm tối ưu hóa bộ nhớ và tốc độ nạp trang.
- Xử lý máy chủ (Backend): Chạy trên nền tảng Vercel Serverless Function kết hợp giao tiếp trực tiếp với cơ sở dữ liệu Supabase qua REST API.
- Ứng dụng di động (Android Client): Viết bằng ngôn ngữ Kotlin Native, nhúng WebView siêu nhẹ và kích hoạt trực tiếp API cấp hệ điều hành `startLockTask()` để khóa cứng thiết bị.

---

## 2. QUẢN TRỊ VIÊN (ADMIN PANEL)

Giao diện quản trị hoạt động trên máy tính của giám thị, phục vụ các chức năng sau:

### 2.1. Tiếp nhận đề thi (Upload Đề)
Hệ thống hỗ trợ 2 định dạng đầu vào:
1. File JSON:
   - Dữ liệu có cấu trúc câu hỏi rõ ràng.
   - Các phương án trả lời được đánh dấu thuộc tính `is_correct: true` cho đáp án đúng.
   - Nạp trực tiếp vào hệ thống ngay lập tức mà không cần xử lý bóc tách.
2. File PDF chuẩn (Digital PDF):
   - Tiếp nhận file PDF số chuẩn (văn bản vector rõ nét, không phải chữ viết tay hay ảnh chụp mờ).
   - Backend sử dụng thư viện bóc tách luồng văn bản sạch từ file PDF.
   - Nhận diện các ký tự đáp án có vòng tròn bao quanh (dạng ký tự vòng tròn chuẩn như Ⓐ, Ⓑ, Ⓒ, Ⓓ hoặc nét vẽ hình tròn bao quanh chữ cái) để tự động xác định đáp án đúng `is_correct: true`.
   - Hiển thị danh sách câu hỏi đã bóc tách trên màn hình để Admin xem lại và xác nhận.

### 2.2. Cấu hình và Phân quyền đề thi
- Cài đặt thời gian làm bài: Thiết lập số phút làm bài riêng biệt cho từng đề thi (ví dụ: 15 phút, 45 phút, 60 phút).
- Phân quyền tài khoản: Chỉ định cụ thể tên tài khoản thí sinh được phép truy cập và làm đề thi đó.

### 2.3. Theo dõi kết quả và Nhật ký thao tác (Audit Logs)
Sau khi thí sinh hoàn thành bài thi, hệ thống hiển thị bảng chi tiết phục vụ công tác giám sát:
- Thông tin tổng quan: Tên thí sinh, tên đề thi, điểm số, số câu đúng trên tổng số câu, thời gian bắt đầu, thời gian nộp bài, tổng thời lượng hoàn thành.
- Chi tiết bài làm: Hiển thị từng câu hỏi, đáp án thí sinh đã chọn và đáp án chính xác.
- Nhật ký thao tác chi tiết trong lúc làm bài (Action Logs):
  - Thời điểm đánh dấu chọn từng câu hỏi.
  - Lịch sử thay đổi lựa chọn (nếu thí sinh đổi ý chọn sang đáp án khác).
  - Ghi nhận các sự kiện vi phạm hoặc bất thường: Thao tác rời khỏi tab, thu nhỏ cửa sổ, chạm ra ngoài vùng làm bài, hoặc các lần thử thoát ứng dụng.
- Lưu ý: Loại bỏ hoàn toàn tính năng xuất file CSV theo yêu cầu.

---

## 3. GIAO DIỆN THÍ SINH (EXAM CLIENT)

Giao diện thí sinh được thiết kế tối ưu kép: Chạy thử nghiệm trực tiếp trên trình duyệt Web và hoạt động chính thức bên trong ứng dụng Android Kiosk Mode.

### 3.1. Cơ chế Tải chậm (Lazy Load)
- Khi thí sinh đăng nhập: Hệ thống chỉ nạp danh sách tên các đề thi được phân quyền kèm thời gian làm bài quy định. Toàn bộ nội dung câu hỏi chưa được tải về máy.
- Khi thí sinh bấm "Bắt đầu làm bài": Hệ thống mới gửi yêu cầu nạp nội dung câu hỏi dạng JSON siêu nhẹ (khoảng 5 KB đến 10 KB) về máy, giúp tiết kiệm băng thông và chống lộ đề trước giờ thi.

### 3.2. Quá trình làm bài thi
- Kích hoạt chế độ kiểm soát: Ứng dụng Android tự động bật `startLockTask()` để vô hiệu hóa thanh thông báo, nút Home, nút Back và các cử chỉ vuốt của hệ điều hành. Khi chạy trên trình duyệt web, hệ thống tự động khóa toàn màn hình (Fullscreen).
- Đồng hồ đếm ngược: Hoạt động chính xác theo số phút đã được cấu hình trong đề thi. Tự động nộp bài khi thời gian về 00:00.
- Lưu trữ nháp an toàn (Offline Resilience): Mọi lựa chọn của thí sinh được lưu ngay lập tức vào bộ nhớ tạm `localStorage`. Nếu xảy ra sự cố sập nguồn hoặc tắt app đột ngột, toàn bộ tiến trình làm bài sẽ được phục hồi nguyên vẹn khi mở lại.
- Bộ ghi nhận thao tác (Action Tracker): Ghi lại toàn bộ dòng sự kiện kèm mốc thời gian chính xác (Timestamp) để gửi về máy chủ khi nộp bài.

### 3.3. Cơ chế Nộp bài và Khóa an toàn ("Lưu trước - Khóa sau")
1. Thí sinh bấm "Nộp bài" hoặc hết giờ làm bài.
2. Hệ thống tính điểm và gửi gói dữ liệu (Điểm số, câu trả lời, nhật ký thao tác) lên Supabase qua giao thức HTTPS.
3. Kiểm tra phản hồi từ Supabase:
   - Nếu gặp lỗi kết nối hoặc mất mạng: Giữ nguyên bài làm trên màn hình, hiển thị cảnh báo mất mạng kèm nút "Thử lại". Tuyệt đối không khóa máy để tránh làm mất bài của thí sinh.
   - Nếu Supabase phản hồi HTTP 201 (Xác nhận lưu thành công): Chuyển màn hình sang trạng thái Khóa an toàn.
4. Trạng thái Khóa an toàn:
   - Hiển thị thông báo lớn: "Bài thi đã được nộp thành công và lưu trên hệ thống. Thiết bị đang ở chế độ giám sát".
   - Khóa cứng màn hình, vô hiệu hóa mọi thao tác thoát.
   - Cung cấp ô nhập mật khẩu giám thị. Chỉ khi giám thị nhập đúng mã bảo mật `PROCTOR_UNLOCK_PASSWORD`, ứng dụng mới gọi `stopLockTask()` để giải phóng thiết bị về trạng thái sử dụng bình thường.

---

## 4. CẤU TRÚC DỮ LIỆU SUPABASE

### 4.1. Bảng `exams` (Quản lý đề thi)
- `id`: Định danh duy nhất (Khóa chính, tự tăng).
- `title`: Tên đề thi (Text).
- `duration_minutes`: Thời gian làm bài tính theo phút (Integer).
- `assigned_to`: Tên tài khoản thí sinh được làm (Text).
- `questions`: Dữ liệu câu hỏi và đáp án chuẩn định dạng JSONB.
- `created_at`: Thời gian tạo đề (Timestamp with time zone).

### 4.2. Bảng `exam_results` (Lịch sử làm bài và Nhật ký thao tác)
- `id`: Định danh duy nhất (Khóa chính, tự tăng).
- `exam_id`: Mã đề thi liên kết (Integer).
- `student_name`: Tên tài khoản thí sinh (Text).
- `score`: Điểm số đạt được (Numeric).
- `total_questions`: Tổng số câu hỏi trong đề (Integer).
- `answers`: Chi tiết các câu thí sinh đã chọn (JSONB).
- `action_logs`: Toàn bộ nhật ký thao tác, mốc thời gian chọn/đổi đáp án, sự kiện rời màn hình (JSONB).
- `submitted_at`: Thời điểm nộp bài thành công (Timestamp with time zone).

---

## 5. CẤU TRÚC THƯ MỤC MÃ NGUỒN DỰ KIẾN

```text
safe-seb/
├── .env                          # Biến môi trường bảo mật (Supabase, Mật khẩu giám thị)
├── .gitignore                    # Loại trừ các file bảo mật khỏi Git
├── spec.md                       # Bản đặc tả kỹ thuật và kiến trúc hệ thống
├── README.md                     # Hướng dẫn tổng quan dự án
├── vercel.json                   # Cấu hình triển khai trên Vercel
├── package.json                  # Khai báo các gói phụ thuộc backend
│
├── api/                          # BACKEND SERVERLESS (Chạy trên Vercel)
│   └── parse-pdf.js              # Xử lý đọc văn bản PDF chuẩn và nhận diện đáp án khoanh tròn
│
├── public/                       # FRONTEND (Web tĩnh chạy trên trình duyệt và WebView)
│   ├── index.html                # Màn hình đăng nhập phân quyền (Admin / Thí sinh)
│   │
│   ├── admin.html                # Bảng điều khiển quản trị viên
│   ├── admin.js                  # Logic xử lý PDF/JSON, cài đặt thời gian, xem kết quả và log
│   ├── admin.css                 # Giao diện quản trị hiển thị trên máy tính
│   │
│   ├── exam.html                 # Giao diện làm bài thi (Chạy thử web hoặc nạp vào Android)
│   ├── exam.js                   # Logic làm bài, Lazy Load, đếm giờ, ghi nhật ký, khóa màn hình
│   └── exam.css                  # Giao diện bài thi tối giản, tương thích hoàn hảo thiết bị di động
│
└── android/                      # CLIENT ANDROID NATIVE (APK dưới 3 MB)
    ├── build.gradle.kts          # Cấu hình Gradle tối giản
    └── src/main/
        ├── AndroidManifest.xml   # Khai báo quyền Kiosk Mode và toàn màn hình
        └── java/com/safe/exam/
            ├── MainActivity.kt   # Nạp WebView trỏ tới exam.html và quản lý startLockTask()
            └── KioskBridge.kt    # Cầu nối nhận lệnh khóa và mở khóa từ JavaScript
```
