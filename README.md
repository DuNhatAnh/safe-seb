# Safe Exam Browser (safe-seb)

He thong thi truc tuyen an toan tich hop Kiosk Mode, giam sat thao tac (Audit Logs) va dong bo ket qua truc tiep voi Supabase.

---

## 1. Khoi chay he thong (Backend va Frontend)

He thong tich hop ca Backend (API boc tach PDF) va Frontend (Web app) trong mot may chu thong nhat:

```bash
# Cai dat dependencies
npm install

# Khoi chay may chu (Backend API va Frontend)
npm start
```

- Dia chi truy cap: http://localhost:3000 (hoac http://localhost:3000/index.html)

---

## 2. Huong dan dang nhap

| Vai tro | Cach dang nhap | Quyen han |
|---|---|---|
| **Thi sinh (User)** | Nhap bat ky ten tai khoan nao (vd: nam, an...) | **Vao thang phong thi**, khong can mat khau. Nhan tat ca de thi hien co. |
| **Quan tri (Admin)** | Nhap tai khoan: `admin`<br>Mat khau: `admin@123` | Quan ly de thi (Upload JSON/PDF), xem ket qua va toan bo nhat ky thao tac. |

---

## 3. Cau truc du an

```text
safe-seb/
├── android/        # Ung dung Android Kiosk Mode Native (Kotlin)
├── api/            # Backend API (boc tach cau hoi tu file PDF)
├── database/       # Schema SQL va phan quyen RLS Supabase
├── docs/           # Tai lieu dac ta ky thuat chi tiet
├── public/         # Frontend Web App (HTML, CSS, JS thuan)
│   ├── css/        # Stylesheets
│   └── js/         # Logic app, admin va exam
├── server.js       # May chu phuc vu API va Frontend
└── package.json
```
