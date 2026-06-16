-- Rulează în Supabase Dashboard → SQL Editor pentru salvarea prețurilor din Research / Analiză listări.

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

alter table listing_price_observations disable row level security;
