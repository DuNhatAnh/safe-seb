-- Ma de = so NGAU NHIEN 5 chu so (10000-99999), khong trung.
--   - Ngau nhien (khong tang dan 1, 2, 3...) de hoc sinh khong doan duoc ma cua de khac.
--   - Database tu cap khi tao de (admin / script khong can tu dat).
--   - De cu (ma 1, 2, 3...) duoc doi sang ma 5 so; ket qua + su co dang tro toi de cu cap nhat theo.

create or replace function random_exam_id() returns bigint
language plpgsql
as $$
declare
  candidate bigint;
begin
  loop
    candidate := 10000 + floor(random() * 90000)::bigint;
    exit when not exists (select 1 from exams where id = candidate);
  end loop;
  return candidate;
end
$$;

-- Bo tu tang (identity), dung ham tren lam gia tri mac dinh
alter table exams alter column id drop identity if exists;
alter table exams alter column id set default random_exam_id();

-- Doi ma cac de cu sang 5 chu so
do $$
declare
  old_id bigint;
  new_id bigint;
begin
  for old_id in select id from exams where id < 10000 or id > 99999 order by id loop
    new_id := random_exam_id();
    update exams set id = new_id where id = old_id;
    update exam_results set exam_id = new_id where exam_id = old_id;
    update exam_events set exam_id = new_id where exam_id = old_id;
  end loop;
end
$$;

-- Tu nay moi ma de deu phai 5 chu so
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'exams_id_five_digits') then
    alter table exams add constraint exams_id_five_digits check (id between 10000 and 99999);
  end if;
end
$$;
