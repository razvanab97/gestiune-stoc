-- Rulează în Supabase Dashboard → SQL Editor.
-- Redesign coadă Staff: pragul de dată (setari_app.staff_queue_started_at) rămâne doar ca filtru de
-- performanță (fixat o singură dată la go-live, 2026-09-17), nu se mai resetează des. Curățarea de zi
-- cu zi a cozii active se face prin stare reală: impachetat/fara_stoc (deja existente) + coloana nouă
-- `anulata`, pentru liniile pe care adminul decide explicit că nu mai trebuie împachetate (test,
-- dublură, comandă anulată de client) — fără să atingă stocul sau Jurnalul de vânzări.

alter table platforma_comenzi add column if not exists anulata boolean default false;
alter table platforma_comenzi add column if not exists motiv_anulare text;
alter table jurnal add column if not exists anulata boolean default false;
alter table jurnal add column if not exists motiv_anulare text;

create index if not exists idx_platforma_comenzi_anulata on platforma_comenzi(anulata) where anulata=false;
create index if not exists idx_jurnal_anulata on jurnal(anulata) where anulata=false;

select 'Coloanele de anulare au fost adaugate la platforma_comenzi si jurnal.' as status;
