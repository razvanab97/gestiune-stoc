-- Rulează în Supabase Dashboard → SQL Editor.
-- Creează tabela pentru jurnalul de mișcări de stoc (notificările cu intrări/ieșiri,
-- afișate cu dată și oră în clopoțelul din antet). Fără acest tabel, notificările
-- funcționează doar local (localStorage), pe acest dispozitiv/browser.

create table if not exists activitate_stoc (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  tip text not null check (tip in ('in','out')),
  product_id bigint,
  product_name text not null,
  qty numeric(10,2) default 0,
  sursa text
);

create index if not exists idx_activitate_stoc_created on activitate_stoc(created_at desc);
alter table activitate_stoc disable row level security;
grant select, insert, update, delete on activitate_stoc to anon, authenticated;

select 'Tabela activitate_stoc a fost creată cu succes.' as status;
