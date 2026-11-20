-- Khoa bai khi hoc sinh roi trang (moi de bat / tat rieng, MAC DINH TAT = khong can mat khau khi lam bai).
--   false: roi trang -> chi canh bao + ghi nhat ky, hoc sinh tu quay lai lam tiep
--   true:  roi trang -> bai bi khoa, giam thi nhap ma giam thi moi mo duoc
alter table exams add column if not exists lock_on_leave boolean not null default false;

-- Danh sach de moi nhat truoc (ma de la so ngau nhien nen sap theo thoi gian tao)
create index if not exists exams_created_at_idx on exams (created_at desc);
