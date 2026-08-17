-- Rulează în Supabase Dashboard → SQL Editor.
-- Fix: platforma_comenzi are RLS activat, deși migrarea inițială spunea "disable row level
-- security" — același comportament întâlnit și la activitate_stoc/research_projects/research_links
-- mai devreme în proiect. Rezultat: orice import de comenzi eșua cu "new row violates row-level
-- security policy" (cod 42501), iar liniile nu ajungeau niciodată în tabelă.

alter table platforma_comenzi disable row level security;
grant select, insert, update, delete on platforma_comenzi to anon, authenticated;

select 'RLS dezactivat pe platforma_comenzi.' as status;
