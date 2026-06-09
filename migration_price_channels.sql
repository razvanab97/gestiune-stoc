-- Rulează în Supabase Dashboard → SQL Editor înainte de folosirea prețurilor pe canale.
alter table produse add column if not exists price_emag numeric(10,2) default 0;
alter table produse add column if not exists price_trendyol numeric(10,2) default 0;
