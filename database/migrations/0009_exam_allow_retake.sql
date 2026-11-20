-- Cho lam lai nhieu lan (moi de bat / tat rieng, MAC DINH TAT).
--   false: moi thi sinh lam 1 luot; lam lai phai nho giam thi nhap mat khau de (su co CHO_LAM_LAI)
--   true:  thi sinh tu bam "Lam lai" bao nhieu lan cung duoc, khong can mat khau
alter table exams add column if not exists allow_retake boolean not null default false;
