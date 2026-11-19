# Safe Exam Browser (safe-seb)

Hệ thống thi trực tuyến an toàn tích hợp Kiosk Mode, giám sát thao tác (Action Logs) và đồng bộ kết quả trực tiếp với Supabase.

---

## 1. Khởi chạy hệ thống

Node.js (≥ 22.18, khuyên dùng 24) + **TypeScript** phục vụ file tĩnh và API (`/api/*`, thư mục `lib/`). Node chạy thẳng file `.ts`, không cần build khi phát triển. Trình duyệt **không** kết nối Supabase trực tiếp: mọi khoá và mật khẩu chỉ nằm trên server.

```bash
# 1. Tạo file cấu hình (không commit file .env)
cp .env.example .env
#    điền SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, PROCTOR_PASSWORD, SESSION_SECRET

# 2. Cập nhật database bằng migration (cần DATABASE_URL trong .env, xem mục Database bên dưới)
npm run db:migrate

# 3. Cài công cụ (TypeScript) và khởi chạy máy chủ
npm install
npm start

# Hoặc khi phát triển: sửa server.ts, lib/, .env -> server tự khởi động lại; sửa giao diện -> bấm F5 (trình duyệt không tự tải lại)
npm run dev

# Chạy test nghiệp vụ (không cần server / Supabase)
npm test

# Test giao diện tự động trên trình duyệt thật (nhập đề, làm bài, thoát khẩn cấp...)
# Lần đầu: npx playwright install chromium
npm run test:e2e

# Kiểm tra kiểu TypeScript: backend (strict) + JS trình duyệt; npm run check = typecheck + test
npm run typecheck
```

Triển khai Vercel: khai báo đủ 5 biến trong `.env.example` ở Project Settings > Environment Variables. Vercel tự chạy `npm run build` (TypeScript -> `dist/`).

- Địa chỉ truy cập: http://localhost:3000 (hoặc http://localhost:3000/index.html)

### App Android (cài về máy rồi làm bài)

Học sinh tải **safe-exam.apk** (nút "Tải app" hiện trên trang đăng nhập khi mở bằng điện thoại Android), cài, mở, bấm **Ghim** là làm bài. GitHub tự build file cài (`.github/workflows/android-apk.yml`). Muốn khoá cứng hẳn (không gỡ ghim được) thì đặt app làm **Device Owner** bằng 1 lệnh `adb`. Chi tiết: [docs/android-kiosk.md](docs/android-kiosk.md).

### Safe Exam Browser (khoá máy tính khi thi)

Trình duyệt thường không chặn được Alt+Tab / phím Windows. Muốn khoá hẳn máy tính: cài [Safe Exam Browser](https://safeexambrowser.org/download_en.html) (Windows / macOS / iPad) trên máy thi, rồi ở trang admin bấm **SEB** cạnh đề:
- Bật **Bắt buộc làm trên Safe Exam Browser** → trình duyệt thường không lấy được đề.
- Gửi **link `sebs://...`** (hoặc file `.seb`) cho học sinh: bấm vào là SEB mở đúng hệ thống thi.
- Giám thị thoát bằng **mã 6 số của đề** trong bài thi như bình thường, SEB tự đóng.

### Nhập đề từ file JSON (không qua trang admin)

```bash
npm run exam:import -- docs/de-mau/ten-de.json --dry-run   # chỉ kiểm tra
npm run exam:import -- docs/de-mau/ten-de.json             # nhập thật
```
Kiểm tra bằng đúng logic "Nhập JSON" của trang admin, tự chọn / tạo mẫu cấu trúc đề, tự kiểm tra "trả lời đúng hết = 10 điểm", tự sinh mã giám thị. Đề mẫu nằm trong `docs/de-mau/`.

**Mã đề** là số ngẫu nhiên 5 chữ số (10000–99999), database tự cấp khi tạo đề (migration `0006`), không theo thứ tự để học sinh không đoán được mã đề khác.

### Database và migration

Mọi thay đổi cấu trúc database nằm trong `database/migrations/NNNN_ten.sql`, chạy theo thứ tự, mỗi file một lần.

| Lệnh | Việc |
|---|---|
| `npm run db:status` | Xem migration đã chạy / chưa chạy |
| `npm run db:migrate` | Áp các migration chưa chạy |
| `npm run db:new -- them_cot_x` | Tạo file migration mới (số thứ tự tự tăng) |

`npm run dev` và bản build trên Vercel **tự chạy migration** trước khi khởi động (bỏ qua nếu chưa có `DATABASE_URL`).
`DATABASE_URL` lấy ở Supabase › nút **Connect** › **Session pooler** (chuỗi `postgresql://postgres.<ref>:...@aws-0-<vùng>.pooler.supabase.com:5432/postgres`, thay `[YOUR-PASSWORD]` bằng mật khẩu database).
Không sửa file migration đã chạy: muốn đổi thì tạo file mới.

### Test tự động (chạy trước khi thêm / sửa chức năng)

| Lệnh | Kiểm tra gì | Cần gì |
|---|---|---|
| `npm test` | Nghiệp vụ backend: chấm điểm, lọc đáp án, chặn nộp 2 lần, mật khẩu giám thị, token admin | Không cần gì |
| `npm run test:e2e` | Trình duyệt thật: admin nhập đề JSON và xuất bản; học sinh làm bài, nộp, xem lịch sử; tải lại trang giữ bài; thoát khẩn cấp; luồng admin → học sinh → admin xem kết quả | Chromium của Playwright (cài 1 lần) |
| `npm run test:e2e:ui` | Như trên, mở giao diện xem từng bước | |
| `npm run check` | Kiểm tra kiểu TypeScript + cả 2 loại test | |

Test giao diện tự bật một **Supabase giả lập trong bộ nhớ** và server ở cổng 3100, không dùng dữ liệu hay khoá thật. Kịch bản nằm trong `tests/e2e/*.spec.ts`, dữ liệu mẫu ở `tests/e2e/support/fixtures.ts`. Test lỗi sẽ để lại ảnh chụp + trace trong `test-results/`.

---

## 2. Hướng dẫn đăng nhập

| Vai trò | Cách đăng nhập | Quyền hạn |
|---|---|---|
| **Thí sinh (User)** | Nhập bất kỳ tên tài khoản nào (ví dụ: nam, an, hoa...) | **Vào thẳng phòng thi**, không cần mật khẩu. Nhận danh sách tất cả đề thi hiện có. |
| **Quản trị (Admin)** | Nhập tài khoản: `admin`<br>Mật khẩu: giá trị `ADMIN_PASSWORD` trên server | Tạo mẫu cấu trúc đề theo Phần I, II, III... (Trắc nghiệm, Đúng sai, Trả lời ngắn, Tự luận), nhập đề bằng JSON, thêm/sửa câu kèm công thức KaTeX và hình vẽ, chấm tay câu tự luận, xem kết quả và nhật ký thao tác. |

---

## 3. Cấu trúc dự án

```text
safe-seb/
├── android/            # Ứng dụng Android Kiosk Mode Native (Kotlin)
├── database/migrations # Thay đổi database theo thứ tự (NNNN_ten.sql)
├── scripts/db.ts       # Lệnh migration: npm run db:status | db:migrate | db:new
├── docs/               # Bản đặc tả kỹ thuật chi tiết (spec.md)
├── public/             # Giao diện Web (HTML, CSS, JS thuần)
│   ├── css/            # Tập trung toàn bộ giao diện (style.css)
│   ├── js/             # app.js (tiện ích, Supabase), question-types.js (registry dạng câu), admin.js, exam.js
│   └── vendor/         # Thư viện tĩnh KaTeX (katex.min.js, css, fonts)
├── lib/                # Backend (giữ khoá Supabase + mật khẩu), chia lớp:
│   ├── api.ts          #   lắp ráp: Router -> controllers -> services -> repositories -> db
│   ├── types.ts        #   kiểu dữ liệu dùng chung (Question, ExamRow, ResultRow...)
│   ├── config.ts       #   đọc biến môi trường
│   ├── paths.ts        #   thư mục gốc dự án (chạy .ts hay bản build đều đúng)
│   ├── errors.ts       #   lỗi nghiệp vụ (ValidationError, ConflictError...) kèm mã HTTP
│   ├── http/           #   Router: định tuyến /api/*, đọc body, trả lỗi
│   ├── controllers/    #   StudentController, AdminController: nối HTTP với service
│   ├── services/       #   nghiệp vụ: Exam, Submission, Proctor, Auth, AdminData, Grading
│   ├── repositories/   #   truy vấn từng bảng: Exam, Result, Event
│   ├── infra/          #   database/: interface Database + SupabaseDatabase, MemoryDatabase; migrations/: trình chạy migration; env.ts
│   ├── security/       #   RateLimiter, secureCompare
│   ├── utils/          #   làm sạch dữ liệu client gửi lên
├── tests/              # services.test.ts: test nghiệp vụ (npm test); e2e/: test giao diện Playwright (npm run test:e2e)
├── api/                # index.js: điểm vào serverless cho Vercel (dùng bản build dist/)
├── server.ts           # Máy chủ Node.js: static files, /api, chặn path traversal
├── tsconfig*.json      # tsconfig.json (backend strict), tsconfig.build.json (build dist/), tsconfig.web.json (kiểm tra public/js)
├── package.json        # Cấu hình dự án
└── .env                # Bí mật server (xem .env.example), không commit
```
