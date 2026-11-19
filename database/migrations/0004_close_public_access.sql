-- Trinh duyet khong con truy cap Supabase truc tiep: moi thao tac qua server (khoa service_role, bo qua RLS).
-- Bat RLS, go moi policy mo cong khai cu, thu hoi quyen cua vai tro cong khai (anon / authenticated).
alter table exams enable row level security;
alter table exam_results enable row level security;
alter table app_settings enable row level security;
alter table exam_events enable row level security;

drop policy if exists "Allow read exams" on exams;
drop policy if exists "Allow insert exams" on exams;
drop policy if exists "Allow update exams" on exams;
drop policy if exists "Allow delete exams" on exams;

drop policy if exists "Allow read exam_results" on exam_results;
drop policy if exists "Allow insert exam_results" on exam_results;
drop policy if exists "Allow update exam_results" on exam_results;

drop policy if exists "Allow read app_settings" on app_settings;
drop policy if exists "Allow insert app_settings" on app_settings;
drop policy if exists "Allow update app_settings" on app_settings;

drop policy if exists "Allow read exam_events" on exam_events;
drop policy if exists "Allow insert exam_events" on exam_events;

-- Vai tro anon / authenticated chi co tren Supabase (Postgres thuong / test khong co)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on exams, exam_results, app_settings, exam_events from anon, authenticated;
  end if;
end $$;
