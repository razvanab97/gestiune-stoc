-- Rulează în Supabase Dashboard → SQL Editor.
-- Preț „blocat" din ultima listare/factură — cerut direct: „prețul preluat din listare - factură care
-- rămâne stabilit până la următoarea încărcare de produs din listarea acestui produs". Distinct de
-- price_buy_ttc (care se poate schimba și dintr-o editare manuală în fișa produsului) — acesta se
-- actualizează STRICT la reaprovizionare reală (Importă factură / Adaugă stoc în masă), nu la o simplă
-- corecție de preț din formular.

alter table produse add column if not exists last_invoice_price_ttc numeric default 0;
alter table produse add column if not exists last_invoice_price_at timestamptz;

select 'Coloanele last_invoice_price_ttc / last_invoice_price_at au fost adăugate cu succes.' as status;
