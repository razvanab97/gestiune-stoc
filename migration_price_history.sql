-- Rulează în Supabase Dashboard → SQL Editor.
-- Creează tabela pentru istoricul modificărilor de preț (achiziție, vânzare, eMAG,
-- Trendyol), afișat în secțiunea "Istoric modificări de preț" din fișa fiecărui produs.
-- Fără acest tabel, istoricul funcționează doar local (localStorage), pe acest
-- dispozitiv/browser.

create table if not exists istoric_preturi (
  id bigint primary key generated always as identity,
  created_at timestamptz default now(),
  product_id bigint,
  product_name text not null,
  tip_pret text not null,
  pret_vechi numeric(10,2) default 0,
  pret_nou numeric(10,2) default 0,
  sursa text
);

create index if not exists idx_istoric_preturi_created on istoric_preturi(created_at desc);
create index if not exists idx_istoric_preturi_product on istoric_preturi(product_id);
alter table istoric_preturi disable row level security;
grant select, insert, update, delete on istoric_preturi to anon, authenticated;

select 'Tabela istoric_preturi a fost creată cu succes.' as status;
