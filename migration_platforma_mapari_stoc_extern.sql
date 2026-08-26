-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă stoc_extern + stoc_extern_actualizat_la la platforma_mapari — ultimul stoc raportat de
-- eMAG/Trendyol pentru o listare deja mapată, citit din coloana Stock/Stoc a exportului Seller
-- Center la reimport în Sincronizare → "Import în masă din fișier". Permite semnalarea discrepanțelor
-- față de stocul intern: stoc intern >0 dar eMAG arată 0 (vânzare pierdută) sau stoc intern 0 dar
-- eMAG arată >0 (risc de suprastocare/anulare comandă) — vezi cardul "Discrepanțe de stoc eMAG" din
-- pagina Sincronizare.

alter table platforma_mapari add column if not exists stoc_extern integer;
alter table platforma_mapari add column if not exists stoc_extern_actualizat_la timestamptz;

select 'Coloanele stoc_extern / stoc_extern_actualizat_la au fost adăugate la platforma_mapari.' as status;
