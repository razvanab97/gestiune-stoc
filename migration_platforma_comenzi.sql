-- Rulează în Supabase Dashboard → SQL Editor.
-- Creează tabela pentru comenzile reale importate din eMAG/Trendyol (preț de
-- vânzare, cantitate, dată) — folosită de tab-ul nou "📦 Comenzi Platforme"
-- (Import comenzi / Profit vânzări / Total încasări).

create table if not exists platforma_comenzi (
  id bigint primary key generated always as identity,
  platforma text not null,          -- 'emag' | 'trendyol'
  data date not null,               -- data reală a comenzii (din fișier), nu data importului
  comanda_id text,                  -- Nr. comandă
  pnk text,                         -- PNK eMAG — identificator stabil al listării, cheie de asociere pe termen lung
  tara text,                        -- 'RO' | 'HU' | 'BG' — dedusă din moneda comenzii (RON/HUF/EUR), doar pentru eMAG
  cod_produs text,                  -- "Cod produs" din fișierul eMAG (codul propriu al vânzătorului), păstrat pentru referință
  titlu_extern text not null,       -- titlul exact de pe listare (ultima denumire văzută pentru acest PNK)
  produs_id bigint references produse(id) on delete set null,
  produs_nume text,
  cantitate numeric(10,2) not null default 1,
  pret_fara_tva numeric(10,2) not null default 0,     -- preț unitar fără TVA, în moneda originală
  pret_total_cu_tva numeric(10,2) not null default 0, -- preț total linie (cantitate inclusă) cu TVA, în moneda originală
  moneda text default 'RON',
  pret_total_cu_tva_ron numeric(10,2) default 0,      -- convertit în RON, pentru agregări rapide (Profit/Total încasări)
  profit_estimat numeric(10,2) default 0,
  marja_estimata numeric(6,2) default 0,
  import_batch_id text,             -- grupează liniile dintr-un singur upload
  created_at timestamptz default now()
);

create index if not exists idx_platforma_comenzi_platforma_data on platforma_comenzi(platforma, data);
create index if not exists idx_platforma_comenzi_produs on platforma_comenzi(produs_id);
create index if not exists idx_platforma_comenzi_batch on platforma_comenzi(import_batch_id);
create index if not exists idx_platforma_comenzi_pnk on platforma_comenzi(pnk);
-- Reimportarea aceluiași fișier (aceeași comandă + PNK) nu creează linii duplicate.
create unique index if not exists uq_platforma_comenzi_linie on platforma_comenzi(platforma, comanda_id, coalesce(pnk,cod_produs,titlu_extern));

alter table platforma_comenzi disable row level security;
grant select, insert, update, delete on platforma_comenzi to anon, authenticated;

select 'Tabela platforma_comenzi a fost creată cu succes.' as status;
