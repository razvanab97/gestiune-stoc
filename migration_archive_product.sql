-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă coloanele pentru arhivarea produselor (ex: produse de Crăciun, sezoniere) —
-- produsele arhivate sunt ascunse din Inventar/Raport stoc, dar rămân în rapoartele
-- de stoc pentru contabilitate (CSV/Excel din Raport stoc).

alter table produse add column if not exists archived boolean default false;
alter table produse add column if not exists archived_at timestamptz;

create index if not exists idx_produse_archived on produse(archived);

select 'Coloanele pentru arhivare produse au fost adăugate cu succes.' as status;
