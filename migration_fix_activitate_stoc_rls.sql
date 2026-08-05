-- Rulează în Supabase Dashboard → SQL Editor.
-- Repară eroarea "new row violates row-level security policy for table activitate_stoc":
-- tabela a rămas cu RLS activat (deși migration_activity_log.sql cerea dezactivarea lui),
-- ceea ce blochează silențios TOATE notificările de stoc (intrări/ieșiri) salvate cu
-- cheia anon folosită de aplicație — mișcările existau doar local, în browser, și
-- dispăreau la fiecare reîncărcare a paginii.

alter table activitate_stoc disable row level security;

select 'RLS dezactivat pe activitate_stoc — notificările de stoc se vor salva acum corect.' as status;
