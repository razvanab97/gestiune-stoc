-- Rulează în Supabase Dashboard → SQL Editor.
-- Creează tabela pentru comenzile reale importate din eMAG/Trendyol (preț de
-- vânzare, cantitate, dată) — folosită de tab-ul nou "📦 Comenzi Platforme"
-- (Import comenzi / Profit vânzări / Total încasări).

create table if not exists platforma_comenzi (
  id bigint primary key generated always as identity,
  platforma text not null,          -- 'emag' | 'trendyol'
  data date not null,
  comanda_id text,                  -- numărul comenzii, dacă există în fișier
  titlu_extern text not null,       -- titlul exact de pe listare (ancoră de matching)
  produs_id bigint references produse(id) on delete set null,
  produs_nume text,
  cantitate numeric(10,2) not null default 1,
  pret_vanzare numeric(10,2) not null default 0,  -- preț unitar real din comandă
  moneda text default 'RON',
  profit_estimat numeric(10,2) default 0,
  marja_estimata numeric(6,2) default 0,
  import_batch_id text,             -- grupează liniile dintr-un singur upload
  created_at timestamptz default now()
);

create index if not exists idx_platforma_comenzi_platforma_data on platforma_comenzi(platforma, data);
create index if not exists idx_platforma_comenzi_produs on platforma_comenzi(produs_id);
create index if not exists idx_platforma_comenzi_batch on platforma_comenzi(import_batch_id);

alter table platforma_comenzi disable row level security;
grant select, insert, update, delete on platforma_comenzi to anon, authenticated;

select 'Tabela platforma_comenzi a fost creată cu succes.' as status;
