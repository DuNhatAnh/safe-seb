# Safe Exam Browser (safe-seb)

Hệ thống thi trực tuyến an toàn tích hợp Kiosk Mode, giám sát thao tác (Action Logs) và đồng bộ kết quả trực tiếp với Supabase.

---

## 1. Khởi chạy hệ thống

Hệ thống sử dụng Node.js thuần phục vụ file tĩnh và kết nối trực tiếp với Supabase REST API:

```bash
# Cài đặt dependencies
npm install

# Khởi chạy máy chủ
npm start
```

- Địa chỉ truy cập: http://localhost:3000 (hoặc http://localhost:3000/index.html)

---

## 2. Hướng dẫn đăng nhập

| Vai trò | Cách đăng nhập | Quyền hạn |
|---|---|---|
| **Thí sinh (User)** | Nhập bất kỳ tên tài khoản nào (ví dụ: nam, an, hoa...) | **Vào thẳng phòng thi**, không cần mật khẩu. Nhận danh sách tất cả đề thi hiện có. |
| **Quản trị (Admin)** | Nhập tài khoản: `admin`<br>Mật khẩu: `admin@123` | Nhập đề thi bằng JSON (tự điền tiêu đề/thời lượng), tạo/sửa câu hỏi thủ công kèm công thức KaTeX, xóa cứng đề thi, xem kết quả và toàn bộ nhật ký thao tác. |

---

## 3. Cấu trúc dự án

```text
safe-seb/
├── android/            # Ứng dụng Android Kiosk Mode Native (Kotlin)
├── database/           # Schema SQL và phân quyền RLS Supabase
├── docs/               # Bản đặc tả kỹ thuật chi tiết (spec.md)
├── public/             # Giao diện Web (HTML, CSS, JS thuần)
│   ├── css/            # Tập trung toàn bộ giao diện (style.css)
│   ├── js/             # Logic ứng dụng (app.js, admin.js, exam.js)
│   └── vendor/         # Thư viện tĩnh KaTeX (katex.min.js, css, fonts)
├── server.js           # Máy chủ Node.js phục vụ static files & chặn path traversal
├── package.json        # Cấu hình dự án
└── .env                # Biến môi trường kết nối Supabase
```
