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
  - Mật khẩu kiểm tra trên server (`ADMIN_PASSWORD`). Đúng thì server trả token ký HMAC hạn 12 giờ, lưu ở `sessionStorage`; mọi thao tác admin gửi kèm token qua proxy `/api/admin/rest` (chỉ các bảng `exams`, `exam_results`, `exam_events`, `app_settings`). Sai 5 lần tạm khoá 5 phút.

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
- Dán JSON vào modal (không cần file); cấu trúc đề được **tự nhận diện** theo thứ tự dạng câu của các phần: ưu tiên mẫu đang chọn, rồi mẫu cùng thứ tự dạng và không lỗi, rồi mẫu chỉ lệch số câu. Không có mẫu nào khớp thì tự tạo và lưu mẫu mới (số câu tuỳ ý, điểm/câu lấy giá trị phổ biến trong JSON). Chế độ "Nối thêm" giữ cấu trúc đang chọn. Định dạng: `{ "title", "duration_minutes", "parts": [{ "type", "questions": [...] }] }`. Vẫn nhận mảng câu hỏi phẳng (mỗi câu tự xếp vào phần cùng dạng). Tiêu đề và thời gian được tự điền.
- Thiếu số câu so với mẫu vẫn cho nhập (báo lỗi theo phần, khoá xuất bản) để bổ sung bằng nút **+** của phần đó.
- Tự sửa dấu `\` thiếu trước lệnh LaTeX (`\frac`, `\{`, `\,` → `\\frac`...) trước khi parse, nhưng giữ `\n` là xuống dòng.
- Lỗi được báo theo từng câu ngay trong modal, kể cả câu thuộc dạng chưa có trong cấu trúc đề.
- Modal **Quy tắc định dạng**: một khối văn bản duy nhất, sao chép bằng 1 nút. Sinh tự động từ mẫu đang chọn: các phần (số câu, điểm), khung JSON, quy tắc từng dạng, công thức toán, hướng dẫn chuyển từ đề PDF, JSON mẫu. Có thể dán khối này cùng file PDF đề vào ChatGPT/Claude để chuyển đề sang JSON.

### 2.5. Danh sách câu sau khi import
- Chỉ hiện sau khi đã import. Câu hỏi nhóm theo phần, có tiêu đề PHẦN I, II... kèm lời dẫn và số câu/yêu cầu; có nút **Huỷ import**.
- Mỗi câu có nút Sửa / Xoá. Cuối mỗi phần là nút **＋** để thêm câu thủ công vào phần đó (form theo dạng, xem trước KaTeX, chọn/dán hình vẽ, điểm câu).
- Câu hỏi chỉ nằm trong bộ nhớ trình duyệt, không lưu file. Nút xuất bản bị khoá khi còn lỗi.

### 2.6. Xuất bản và Quản lý danh sách đề thi
- **Mã đề** = số ngẫu nhiên 5 chữ số (10000–99999, không trùng), database tự cấp (`random_exam_id()`, ràng buộc `exams_id_five_digits`). Đề cũ đã được đổi mã, kết quả / sự cố trỏ theo.
- Nhập đề không qua giao diện: `npm run exam:import -- file.json [--dry-run]`.
- Xuất bản đề thi lên Supabase: Lưu thông tin đề thi và toàn bộ mảng câu hỏi có cấu trúc vào bảng `exams`.
- Danh sách đề thi đã tạo: Hiển thị mã đề, tên đề thi, thời gian làm bài, ngày tạo.
- Xóa cứng đề thi: Cung cấp nút "Xóa" cho từng đề thi trong danh sách. Khi quản trị viên xác nhận, hệ thống gửi lệnh `DELETE` trực tiếp lên Supabase để xóa vĩnh viễn đề thi khỏi cơ sở dữ liệu.

### 2.7. Theo dõi kết quả và Nhật ký thao tác (Audit Logs)
- Danh sách kết quả nộp bài: Hiển thị tên thí sinh, điểm số (/10), tổng số câu hỏi, thời lượng làm bài thực tế, thời điểm nộp bài.
- Modal xem chi tiết kết quả:
  - Chi tiết từng câu trả lời của thí sinh (câu trắc nghiệm hiển thị phương án chọn, câu tự luận hiển thị giá trị điền) kèm đánh giá Đúng/Sai.
  - Toàn bộ nhật ký thao tác (Action Logs): Mốc thời gian chính xác, loại thao tác (`BAT_DAU`, `CHON_DAP_AN`, `DOI_DAP_AN`, `NHAP_DAP_AN`, `ROI_MAN_HINH`, `QUAY_LAI`, `MAT_TIEU_DIEM`, `HET_GIO`, `NOP_BAI`).

---

## 2b. BẢO MẬT PHÍA SERVER (`lib/`: Router → controllers → services → repositories → interface Database → SupabaseDatabase)

- Trình duyệt không giữ khoá Supabase, mật khẩu admin hay mật khẩu giám thị. Server dùng khoá `service_role` từ biến môi trường; migration `0004_close_public_access` bật RLS, bỏ mọi policy công khai và thu hồi quyền của `anon`/`authenticated`.
- Thí sinh nhận đề đã lọc đáp án (`GradingService.sanitizeQuestion`: bỏ `is_correct`, `is_true`, `answer`, `answers`, `solution`; câu tự luận chỉ kèm cờ `numeric`).
- Server chấm bằng chính registry `question-types.js` (`GradingService` nạp vào vm), bỏ qua mọi điểm số client gửi. Thời lượng bị giới hạn tối đa bằng thời gian đề + 1 phút.
- Mỗi thí sinh chỉ nộp 1 lần mỗi đề: nộp lại trả 409 kèm kết quả cũ (dùng khi lần trước đã lưu nhưng mất phản hồi).
- Mật khẩu đề (mật khẩu chung `PROCTOR_PASSWORD` hoặc mật khẩu riêng của đề, xem 3.4b) kiểm tra ở `/api/proctor-exit`; đúng hay sai đều ghi `exam_events`. Sai 5 lần tạm khoá 5 phút. Không có mạng thì không thoát được.

| Route | Quyền | Việc |
|---|---|---|
| `GET /api/exams` | công khai | danh sách đề (không có câu hỏi) |
| `GET /api/exam?id=&student=` | công khai | đề đã lọc đáp án; đã nộp → 409 |
| `GET /api/history?student=` | công khai | lịch sử điểm của thí sinh |
| `POST /api/submit` | công khai | server chấm và lưu bài |
| `POST /api/proctor-exit` | mật khẩu giám thị | ghi sự cố thoát |
| `POST /api/admin/login` | mật khẩu admin | cấp token |
| `POST /api/admin/rest` | token admin | proxy REST các bảng hệ thống |

## 2c. HẠ TẦNG DATABASE (`lib/infra/`) VÀ MIGRATION

- Repository chỉ dùng interface `Database` (`lib/infra/database/Database.ts`: `select / insert / update / remove` với bộ lọc, sắp xếp, giới hạn, chọn cột). Cài đặt: `SupabaseDatabase` (REST + service_role; nơi duy nhất biết cú pháp PostgREST), `MemoryDatabase` (test). Đổi database = viết thêm 1 lớp cài đặt.
- Trang admin vẫn gửi truy vấn PostgREST thô qua proxy → đi qua interface riêng `RestGateway`, tách khỏi nghiệp vụ.
- Thay đổi schema = file `database/migrations/NNNN_ten.sql` (tạo: `npm run db:new -- ten`). Bảng `schema_migrations` ghi file đã chạy + checksum; mỗi file chạy trong 1 transaction (lỗi → rollback); khoá advisory chống chạy trùng; file đã chạy mà bị sửa → báo lỗi (không sửa migration cũ, tạo file mới).
- Tự áp: `npm run dev` và build Vercel chạy `db migrate --if-configured` trước (bỏ qua nếu chưa có `DATABASE_URL`). Chạy tay: `npm run db:status`, `npm run db:migrate`.
- `DATABASE_URL`: Supabase › Connect › Session pooler (IPv4). Chỉ dùng cho migration; app chạy bằng REST.

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
5. Màn hình kết quả:
   - Hiển thị điểm số và thông báo bài thi đã nộp thành công. Thiết bị vẫn ở chế độ Kiosk.
   - Chỉ có 2 nút (không có nút thoát): **Xem lịch sử làm bài** và **Về trang đề thi**, đều không cần mật khẩu.
   - Riêng khi chạy trong Safe Exam Browser: thêm nút **Thoát Safe Exam Browser** (server trả `seb_quit_url` khi nộp) → SEB tự đóng.
   - App Android: nộp xong thì bỏ ghim màn hình. Đóng app: màn đăng nhập › **Thoát ứng dụng (Quản trị)** (mật khẩu quản trị).
   - Chống nộp trùng: mỗi lượt làm bài có khoá ngẫu nhiên (`submission_key`, lưu ở trình duyệt, gửi kèm khi nộp). Mất phản hồi rồi bấm "Thử nộp lại" cùng khoá → server trả lại kết quả đã lưu (409 kèm `result`), không tạo bản ghi mới.

### 3.4. Lịch sử làm bài và điều kiện nộp
- Màn danh sách đề có mục **Lịch sử làm bài** (đề, điểm, chờ chấm tự luận, thời lượng, thời điểm nộp) lấy từ `exam_results` theo tên thí sinh.
- Mặc định mỗi đề 1 lượt (làm lại cần mật khẩu đề, xem 3.4b; đề bật "Cho làm lại nhiều lần" thì không cần): đề đã nộp hiện "Đã nộp · điểm" + nút "Làm lại", đề làm dở hiện "Tiếp tục làm bài", bản nháp quá hạn hiện "Nộp bài" và tự nộp khi mở.
- Ô đáp án dạng số (trả lời ngắn, tự luận ngắn có đáp án số) có **bàn phím số riêng** ngay bên dưới: 0–9, `-`, `,`, `.`, `/`, dấu cách, Xoá, Xoá hết (`numberKeypadHtml` trong `question-types.js`, xử lý ở `pressKeypad` trong `exam.js`). Ô đặt `inputmode="none"` nên điện thoại không bật bàn phím của máy (bàn phím số của nhiều máy thiếu `-` / `/`); máy tính vẫn gõ phím bình thường. Ô tự luận dạng chữ vẫn dùng bàn phím của máy.
- Thanh tiêu đề trang thí sinh có nút **Tải lại** (chỉ hiện ở danh sách đề): tải lại danh sách, giữ trang và ô tìm kiếm đang dùng.
- Sau mỗi lần đăng nhập, trang đề thi hiện 1 lời nhắn (modal có nút **Đóng**); trang đăng nhập đặt cờ `sessionStorage.welcomePending`, trang đề thi hiện 1 lần rồi xoá cờ (tải lại trang không hiện lại).
- Nút **Nộp bài** chỉ bật khi đã trả lời đủ mọi câu (trừ câu tự luận làm trên giấy). Hết giờ thì tự nộp bất kể.

### 3.4b. Mật khẩu đề và làm lại
- Ô nhập mật khẩu **vào đề (nếu bật), cho làm lại, mở khoá bài** nhận **một trong hai** (`lib/security/examPassword.ts`). Thoát khẩn cấp cũng nhận cả hai, **trừ khi đang làm lượt thứ 4 trở đi** (`FREE_RETAKE_ATTEMPTS + 1`): lúc đó chỉ nhận mật khẩu chung:
  - **Mật khẩu chung (mặc định) của mọi đề**: biến môi trường `PROCTOR_PASSWORD`. Đổi bằng cách sửa biến môi trường; chỉ đổi khi không có ca thi (vé vào đề cũ hết hiệu lực).
  - **Mật khẩu riêng 6 số của đề** (`exams.proctor_code`): server tự gắn khi xuất bản (`crypto.randomInt`). Mật khẩu riêng của đề khác không dùng được.
- Thí sinh không bao giờ nhận được 2 mật khẩu này (đề gửi về trình duyệt không có `proctor_code`).
- Trang admin, danh sách đề: nút chìa khoá → xem / sao chép mật khẩu riêng, **Đổi mật khẩu riêng** (mật khẩu riêng cũ hết hiệu lực ngay), xem mật khẩu chung. Đề cũ chưa có mật khẩu riêng được tạo khi bấm xem.
- Làm lại (mặc định): mỗi thí sinh 1 lượt/đề. Đề đã nộp hiện nút **Làm lại** → giám thị nhập mật khẩu đề → server ghi `CHO_LAM_LAI` kèm `attempt` = số lần đã nộp + 1 (mở **đúng 1 lượt** tính từ số lần đã nộp). Số lượt được phép = max(1 + số lần `CHO_LAM_LAI`, `attempt` lớn nhất); sự cố cũ không có `attempt` vẫn tính +1 lượt. Mật khẩu đề không tự đổi sau khi cho làm lại.
- **Cho làm lại tối đa 3 lần** (nút chìa khoá, `exams.allow_retake`, mặc định tắt; số lượt: `FREE_RETAKE_ATTEMPTS` trong `AttemptService`): bật thì thí sinh bấm "Làm lại" là vào làm ngay, không cần mật khẩu, tối đa 3 lượt (tính cả lần đầu). Từ lượt thứ 4 giám thị nhập mật khẩu đề, mỗi lần mở thêm 1 lượt. Tắt lại thì về mặc định; thí sinh đã làm nhiều lượt muốn làm tiếp thì giám thị nhập mật khẩu → mở thêm đúng 1 lượt.
- **Vé lượt** (`attempt_ticket` = HMAC(đề, thí sinh, số lần đã nộp), trình duyệt lưu và gửi lại qua header `X-Exam-Attempt` / khi nộp): thí sinh đã được vào lượt nào thì tải lại trang / nộp lượt đó được dù admin đổi cài đặt giữa chừng (vd tắt "làm lại nhiều lần"). Nộp xong số lần đã nộp tăng → vé hết hạn.
- Bấm "cho làm lại" 2 lần cùng lúc: cùng ghi 1 số lượt → chỉ mở 1 lượt.
- Bản nháp trên máy đã được nộp (mất phản hồi): khi vào lại, trình duyệt gửi khoá chống nộp trùng (`X-Exam-Submission`); server thấy đã có bài nộp với khoá đó → trả `draft_submitted` → trình duyệt bỏ bản nháp, làm lượt mới.
- Mỗi lượt là một bài nộp riêng trong `exam_results`, lịch sử hiện đủ các lần.
- Mọi lần nhập mật khẩu (đúng/sai) ghi vào `exam_events`. Chống dò: sai 5 lần / thí sinh tạm khoá 5 phút; thêm giới hạn theo máy (IP) dùng chung cho mọi ô nhập mật khẩu: sai 30 lần trong 10 phút (các lần sai cách nhau quá 10 phút thì đếm lại) khoá 10 phút; nhập đúng thì xoá đếm của IP đó (ngưỡng cao vì cả trường có thể chung 1 IP wifi).

### 3.4c. Mật khẩu vào đề (mặc định tắt)
- Admin: nút chìa khoá của đề → mục **Mật khẩu vào đề**: bật/tắt (`exams.require_password`, mặc định `false`). Học sinh nhập mật khẩu đề (chung hoặc riêng, xem 3.4b). Cột `exams.entry_password` cũ không còn dùng.
- Lưu ý: mật khẩu đọc cho cả phòng cũng dùng được để cho làm lại / mở khoá / thoát khẩn cấp. Nên đọc **mật khẩu riêng của đề** (chỉ dùng được ở đề đó), không đọc mật khẩu chung.
- Bật: `GET /api/exam` cần header `X-Exam-Password` (lần đầu) hoặc `X-Exam-Entry` (vé vào đề server cấp khi nhập đúng = HMAC theo đề + thí sinh + `PROCTOR_PASSWORD`). Vé lưu ở trình duyệt nên tải lại trang / vào lại sau thoát khẩn cấp không phải nhập lại. Đổi `PROCTOR_PASSWORD` thì vé cũ hết hiệu lực; đổi mật khẩu riêng của đề thì **không** (học sinh đang làm vẫn nộp được). `POST /api/submit` phải kèm `entry_token` hợp lệ.
- Nhập sai: ghi `SAI_MAT_KHAU` ("Nhập sai mật khẩu vào đề."), sai 5 lần tạm khoá 5 phút.

### 3.5. Thoát khẩn cấp
- Nút **Thoát khẩn cấp (Giám thị)** trong lúc làm bài: nhập mật khẩu đề (chung hoặc riêng; từ lượt làm thứ 4 chỉ nhận mật khẩu chung) + lý do (tuỳ chọn).
- Server xác thực mật khẩu rồi ghi `THOAT_KHAN_CAP` (lý do, số câu đã làm, thời gian còn lại, số lần sai mật khẩu) vào `exam_events` kèm toàn bộ nhật ký tới thời điểm đó. Bài làm giữ ở bản nháp, đồng hồ vẫn chạy theo deadline.
- Thoát xong thí sinh **về danh sách đề** bằng cách tải lại trang `exam.html?user=...` (trình duyệt bỏ sạch trạng thái toàn màn hình / khoá bàn phím; không đăng xuất, không đóng app / SEB; app Android bỏ ghim màn hình). Đề hiện "Đang làm dở" → "Tiếp tục làm bài" để vào lại.
- Mỗi lần nhập sai mật khẩu ghi `SAI_MAT_KHAU` vào nhật ký bài và `exam_events`.
- Admin xem ở bảng **Sự cố phòng thi** (trang Kết quả). Bảng kết quả gắn nhãn "Vi phạm N" / "Thoát khẩn cấp N".

### 3.5b. Safe Exam Browser (SEB) theo từng đề
- Admin, danh sách đề → nút **SEB**: bật/tắt **Bắt buộc SEB** (`exams.require_seb`), link mở SEB (`sebs://<host>/api/seb-config?exam_id=N`, chạy local là `seb://`), tải file `.seb`, mật khẩu thoát SEB dự phòng (`exams.seb_quit_password`, chuỗi ngẫu nhiên 16 ký tự, đổi được).
- File `.seb` (XML plist, `SebConfigService`) công khai: `startURL` = trang đăng nhập, `quitURL` = `/seb-quit.html?exam=N&k=<HMAC>` riêng từng đề, `hashedQuitPassword` = SHA-256 mật khẩu thoát (không dùng mã 6 số vì SHA-256 của 6 chữ số dò ngược được ngay), toàn màn hình, tắt tải lại / quay lại. Khoá Alt+Tab, phím Windows, ứng dụng khác dùng mặc định kiosk của SEB.
- Đề bắt buộc SEB: server từ chối `GET /api/exam` và `POST /api/submit` nếu User-Agent không có `SEB/<phiên bản>` (403 `needsSeb`). Trình duyệt thường chỉ thấy nút "Mở bằng Safe Exam Browser".
- Thoát khẩn cấp trong SEB: như trình duyệt thường, về danh sách đề (SEB không đóng). Đóng SEB: nút **Thoát Safe Exam Browser** chỉ có ở màn kết quả ngay sau khi nộp (mở `seb_quit_url` → SEB tự đóng). Đã bấm "Về trang đề thi" hoặc sau thoát khẩn cấp thì chỉ đóng SEB được bằng mật khẩu thoát SEB dự phòng (nút SEB của đề ở trang admin).
- Giới hạn: nhận diện SEB qua User-Agent là mức cơ bản (chặn trình duyệt thường; công cụ chuyên dụng có thể giả mạo). Mức chặt hơn: kiểm tra header `X-SafeExamBrowser-ConfigKeyHash` (file `.seb` đã bật `sendBrowserExamKey`) — cần thử với SEB thật trước khi bật.

### 3.6. Khoá trình duyệt (`public/js/lockdown.js`)
- Web thường: bắt buộc toàn màn hình + Keyboard Lock API (Chrome/Edge: phải giữ Esc mới thoát được). Thoát toàn màn hình, chuyển tab, Alt+Tab, mất tiêu điểm -> ghi log và che kín đề cho tới khi bấm "Quay lại bài thi".
- Chặn: chuột phải, sao chép/cắt/dán, bôi đen, kéo thả, F5/Ctrl+R, F12/Ctrl+Shift+I, Ctrl+P/S/U, Alt+←, nút Back; cảnh báo khi đóng/tải lại trang. Chuột rời cửa sổ (màn hình thứ 2) -> ghi log.
- Log vi phạm: `ROI_MAN_HINH`, `MAT_TIEU_DIEM`, `THOAT_TOAN_MAN_HINH`, `PHIM_BI_CHAN`, `CHUOT_PHAI`, `SAO_CHEP`, `CHUOT_RA_NGOAI`, `TAI_LAI_TRANG`, `NUT_BACK`, `SAI_MAT_KHAU`, `CUA_SO_NOI` (app Android: có bong bóng chat / cửa sổ nổi trên màn hình) (mỗi loại tối đa 1 log / 2 giây).
- Thêm: `CHIA_MAN_HINH` (app Android / SEB - nơi không bắt buộc toàn màn hình: cửa sổ bài thi hẹp hơn 70% chiều ngang màn hình, tức chia đôi màn hình / cửa sổ nhỏ; app Android còn cấm chia đôi bằng `resizeableActivity="false"` và báo `split` nếu máy vẫn cho) → che bài như rời bài; `CHUP_MAN_HINH` (phím PrintScreen trên máy tính, chỉ ghi lại); `IN_TRANG` (mở in trang); `KEO_THA` (kéo thả nội dung từ ngoài vào, bị chặn). Không tính vi phạm: `QUAY_LAI` kèm số giây đã rời bài, `MAT_MANG` / `CO_MANG`, `UNG_DUNG_TRO_NANG` (app Android: tên các ứng dụng trợ năng đang bật lúc bắt đầu làm bài).
- Màn hình cảm ứng: chạm giữ lâu trình duyệt cũng báo như chuột phải → ghi `GIU_LAU` (không tính vi phạm), không ghi `CHUOT_PHAI`; không ghi `CHUOT_RA_NGOAI` khi không dùng chuột.
- App Android báo cho trang qua sự kiện `safeexam-native` (`MainActivity.notifyWeb`): `pinned` / `unpinned` (kiểm tra mỗi giây khi đang làm bài; bị gỡ ghim thì app tự hỏi ghim lại, trang che bài, gỡ ghim sau khi đã ghim ghi `GO_GHIM` + tính rời bài; mới vào bài chưa bấm "Ghim" thì chỉ che, không tính), `blur` / `focus` (mất / lấy lại tiêu điểm khi đã ghim, vd bấm vào bong bóng chat) và `overlay` (chạm lúc màn hình bị cửa sổ nổi che; chạm đó bị chặn). `lockdown.js` coi như rời bài: hiện màn che, đề bật khoá thì khoá.
- Android Kiosk và Safe Exam Browser (nhận diện qua User-Agent `SEB/`) không bắt buộc toàn màn hình vì hệ điều hành đã khoá.
- **Khoá bài khi rời trang** (`FREE_LEAVES = 0` trong `lockdown.js` = không có lần cảnh báo): rời bài (thoát toàn màn hình, chuyển tab/cửa sổ, tải lại / đóng trang) là bài bị **khoá ngay** (log `KHOA_BAI`): màn che không còn nút quay lại, chỉ giám thị nhập **mật khẩu đề** (chung hoặc riêng) mới mở được (server ghi `MO_KHOA`). Trạng thái khoá lưu trong bản nháp nên tải lại trang không gỡ được. Đã mở khoá mà rời tiếp thì khoá lại ngay. Đồng hồ vẫn chạy khi bị khoá; hết giờ vẫn tự nộp.
- Giới hạn: trang web không thể ngăn người dùng đóng tab, Alt+Tab, phím Windows (bảo vệ của trình duyệt). Khoá cứng cần ứng dụng khoá máy: app Android (Kiosk) hoặc Safe Exam Browser.

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
- `answers`: mảng `{question_index, part, type, answer, points, max, pending}`. Câu giáo viên chấm có `points: null, pending: true` cho tới khi giáo viên nhập điểm (server sửa qua khoá service_role).

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
