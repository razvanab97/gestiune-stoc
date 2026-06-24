-- =============================================
-- STOC MANAGER — Supabase Schema
-- Rulează în: Supabase Dashboard → SQL Editor
-- =============================================

-- PRODUSE
create table if not exists produse (
  id bigint primary key generated always as identity,
  name text not null,
  sku text,
  internal_code text,
  category text,
  supplier text,
  bought numeric(10,2) default 0,
  incoming_qty numeric(10,2) default 0,
  sold numeric(10,2) default 0,
  min_qty numeric(10,2) default 0,
  price_buy_ttc numeric(10,2) default 0,
  price_buy_prev_ttc numeric(10,2) default 0,
  price_buy_changed_at timestamptz,
  tva_acq numeric(4,2) default 0.21,
  price_sell numeric(10,2) default 0,
  price_emag numeric(10,2) default 0,
  price_trendyol numeric(10,2) default 0,
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
alter table produse add column if not exists internal_code text;
alter table produse add column if not exists incoming_qty numeric(10,2) default 0;
alter table produse add column if not exists price_emag numeric(10,2) default 0;
alter table produse add column if not exists price_trendyol numeric(10,2) default 0;
alter table produse add column if not exists price_buy_prev_ttc numeric(10,2) default 0;
alter table produse add column if not exists price_buy_changed_at timestamptz;

alter table produse alter column bought type numeric(10,2) using bought::numeric;
alter table produse alter column incoming_qty type numeric(10,2) using incoming_qty::numeric;
alter table produse alter column sold type numeric(10,2) using sold::numeric;
alter table produse alter column min_qty type numeric(10,2) using min_qty::numeric;
alter table produse alter column price_buy_prev_ttc type numeric(10,2) using price_buy_prev_ttc::numeric;

update produse
set internal_code = 'AB' || to_char(coalesce(created_at, now()) at time zone 'Europe/Bucharest', 'MMDD') || id
where internal_code is null or internal_code = '';

create unique index if not exists idx_produse_internal_code on produse(internal_code) where internal_code is not null and internal_code <> '';

create or replace function set_product_internal_code()
returns trigger as $$
begin
  if new.internal_code is null or new.internal_code = '' then
    new.internal_code := 'AB' || to_char(coalesce(new.created_at, now()) at time zone 'Europe/Bucharest', 'MMDD') || new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists produse_internal_code on produse;
create trigger produse_internal_code before insert on produse for each row execute function set_product_internal_code();

-- VANZARI ZILNICE (today sales cache)
create table if not exists vanzari_zilnice (
  id bigint primary key generated always as identity,
  data date not null default current_date,
  product_id bigint references produse(id) on delete cascade,
  qty numeric(10,2) default 0,
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
  qty numeric(10,2) default 0,
  created_at timestamptz default now()
);

alter table vanzari_zilnice alter column qty type numeric(10,2) using qty::numeric;
alter table jurnal alter column qty type numeric(10,2) using qty::numeric;

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

-- OBSERVAȚII PREȚURI DIN RESEARCH / LISTĂRI EXTERNE
create table if not exists listing_price_observations (
  id bigint primary key generated always as identity,
  product_name text,
  source_url text not null,
  platform text,
  listing_title text,
  price numeric(10,2),
  currency text default 'RON',
  match_score integer default 0,
  optimization_score integer default 0,
  is_same_product text,
  image_url text,
  notes text,
  created_at timestamptz default now()
);

-- SETĂRI GLOBALE APLICAȚIE
create table if not exists setari_app (
  key text primary key,
  value text,
  updated_at timestamptz default now()
);

-- ISTORIC COMENZI / INCARCARI STOC
create table if not exists comenzi_stoc (
  id bigint primary key generated always as identity,
  source text default 'Import stoc',
  total_items integer default 0,
  total_qty numeric(10,2) default 0,
  total_value numeric(12,2) default 0,
  updated_count integer default 0,
  created_count integer default 0,
  skipped_count integer default 0,
  details jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

-- DOSARE RESEARCH PRODUSE
create table if not exists research_projects (
  id bigint primary key generated always as identity,
  title text not null,
  acquisition_price numeric(10,2) default 0,
  supplier text,
  verdict text default 'Date insuficiente',
  listing_status text default 'negenerat',
  listing jsonb default '{}'::jsonb,
  profit_estimated numeric(10,2) default 0,
  margin_estimated numeric(6,2) default 0,
  max_buy_price numeric(10,2) default 0,
  notes text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists research_links (
  id bigint primary key generated always as identity,
  project_id bigint not null references research_projects(id) on delete cascade,
  url text not null,
  normalized_url text not null,
  platform text default 'altul',
  pnk text,
  title text,
  price numeric(10,2) default 0,
  currency text default 'RON',
  rating numeric(4,2) default 0,
  review_count integer default 0,
  images jsonb default '[]'::jsonb,
  specs jsonb default '{}'::jsonb,
  description text,
  duplicate_of bigint references research_links(id) on delete set null,
  duplicate_type text default 'none',
  include_in_listing boolean default true,
  status text default 'analizat',
  error text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- INDEX-uri pentru performanță
create index if not exists idx_vanzari_data on vanzari_zilnice(data);
create index if not exists idx_jurnal_data on jurnal(data desc);
create index if not exists idx_jurnal_product on jurnal(product_id);
create index if not exists idx_mapari_produs on platforma_mapari(produs_id);
create index if not exists idx_mapari_platforma on platforma_mapari(platforma);
create index if not exists idx_lpo_product on listing_price_observations(product_name);
create index if not exists idx_lpo_url on listing_price_observations(source_url);
create index if not exists idx_lpo_created on listing_price_observations(created_at desc);
create index if not exists idx_research_projects_updated on research_projects(updated_at desc);
create index if not exists idx_research_links_project on research_links(project_id);
create index if not exists idx_research_links_norm on research_links(project_id, normalized_url);
create index if not exists idx_research_links_pnk on research_links(project_id, pnk) where pnk is not null and pnk <> '';
create index if not exists idx_comenzi_stoc_created on comenzi_stoc(created_at desc);

alter table research_projects add column if not exists listing jsonb default '{}'::jsonb;

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
alter table listing_price_observations disable row level security;
alter table setari_app disable row level security;
alter table comenzi_stoc disable row level security;
alter table research_projects disable row level security;
alter table research_links disable row level security;

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on research_projects to anon, authenticated;
grant select, insert, update, delete on research_links to anon, authenticated;
grant select, insert, update, delete on comenzi_stoc to anon, authenticated;

-- Confirmare
select 'Schema creat cu succes!' as status;
