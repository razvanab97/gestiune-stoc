-- Rulează în Supabase Dashboard → SQL Editor.
-- Aceleași coloane de împachetare ca la platforma_comenzi (vezi migration_platforma_comenzi_packing.sql),
-- de data asta pe jurnal — pentru vânzările directe (nu de pe eMAG/Trendyol) care apar acum și ele
-- în pagina de Staff (/staff), lângă comenzile de platformă.

alter table jurnal add column if not exists impachetat boolean default false;
alter table jurnal add column if not exists impachetat_at timestamptz;
alter table jurnal add column if not exists fara_stoc boolean default false;
alter table jurnal add column if not exists fara_stoc_at timestamptz;

select 'Coloanele de impachetare au fost adaugate la jurnal.' as status;
