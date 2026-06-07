-- =============================================
-- STOC MANAGER — Supabase Schema
-- Rulează în: Supabase Dashboard → SQL Editor
-- =============================================

-- PRODUSE
create table if not exists produse (
  id bigint primary key generated always as identity,
  name text not null,
  sku text,
  category text,
  supplier text,
  bought integer default 0,
  sold integer default 0,
  min_qty integer default 0,
  price_buy_ttc numeric(10,2) default 0,
  tva_acq numeric(4,2) default 0.21,
  price_sell numeric(10,2) default 0,
  price_rec numeric(10,2) default 0,
  img text,
  -- Caracteristici produs
  colors text,
  sizes text,
  material text,
  dims text,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Dacă tabelul există deja, adaugă coloanele noi
alter table produse add column if not exists colors text;
alter table produse add column if not exists sizes text;
alter table produse add column if not exists material text;
alter table produse add column if not exists dims text;
alter table produse add column if not exists notes text;

-- VANZARI ZILNICE (today sales cache)
create table if not exists vanzari_zilnice (
  id bigint primary key generated always as identity,
  data date not null default current_date,
  product_id bigint references produse(id) on delete cascade,
  qty integer default 0,
  unique(data, product_id)
);

-- JURNAL VANZARI
create table if not exists jurnal (
  id bigint primary key generated always as identity,
  data date not null,
  product_id bigint,
  product_name text not null,
  category text,
  price_sell numeric(10,2) default 0,
  img text,
  qty integer default 0,
  created_at timestamptz default now()
);

-- MAPARI PLATFORME (eMAG/Trendyol -> produs local, pt. sincronizare stoc)
create table if not exists platforma_mapari (
  id bigint primary key generated always as identity,
  platforma text not null, -- 'emag' | 'trendyol'
  id_extern text,          -- id-ul listării pe platformă (când e cunoscut, via API)
  titlu_extern text not null, -- titlul listării pe platformă (ancoră de potrivire, SKU-urile nu coincid)
  produs_id bigint not null references produse(id) on delete cascade,
  confirmat boolean default true,
  created_at timestamptz default now()
);

-- INDEX-uri pentru performanță
create index if not exists idx_vanzari_data on vanzari_zilnice(data);
create index if not exists idx_jurnal_data on jurnal(data desc);
create index if not exists idx_jurnal_product on jurnal(product_id);
create index if not exists idx_mapari_produs on platforma_mapari(produs_id);
create index if not exists idx_mapari_platforma on platforma_mapari(platforma);

-- Auto-update updated_at pe produse
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger if not exists produse_updated_at
  before update on produse
  for each row execute function update_updated_at();

-- ROW LEVEL SECURITY — dezactivat (singur utilizator, fara auth)
alter table produse disable row level security;
alter table vanzari_zilnice disable row level security;
alter table jurnal disable row level security;
alter table platforma_mapari disable row level security;

-- Confirmare
select 'Schema creat cu succes!' as status;
