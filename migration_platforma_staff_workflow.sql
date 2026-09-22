-- COMENZI PLATFORME / STAFF — flux explicit de includere, finalizare si AWB-uri din PDF.
-- Ruleaza in Supabase Dashboard -> SQL Editor.
-- Este idempotent: sigur de rulat si peste schema existenta.

alter table platforma_comenzi add column if not exists staff_inclus_at timestamptz;
alter table platforma_comenzi add column if not exists staff_finalizat_at timestamptz;
alter table platforma_comenzi add column if not exists awb_source_file text;
alter table platforma_comenzi add column if not exists awb_source_page integer;

create index if not exists idx_platforma_comenzi_staff_inclus
  on platforma_comenzi(staff_inclus_at desc)
  where staff_inclus_at is not null;

-- AWB-urile fara comanda nu sunt ignorate: raman aici cu sursa exacta, ca Admin sa le poata
-- reconcilia dupa ce importa comanda lipsa. `source_key` previne dublarea aceleiasi erori.
create table if not exists staff_awb_erori (
  id bigint primary key generated always as identity,
  source_key text not null unique,
  source_file text,
  source_page integer,
  awb text,
  comanda_id text,
  platforma text,
  reason text not null default 'Comanda nu exista in platforma_comenzi',
  resolved boolean not null default false,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_staff_awb_erori_open
  on staff_awb_erori(created_at desc)
  where resolved=false;

alter table staff_awb_erori disable row level security;
grant select, insert, update, delete on staff_awb_erori to anon, authenticated;
grant usage, select on sequence staff_awb_erori_id_seq to anon, authenticated;

select 'Flux Staff/AWB pregatit.' as status;
