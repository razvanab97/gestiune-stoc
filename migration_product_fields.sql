-- Rulează în Supabase Dashboard → SQL Editor.
-- Completează schema produselor existente cu toate câmpurile folosite de aplicație.

alter table produse add column if not exists incoming_qty integer default 0;
alter table produse add column if not exists price_emag numeric(10,2) default 0;
alter table produse add column if not exists price_trendyol numeric(10,2) default 0;
alter table produse add column if not exists tva_acq numeric(4,2) default 0.21;
alter table produse add column if not exists colors text;
alter table produse add column if not exists sizes text;
alter table produse add column if not exists material text;
alter table produse add column if not exists dims text;
alter table produse add column if not exists notes text;

select 'Câmpurile produselor au fost adăugate cu succes.' as status;
