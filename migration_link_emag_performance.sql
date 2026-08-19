-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă coloana "emag_performance" pe research_links — apreciere MANUALĂ a performanței unei
-- listări eMAG (Target Zone: supercold/cold/standard/hot/superhot), pe baza analizei/căutărilor
-- proprii, nu calculată automat. Afișată în tabelul dosarului, coloana „Performanță eMAG".

alter table research_links add column if not exists emag_performance text;

select 'Coloana emag_performance a fost adăugată cu succes în research_links.' as status;
