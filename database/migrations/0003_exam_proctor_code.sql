-- Ma giam thi 6 so cua tung de (server sinh ngau nhien; admin xem / doi o trang quan tri).
-- Dung de: thoat khan cap, thoat ung dung, mo khoa bai, cho lam lai. Khong bao gio gui cho thi sinh.
alter table exams add column if not exists proctor_code text;
