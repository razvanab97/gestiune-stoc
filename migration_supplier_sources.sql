-- SURSE ALTERNATIVE DE FURNIZOR PE PRODUS
-- Rulează o singură dată în Supabase Dashboard -> SQL Editor.
-- Păstrează un produs unic în inventar; nu creează tabel sau stoc separat.

alter table produse add column if not exists supplier_sources jsonb default '[]'::jsonb;

notify pgrst, 'reload schema';

select 'Sursele alternative de furnizor sunt pregătite.' as status;
