-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă descrierea dezvoltată pentru client și galeria de imagini tematice a produsului —
-- distincte de `notes` (note interne, nu pentru client) și de `img` (poza principală unică).
-- Populate automat la "Adaugă produs din link" (importFromUrl) și la "Aplică în produs"
-- din Research, via api/listing-builder.js.

alter table produse add column if not exists description text;
alter table produse add column if not exists images jsonb default '[]'::jsonb;

select 'Coloanele description/images pentru produse au fost adăugate cu succes.' as status;
