-- 1) Luot duoc mo khi giam thi cho lam lai: luu so thu tu luot (= so lan da nop + 1 luc cho lam lai).
--    De tung bat "cho lam lai nhieu lan" (nop nhieu hon so luot cap) roi tat: lan cho lam lai sau van mo duoc 1 luot.
--    Su co cu (attempt null) van tinh nhu truoc: moi su co CHO_LAM_LAI = them 1 luot.
alter table exam_events add column if not exists attempt integer;

-- 2) Chong nop trung: trinh duyet sinh 1 khoa ngau nhien cho moi luot lam bai, gui kem khi nop.
--    Nop lai cung khoa (mat phan hoi -> bam "Thu nop lai") -> server tra lai ket qua da luu, khong tao ban ghi moi.
alter table exam_results add column if not exists submission_key text;
create unique index if not exists exam_results_submission_key_idx
  on exam_results (exam_id, student_name, submission_key)
  where submission_key is not null;
