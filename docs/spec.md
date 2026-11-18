# BẢN ĐẶC TẢ YÊU CẦU KỸ THUẬT VÀ KIẾN TRÚC HỆ THỐNG (SPEC V2)

Dự án: Safe Exam System (safe-seb)
Ngày cập nhật: 18/11/2026
Mục đích: Bản đặc tả chi tiết toàn bộ luồng hoạt động, cấu trúc dữ liệu, giao diện và logic kỹ thuật của hệ thống kiểm tra bài thi an toàn.

---

## 1. TỔNG QUAN HỆ THỐNG VÀ CÔNG NGHỆ

### 1.1. Mục tiêu cốt lõi
- Xây dựng hệ thống thi trực tuyến có cơ chế khóa màn hình nghiêm ngặt (Kiosk Mode trên Android Native và Fullscreen trên trình duyệt web), ngăn chặn thí sinh thoát ứng dụng hoặc can thiệp hệ thống trong và sau khi hoàn thành bài thi.
- Đảm bảo an toàn dữ liệu tuyệt đối theo nguyên tắc "Lưu trước - Khóa sau": Dữ liệu bài làm phải được xác nhận lưu thành công trên Supabase trước khi thiết bị chuyển sang trạng thái khóa cứng.
- Phía thí sinh trên điện thoại đảm bảo tải nhẹ nhất (dưới 50 KB tải về, file cài đặt APK dưới 3 MB).
- Quản trị viên (Admin) nhập đề qua định dạng JSON chuẩn (tự động nhận diện tiêu đề, thời lượng làm bài), tạo/sửa câu hỏi thủ công kèm xem trước công thức toán học KaTeX, hỗ trợ câu trắc nghiệm và câu tự luận ngắn, xóa cứng đề thi, và theo dõi chi tiết toàn bộ nhật ký thao tác (Action Logs) của thí sinh.
- Toàn bộ giao diện tuân thủ quy chuẩn màu chủ đạo Xanh biển - Trắng, CSS tập trung tại một file duy nhất, không sử dụng icon hay emoji.

### 1.2. Công nghệ lựa chọn
- Giao diện người dùng (Frontend): HTML5, CSS3, JavaScript thuần (Vanilla JS), không dùng framework (React/Vue/Angular) hay build tool phức tạp.
- Công thức toán học: KaTeX tĩnh phiên bản 0.16.x được đóng gói trực tiếp trong thư mục `public/vendor/katex/`, hỗ trợ hoạt động offline và trong môi trường Kiosk nội bộ.
- Cơ sở dữ liệu và Backend: Giao tiếp trực tiếp với cơ sở dữ liệu Supabase qua REST API với Row Level Security (RLS). Server Node.js nội bộ đóng vai trò phục vụ static files và bảo vệ đường dẫn (chống Path Traversal).
- Ứng dụng di động (Android Client): Viết bằng ngôn ngữ Kotlin Native, nhúng WebView siêu nhẹ và kích hoạt trực tiếp API cấp hệ điều hành `startLockTask()` để khóa cứng thiết bị.

---

## 2. QUẢN TRỊ VIÊN (ADMIN PANEL)

Giao diện quản trị hoạt động trên máy tính của giám thị (`admin.html`), phục vụ các chức năng sau:

### 2.1. Đăng nhập và Xác thực
- Cơ chế đăng nhập 2 bước bảo mật:
  - Nhập tên tài khoản: Nếu nhập `admin`, hệ thống mới hiển thị ô nhập mật khẩu quản trị.
  - Mật khẩu mặc định: `admin@123`. Xác thực thành công lưu session bảo vệ trang quản trị.

### 2.2. Nhập đề thi bằng JSON
- Hỗ trợ nhập trực tiếp mảng câu hỏi hoặc đối tượng JSON chứa thông tin tiêu đề và thời lượng:
```json
{
  "title": "Đề thi Toán 11 học kỳ 1",
  "duration_minutes": 45,
  "questions": [
    {
      "type": "single",
      "question": "Tính giá trị của biểu thức $\\frac{1}{2} + \\frac{1}{4}$",
      "options": [
        { "text": "$\\frac{3}{4}$", "is_correct": true },
        { "text": "$\\frac{2}{6}$", "is_correct": false },
        { "text": "$1$", "is_correct": false }
      ]
    },
    {
      "type": "short",
      "question": "Tính $\\sqrt{16} \\div 8$",
      "answer_kind": "number",
      "answers": ["1/2", "0.5", "0,5"]
    }
  ]
}
```
- Tự động điền tiêu đề (`title`) và thời lượng (`duration_minutes`) vào các ô nhập liệu khi import JSON.
- Cơ chế tự sửa dấu gạch chéo ngược LaTeX: Tự động nhân đôi dấu `\` trước các từ khóa toán học (như `\frac` thành `\\frac`, `\sqrt` thành `\\sqrt`) để chống lỗi ký tự điều khiển trong JSON parser.
- Modal Quy tắc định dạng (`#rulesModal`): Hiển thị bảng tra cứu công thức KaTeX kèm nút sao chép mẫu định dạng tiện lợi.

### 2.3. Tạo và Chỉnh sửa câu hỏi thủ công
- Modal thêm/sửa câu hỏi (`#questionModal`):
  - Hỗ trợ chuyển đổi giữa câu Trắc nghiệm (`type: single`) và Tự luận ngắn (`type: short`).
  - Ô nhập nội dung câu hỏi kèm khung xem trước công thức KaTeX trực tiếp theo thời gian thực.
  - Câu trắc nghiệm: Cho phép thêm từ 2 đến 6 phương án, chọn đáp án đúng bằng nút chọn radio.
  - Câu tự luận ngắn: Chọn kiểu đáp án (Số hoặc Chữ), nhập danh sách các đáp án chấp nhận (mỗi dòng một đáp án). Với kiểu Số, tự động kiểm tra cú pháp hợp lệ bằng `parseNumber`.
- Hỗ trợ Sửa hoặc Xóa từng câu hỏi trực tiếp trên danh sách xem trước (Preview).
- Nút "Hủy đề đang nhập" giúp xóa trắng toàn bộ danh sách câu hỏi đang soạn thảo và đặt lại biểu mẫu.

### 2.4. Xuất bản và Quản lý danh sách đề thi
- Xuất bản đề thi lên Supabase: Lưu thông tin đề thi và toàn bộ mảng câu hỏi có cấu trúc vào bảng `exams`.
- Danh sách đề thi đã tạo: Hiển thị mã đề, tên đề thi, thời gian làm bài, ngày tạo.
- Xóa cứng đề thi: Cung cấp nút "Xóa" cho từng đề thi trong danh sách. Khi quản trị viên xác nhận, hệ thống gửi lệnh `DELETE` trực tiếp lên Supabase để xóa vĩnh viễn đề thi khỏi cơ sở dữ liệu.

### 2.5. Theo dõi kết quả và Nhật ký thao tác (Audit Logs)
- Danh sách kết quả nộp bài: Hiển thị tên thí sinh, điểm số (/10), tổng số câu hỏi, thời lượng làm bài thực tế, thời điểm nộp bài.
- Modal xem chi tiết kết quả:
  - Chi tiết từng câu trả lời của thí sinh (câu trắc nghiệm hiển thị phương án chọn, câu tự luận hiển thị giá trị điền) kèm đánh giá Đúng/Sai.
  - Toàn bộ nhật ký thao tác (Action Logs): Mốc thời gian chính xác, loại thao tác (`BAT_DAU`, `CHON_DAP_AN`, `DOI_DAP_AN`, `NHAP_DAP_AN`, `ROI_MAN_HINH`, `QUAY_LAI`, `MAT_TIEU_DIEM`, `HET_GIO`, `NOP_BAI`).

---

## 3. GIAO DIỆN THÍ SINH (EXAM CLIENT)

Giao diện thí sinh (`exam.html`) được thiết kế tối ưu kép: Hoạt động trơn tru trên trình duyệt web và bên trong ứng dụng Android Kiosk Mode.

### 3.1. Cơ chế Tải chậm (Lazy Load)
- Khi thí sinh đăng nhập: Nạp danh sách các đề thi hiện có (chỉ lấy mã, tiêu đề, thời lượng).
- Khi thí sinh bấm "Vào làm bài": Mới tải chi tiết nội dung câu hỏi của đề thi đã chọn về bộ nhớ máy, tiết kiệm tối đa băng thông và đảm bảo tính bảo mật.

### 3.2. Quá trình làm bài thi
- Kích hoạt Kiosk Mode: Trên ứng dụng Android, gọi `window.KioskBridge.startLock()` để khóa phím cứng, thanh thông báo và cử chỉ. Trên trình duyệt web, tự động bật chế độ toàn màn hình.
- Hiển thị nội dung câu hỏi và công thức toán học: Mọi công thức KaTeX trong đề bài và các phương án đều được hiển thị sắc nét bằng engine KaTeX tĩnh.
- Câu trắc nghiệm (`single`): Giao diện phương án dạng nút cảm ứng lớn, đổi màu xanh khi chọn.
- Câu tự luận ngắn (`short`):
  - Hiển thị ô nhập văn bản (kích hoạt `inputmode="decimal"` nếu là kiểu Số).
  - Khung xem trước KaTeX trực tiếp bên dưới ô nhập giúp thí sinh kiểm tra lại cách hiển thị đáp án.
  - Kiểm tra tính hợp lệ trực tiếp (Debounce 300ms): Nếu là kiểu Số, kiểm tra bằng hàm `parseNumber`. Nếu sai định dạng (ví dụ nhập `3//4`), viền đỏ cảnh báo và không tính vào số câu đã trả lời.
  - Chấm điểm số tương đương: Tự động công nhận các dạng biểu diễn tương đương của cùng một số (ví dụ: `3/4` = `0.75` = `0,75` = `6/8`).
- Lưu trữ nháp an toàn (Offline Draft): Mọi thao tác làm bài được lưu tự động vào `localStorage` kèm mốc thời hạn `deadline`. Nếu bị tắt nguồn hoặc tải lại trang, bài làm và thời gian còn lại sẽ được khôi phục nguyên vẹn.
- Bộ đếm thời gian: Tính toán chính xác theo mốc deadline tuyệt đối (`deadline - Date.now()`), không bị ảnh hưởng khi tab trình duyệt bị throttle trong nền.

### 3.3. Cơ chế Nộp bài và Khóa an toàn ("Lưu trước - Khóa sau")
1. Thí sinh bấm "Nộp bài" hoặc đồng hồ đếm ngược về 00:00.
2. Kiểm tra xác nhận: Nhắc nhở số câu đã trả lời và cảnh báo nếu còn câu chưa làm hoặc sai định dạng.
3. Chấm điểm tự động và gửi gói dữ liệu lên Supabase qua REST API.
4. Kiểm tra phản hồi từ Supabase:
   - Nếu gặp lỗi kết nối hoặc mất mạng: Giữ nguyên toàn bộ bài làm, thông báo lỗi mạng và cho phép thí sinh bấm "Thử nộp lại". Tuyệt đối không khóa máy để tránh làm mất bài của thí sinh.
   - Nếu Supabase xác nhận lưu thành công (HTTP 201/200): Xóa bộ nhớ tạm và chuyển sang màn hình Khóa an toàn.
5. Màn hình Khóa an toàn:
   - Hiển thị điểm số và thông báo bài thi đã nộp thành công.
   - Khóa cứng màn hình, chỉ cho phép mở khóa khi giám thị nhập đúng mật khẩu bảo vệ (`PROCTOR_UNLOCK_PASSWORD`).

---

## 4. CẤU TRÚC DỮ LIỆU SUPABASE

### 4.1. Bảng `exams` (Quản lý đề thi)
```sql
create table if not exists exams (
  id bigint generated by default as identity primary key,
  title text not null,
  duration_minutes int default 45,
  assigned_to text default 'all',
  questions jsonb not null default '[]'::jsonb,
  created_at timestamp with time zone default now()
);
```

### 4.2. Bảng `exam_results` (Kết quả thi và Nhật ký thao tác)
```sql
create table if not exists exam_results (
  id bigint generated by default as identity primary key,
  exam_id bigint references exams(id) on delete set null,
  student_name text not null,
  score numeric not null,
  total_questions int not null,
  duration_minutes int not null,
  answers jsonb default '[]'::jsonb,
  action_logs jsonb default '[]'::jsonb,
  submitted_at timestamp with time zone default now()
);
```

---

## 5. NGUYÊN TẮC THIẾT KẾ GIAO DIỆN VÀ MÃ NGUỒN

1. Tối giản tối đa (Ponytail & DRY):
   - Không sử dụng thư viện ngoài nếu API thuần đáp ứng được.
   - Toàn bộ giao diện tập trung tại `public/css/style.css` với bảng màu chuẩn: Xanh biển (`#1d4ed8`), Trắng (`#ffffff`), Nền xám nhạt (`#f8fafc`).
   - Tuyệt đối không sử dụng icon hay emoji ở bất kỳ đâu trên giao diện và mã nguồn.
2. Chuẩn hóa tiếng Việt:
   - Toàn bộ văn bản giao diện người dùng có đầy đủ dấu câu tiếng Việt chuẩn xác.
3. Bảo vệ dữ liệu và đường dẫn:
   - Server Node.js chuẩn hóa đường dẫn với `path.normalize`, chặn hoàn toàn Path Traversal.
