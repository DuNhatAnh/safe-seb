-- Mat khau vao de (moi de bat / tat rieng, MAC DINH TAT).
--   require_password: true -> hoc sinh phai nhap mat khau (giam thi doc khi phat de) moi lay duoc de
--   entry_password:   ma 6 so ngau nhien, KHAC ma giam thi (ma giam thi dung de thoat / mo khoa / cho lam lai,
--                     neu dung chung thi ca phong biet ma giam thi)
alter table exams add column if not exists require_password boolean not null default false;
alter table exams add column if not exists entry_password text;
