-- Lich su phien ban (tu dong bo tu CHANGELOG.md khi deploy: npm run build -> scripts/db.ts sync-versions).
--   requires_app_update: phien ban nay bat buoc go app Android cu, cai lai ban moi.
--   App Android cu hon phien ban bat buoc moi nhat -> trang web chan, yeu cau tai ban moi.
create table if not exists app_versions (
  version text primary key,                          -- "1.3"
  released_at timestamp with time zone not null default now(),
  notes text not null default '',                    -- cac thay doi (markdown, lay tu CHANGELOG.md)
  requires_app_update boolean not null default false
);

-- Nhu cac bang khac: trinh duyet khong truy cap truc tiep, moi thao tac qua server (service_role)
alter table app_versions enable row level security;

-- Vai tro anon / authenticated chi co tren Supabase (Postgres thuong / test khong co)
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'anon') then
    revoke all on app_versions from anon, authenticated;
  end if;
end $$;
