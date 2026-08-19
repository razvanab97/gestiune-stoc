-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă flag-ul "finalizat" pe dosarele Research — pentru dosare încheiate (produs deja adăugat
-- în Inventar, sau pur și simplu decizie luată), ca să poată fi ascunse din lista activă (implicit)
-- fără să fie șterse — rămân disponibile oricând din comutatorul „Arată dosarele finalizate".

alter table research_projects add column if not exists finalizat boolean default false;

select 'Coloana finalizat a fost adăugată cu succes în research_projects.' as status;
