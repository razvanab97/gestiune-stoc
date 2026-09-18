-- Rulează în Supabase Dashboard → SQL Editor.
-- Marfă așteptată de la furnizor — SEPARAT de comenzi_stoc (care e pentru facturi deja sosite,
-- procesate prin „Importă factură"). Aici sunt comenzi plasate la furnizor, ÎNCĂ pe drum — un rând
-- per PRODUS (nu per comandă întreagă), ca fiecare linie să poată fi urmărită independent în Staff:
-- „✗ Nu a ajuns", „◐ A ajuns parțial” (cantitate_sosita se adună la fiecare raportare), sau bifată
-- în bloc prin „✓ Tot restul a ajuns”. Nu atinge stocul intern — asta rămâne strict la Importă factură.

create table if not exists comenzi_furnizor (
  id bigint primary key generated always as identity,
  furnizor text not null,
  comanda_ref text,
  titlu_extern text not null,
  cod_extern text,
  produs_id bigint references produse(id) on delete set null,
  cantitate_comandata numeric(10,2) not null default 0,
  cantitate_sosita numeric(10,2) not null default 0,
  pret numeric(10,2) default 0,
  finalizat boolean not null default false,
  finalizat_at timestamptz,
  nu_a_sosit boolean not null default false,
  nu_a_sosit_at timestamptz,
  nu_a_sosit_nota text,
  nu_a_sosit_rezolvat boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_comenzi_furnizor_activ on comenzi_furnizor(finalizat) where finalizat=false;
create index if not exists idx_comenzi_furnizor_nu_a_sosit on comenzi_furnizor(nu_a_sosit, nu_a_sosit_rezolvat) where nu_a_sosit=true and nu_a_sosit_rezolvat=false;
create index if not exists idx_comenzi_furnizor_produs on comenzi_furnizor(produs_id);

alter table comenzi_furnizor disable row level security;
grant select, insert, update, delete on comenzi_furnizor to anon, authenticated;
grant usage, select on sequence comenzi_furnizor_id_seq to anon, authenticated;

select 'Tabela comenzi_furnizor a fost creata cu succes.' as status;
