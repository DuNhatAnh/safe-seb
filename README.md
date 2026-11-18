# Safe Exam Browser (safe-seb)

Hệ thống thi trực tuyến an toàn tích hợp Kiosk Mode, giám sát thao tác (Action Logs) và đồng bộ kết quả trực tiếp với Supabase.

---

## 1. Khởi chạy hệ thống

Node.js thuần phục vụ file tĩnh và API (`/api/*`, file `lib/api.js`). Trình duyệt **không** kết nối Supabase trực tiếp: mọi khoá và mật khẩu chỉ nằm trên server.

```bash
# 1. Tạo file cấu hình (không commit file .env)
cp .env.example .env
#    điền SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, PROCTOR_PASSWORD, SESSION_SECRET

# 2. Chạy database/schema.sql trên Supabase (SQL Editor) để tạo bảng và đóng quyền truy cập công khai

# 3. Khởi chạy máy chủ
npm start

# Hoặc khi phát triển: hot reload (sửa public/ -> trình duyệt tự tải lại; sửa server.js, lib/, .env -> server tự khởi động lại)
npm run dev

# Chạy test nghiệp vụ (không cần server / Supabase)
npm test
```

Triển khai Vercel: khai báo đủ 5 biến trong `.env.example` ở Project Settings > Environment Variables.

- Địa chỉ truy cập: http://localhost:3000 (hoặc http://localhost:3000/index.html)

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
├── database/           # Schema SQL và phân quyền RLS Supabase
├── docs/               # Bản đặc tả kỹ thuật chi tiết (spec.md)
├── public/             # Giao diện Web (HTML, CSS, JS thuần)
│   ├── css/            # Tập trung toàn bộ giao diện (style.css)
│   ├── js/             # app.js (tiện ích, Supabase), question-types.js (registry dạng câu), admin.js, exam.js
│   └── vendor/         # Thư viện tĩnh KaTeX (katex.min.js, css, fonts)
├── lib/                # Backend (giữ khoá Supabase + mật khẩu), chia lớp:
│   ├── api.js          #   lắp ráp: Router -> controllers -> services -> repositories -> db
│   ├── config.js       #   đọc biến môi trường
│   ├── errors.js       #   lỗi nghiệp vụ (ValidationError, ConflictError...) kèm mã HTTP
│   ├── http/           #   Router: định tuyến /api/*, đọc body, trả lỗi
│   ├── controllers/    #   StudentController, AdminController: nối HTTP với service
│   ├── services/       #   nghiệp vụ: Exam, Submission, Proctor, Auth, AdminData, Grading
│   ├── repositories/   #   truy vấn từng bảng: Exam, Result, Event
│   ├── db/             #   SupabaseClient: gọi Supabase REST bằng service_role
│   ├── security/       #   RateLimiter, secureCompare
│   ├── utils/          #   làm sạch dữ liệu client gửi lên
│   └── dev-reload.js   #   hot reload khi chạy npm run dev
├── tests/              # Test nghiệp vụ với repository giả: npm test
├── api/                # index.js: điểm vào serverless cho Vercel
├── server.js           # Máy chủ Node.js: static files, /api, chặn path traversal
├── package.json        # Cấu hình dự án
└── .env                # Bí mật server (xem .env.example), không commit
```
