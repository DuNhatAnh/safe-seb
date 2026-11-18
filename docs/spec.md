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

### 2.2. Bố cục Sidebar
- Trang quản trị dùng sidebar trái gồm 3 mục: **Tạo đề thi**, **Định dạng cấu trúc đề**, **Kết quả & nhật ký**. Dưới 768px sidebar chuyển thành thanh ngang ở đầu trang.

### 2.3. Dạng câu hỏi và Cấu trúc đề
- Toàn bộ logic theo dạng câu (kiểm tra JSON, xem trước, form thêm/sửa, giao diện thí sinh, đọc đáp án, chấm điểm, hiển thị kết quả, quy tắc định dạng) nằm tập trung ở `public/js/question-types.js` (registry `QUESTION_TYPES`). Thêm dạng mới chỉ cần thêm 1 entry.
- 5 dạng có sẵn:

| `type` | Tên | Dữ liệu | Chấm |
|---|---|---|---|
| `single` | Trắc nghiệm | `options: [{text, is_correct}]`, 2–6 phương án, đúng 1 đáp án đúng | Đúng = đủ điểm câu |
| `true_false` | Trắc nghiệm đúng sai | `statements: [{text, is_true}]`, đúng 4 ý | Thang THPT: đúng 1/2/3/4 ý = 0,1 / 0,25 / 0,5 / 1 × điểm câu |
| `short_number` | Trắc nghiệm trả lời ngắn | `answer: "0,75"` (số, tối đa 4 ký tự) | So theo giá trị (`1/2` = `0,5`) |
| `essay` | Tự luận (tự chấm) | `answers: [...]` các đáp án chấp nhận | Số: so theo giá trị. Chữ: bỏ hoa/thường, khoảng trắng thừa |
| `essay_manual` | Tự luận (giáo viên chấm) | `solution` (tuỳ chọn) | Thí sinh làm trên giấy, giáo viên nhập điểm ở trang Kết quả |

- Trường chung mọi câu: `question` (bắt buộc), `points` (điểm riêng), `image` (hình vẽ: link hoặc ảnh dán vào form, được nén và nhúng vào đề). Nội dung hỗ trợ `$...$`, `$$...$$`, xuống dòng `\n`, dòng bắt đầu `- ` là gạch đầu dòng.
- Câu không có `type` được coi là `single`; câu `type: "short"` của đề cũ được đọc như `essay`.

### 2.3b. Mẫu cấu trúc đề (Phần I, II, III...)
- Trang **Định dạng cấu trúc đề** quản lý nhiều mẫu. Mỗi mẫu gồm các phần theo thứ tự, mỗi phần: dạng câu, số câu (0 = tuỳ ý), điểm mỗi câu. Hiển thị tổng điểm; tổng khác 10 thì quy về thang 10.
- Mẫu có sẵn **Toán THPT 2025**: I. Trắc nghiệm 12 × 0,25 · II. Đúng sai 2 × 1 · III. Trả lời ngắn 4 × 0,5 · IV. Tự luận (giáo viên chấm) 3 × 1 = 10 điểm.
- Mẫu lưu ở `app_settings` (key `exam_templates`); chưa có bảng thì tự lưu trên trình duyệt.
- Câu hỏi lưu phẳng trong `exams.questions`, mỗi câu có `part` (chỉ số phần) và `points`. Số La Mã và lời dẫn từng phần ("Thí sinh trả lời từ câu 1 đến câu 12...") sinh tự động; mỗi phần đánh số lại từ Câu 1.
- Điểm bài = tổng điểm đạt / tổng điểm tối đa × 10. Câu giáo viên chấm được đánh dấu `pending` cho tới khi có điểm.

### 2.4. Nhập đề thi bằng JSON
- Chọn mẫu cấu trúc, rồi dán JSON vào modal (không cần file): `{ "title", "duration_minutes", "parts": [{ "type", "questions": [...] }] }`. Vẫn nhận mảng câu hỏi phẳng (mỗi câu tự xếp vào phần cùng dạng). Tiêu đề và thời gian được tự điền.
- Thiếu số câu so với mẫu vẫn cho nhập (báo lỗi theo phần, khoá xuất bản) để bổ sung bằng nút **+** của phần đó.
- Tự sửa dấu `\` thiếu trước lệnh LaTeX (`\frac`, `\{`, `\,` → `\\frac`...) trước khi parse, nhưng giữ `\n` là xuống dòng.
- Lỗi được báo theo từng câu ngay trong modal, kể cả câu thuộc dạng chưa có trong cấu trúc đề.
- Modal **Quy tắc định dạng**: một khối văn bản duy nhất, sao chép bằng 1 nút. Sinh tự động từ mẫu đang chọn: các phần (số câu, điểm), khung JSON, quy tắc từng dạng, công thức toán, hướng dẫn chuyển từ đề PDF, JSON mẫu. Có thể dán khối này cùng file PDF đề vào ChatGPT/Claude để chuyển đề sang JSON.

### 2.5. Danh sách câu sau khi import
- Chỉ hiện sau khi đã import. Câu hỏi nhóm theo phần, có tiêu đề PHẦN I, II... kèm lời dẫn và số câu/yêu cầu; có nút **Huỷ import**.
- Mỗi câu có nút Sửa / Xoá. Cuối mỗi phần là nút **＋** để thêm câu thủ công vào phần đó (form theo dạng, xem trước KaTeX, chọn/dán hình vẽ, điểm câu).
- Câu hỏi chỉ nằm trong bộ nhớ trình duyệt, không lưu file. Nút xuất bản bị khoá khi còn lỗi.

### 2.6. Xuất bản và Quản lý danh sách đề thi
- Xuất bản đề thi lên Supabase: Lưu thông tin đề thi và toàn bộ mảng câu hỏi có cấu trúc vào bảng `exams`.
- Danh sách đề thi đã tạo: Hiển thị mã đề, tên đề thi, thời gian làm bài, ngày tạo.
- Xóa cứng đề thi: Cung cấp nút "Xóa" cho từng đề thi trong danh sách. Khi quản trị viên xác nhận, hệ thống gửi lệnh `DELETE` trực tiếp lên Supabase để xóa vĩnh viễn đề thi khỏi cơ sở dữ liệu.

### 2.7. Theo dõi kết quả và Nhật ký thao tác (Audit Logs)
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
- Mỗi dạng câu được hiển thị bằng `renderExam` của registry:
  - Trắc nghiệm: nút phương án cảm ứng lớn.
  - Đúng sai: bảng 4 ý, mỗi ý bấm Đ hoặc S.
  - Tự luận / Trả lời ngắn: ô nhập (bàn phím số nếu đáp án là số; trả lời ngắn giới hạn 4 ký tự).
- Kiểm tra định dạng trực tiếp (debounce 300ms): gõ sai định dạng số (vd `3//4`) thì viền đỏ, hiện cảnh báo và câu đó không tính là đã trả lời. Khi nộp bài, hộp xác nhận liệt kê các câu đang sai định dạng.
- Lưới điều hướng câu chia theo phần (I: 1–12, II: 1–2...), tô xanh câu đã làm, đỏ câu sai định dạng, nét đứt câu tự luận giấy. Mỗi câu hiển thị tiêu đề phần và lời dẫn như đề giấy.
- Trả lời ngắn dùng ô "Đáp án" 4 ký tự kiểu phiếu thi. Câu tự luận (giáo viên chấm): chỉ hiện đề, thí sinh làm trên giấy.
- Nộp bài khi còn câu tự luận: màn hình khoá hiện điểm phần chấm tự động (vd `2,25 / 7`) và báo phần chờ giáo viên chấm.
- Nút **Đăng xuất** chỉ hiện ở màn danh sách đề, ẩn khi đang làm bài.
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
- `answers`: mảng `{question_index, part, type, answer, points, max, pending}`. Câu giáo viên chấm có `points: null, pending: true` cho tới khi giáo viên nhập điểm (cần policy UPDATE trên `exam_results`, xem `schema.sql`).

### 4.3. Bảng `app_settings` (Cấu hình hệ thống)
```sql
create table app_settings (
  key text primary key,          -- vd: 'exam_templates'
  value jsonb not null           -- vd: [{ "id", "name", "parts": [{ "type", "count", "points" }] }]
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
