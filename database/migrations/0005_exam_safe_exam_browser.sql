-- Safe Exam Browser (SEB) theo tung de.
--   require_seb:       true -> server chi gui de / nhan bai tu SEB (trinh duyet thuong bi tu choi)
--   seb_quit_password: mat khau thoat SEB (chuoi ngau nhien dai). File .seb chi chua SHA-256 cua no.
--                      Khac ma giam thi 6 so: SHA-256 cua 6 chu so do nguoc ra trong vai giay.
alter table exams add column if not exists require_seb boolean not null default false;
alter table exams add column if not exists seb_quit_password text;
