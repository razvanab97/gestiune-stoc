-- Rulează în Supabase Dashboard → SQL Editor.
-- Repară pagina Research, complet nefuncțională momentan din 2 motive:
--
-- 1. RLS încă activat pe research_projects și research_links (deși
--    supabase_setup.sql cerea dezactivarea lui) — orice creare de dosar sau
--    adăugare de link eșua silențios cu „new row violates row-level security
--    policy" (același bug ca la activitate_stoc, reparat anterior).
-- 2. Tabela listing_price_observations (scorecard competitori / prețuri
--    observate) nu a fost creată deloc — lipsește complet din baza de date.

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

create index if not exists idx_lpo_product on listing_price_observations(product_name);
create index if not exists idx_lpo_url on listing_price_observations(source_url);
create index if not exists idx_lpo_created on listing_price_observations(created_at desc);

alter table research_projects disable row level security;
alter table research_links disable row level security;
alter table listing_price_observations disable row level security;

grant select, insert, update, delete on research_projects to anon, authenticated;
grant select, insert, update, delete on research_links to anon, authenticated;
grant select, insert, update, delete on listing_price_observations to anon, authenticated;

select 'Research funcțional — research_projects, research_links, listing_price_observations sunt gata.' as status;
