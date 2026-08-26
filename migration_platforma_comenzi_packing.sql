-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă starea de împachetare pe fiecare linie de comandă din platforma_comenzi, pentru noua
-- pagină de Staff (/staff) — fiecare produs dintr-o comandă se poate marca independent ca
-- împachetat sau ca indisponibil la împachetare (stoc zero fizic, deși vânzarea era înregistrată).
-- "Stoc zero" NU modifică stocul produsului — doar semnalează discrepanța, pentru control ulterior.

alter table platforma_comenzi add column if not exists impachetat boolean default false;
alter table platforma_comenzi add column if not exists impachetat_at timestamptz;
alter table platforma_comenzi add column if not exists fara_stoc boolean default false;
alter table platforma_comenzi add column if not exists fara_stoc_at timestamptz;

select 'Coloanele de impachetare au fost adaugate la platforma_comenzi.' as status;
