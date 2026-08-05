-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă coloanele pentru marcarea produselor ca "epuizate la furnizor", cu data
-- estimată de revenire în stoc și notificare opțională când se ajunge la acea dată.

alter table produse add column if not exists supplier_oos boolean default false;
alter table produse add column if not exists supplier_oos_since timestamptz;
alter table produse add column if not exists supplier_restock_eta date;
alter table produse add column if not exists supplier_notify boolean default false;
alter table produse add column if not exists supplier_notified boolean default false;

select 'Coloanele pentru "epuizat la furnizor" au fost adăugate cu succes.' as status;
