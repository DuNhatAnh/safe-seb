# Safe Exam System (safe-seb)

He thong kiem tra bai thi an toan voi co che khoa man hinh sau khi nop bai va dong bo ket qua ve Supabase.

## 1. Cong nghe lua chon (Tech Stack)

### Frontend (Giao dien lam bai)
- Cong nghe: HTML5 + CSS3 + JavaScript thuan (Vanilla JS).
- Dac diem: Khong dung framework nang (React/Vue), dung luong duoi 50 KB, tai tuc thi, tiet kiem RAM toi da tren dien thoai.

### Backend & Database (Xu ly du lieu & Luu tru)
- Cong nghe: Supabase REST API truc tiep (PostgREST + PostgreSQL).
- Dac diem: Khong can dung server trung gian, he thong giao tiep thang voi Supabase qua giao thuc HTTPS bao mat.
- Kha nang mo rong (Scale): Chuan doanh nghiep, xu ly tot tu 1-2 nguoi hien tai den hang ngan thi sinh nop bai dong thoi ma khong lo nghen co chai.

### Android Client (Bo khung khoa may)
- Cong nghe: Android Kotlin Native (WebView + Kiosk Mode).
- Dac diem: Dung luong file APK cuc nhe (duoi 3 MB). Nhap giao dien HTML truc tiep qua WebView va kich hoat API he dieu hanh startLockTask de vo hieu hoa nut Home, nut Back va thanh thong bao.

## 2. Luong hoat dong chi tiet

1. Thi sinh mo App tren Android: App tu dong kich hoat che do Kiosk Mode, khoa cung toan bo thao tac thoat may.
2. Thi sinh lam bai thi: Bai lam duoc tu dong luu nhap vao bo nho may de chong mat du lieu khi het pin hoac su co dot ngot.
3. Thi sinh bam Nop bai:
   - He thong tinh toan diem so.
   - Gui ket qua truc tiep len Supabase qua REST API.
   - Cho phan hoi xac nhan luu thanh cong tu Supabase (HTTP 201 Created).
4. Khoa hoan tat:
   - Man hinh chuyen sang trang thai Khoa bai thi.
   - Khong the vuot thoat khoi man hinh duoi bat ky hinh thuc nao.
5. Giai phong thiet bi:
   - Giam thi kiem tra diem so tren Dashboard.
   - Nhap dung mat khau PROCTOR_UNLOCK_PASSWORD de mo khoa Kiosk Mode va tra lai dien thoai binh thuong.

## 3. Cau hinh moi truong (.env)
- SUPABASE_URL: Dia chi ket noi du an Supabase.
- SUPABASE_PUBLISHABLE_KEY: Khoa truy cap API cong khai.
- SUPABASE_DB_PASSWORD: Mat khau co so du lieu PostgreSQL.
- PROCTOR_UNLOCK_PASSWORD: Mat khau giam thi dung de mo khoa man hinh.
- PORT: Cong chay may chu kiem thu noi bo.
