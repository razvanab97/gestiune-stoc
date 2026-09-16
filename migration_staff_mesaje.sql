-- MESAJE / TASK-URI CĂTRE STAFF
-- Rulează o singură dată în Supabase Dashboard -> SQL Editor.
-- Este idempotent: poate fi rulat din nou fără să șteargă mesaje existente.

create table if not exists staff_mesaje (
  id bigint primary key generated always as identity,
  text text not null check (length(trim(text)) > 0),
  tip text not null default 'mesaj' check (tip in ('mesaj','task')),
  rezolvat boolean not null default false,
  rezolvat_at timestamptz,
  rezolvat_by text,
  created_at timestamptz not null default now()
);

create index if not exists idx_staff_mesaje_active
  on staff_mesaje (rezolvat, created_at asc)
  where rezolvat = false;

alter table staff_mesaje disable row level security;
grant select, insert, update, delete on staff_mesaje to anon, authenticated;
grant usage, select on sequence staff_mesaje_id_seq to anon, authenticated;

notify pgrst, 'reload schema';

select 'Tabela staff_mesaje este pregătită.' as status;
