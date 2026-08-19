-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă coloana "product_code" pe research_links — codul PROPRIU al furnizorului pentru produs
-- (ex. "Cod produs", "Cod Jumbo", SKU, Model — cum apare pe pagina sursă), distinct de EAN/cod de
-- bare. Extras automat la adăugarea linkului (fetch direct sau screenshot AI) și folosit la
-- "📦 Adaugă în Inventar" ca să precompleteze automat câmpul "SKU / Cod extern" al produsului.

alter table research_links add column if not exists product_code text;

select 'Coloana product_code a fost adăugată cu succes în research_links.' as status;
