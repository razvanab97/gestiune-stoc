-- Rulează în Supabase Dashboard → SQL Editor.
-- Termen de livrare furnizor (cerut direct): dată estimativă opțională („gata la furnizor”) — dacă
-- lipsește, termenul de 7 zile se calculează de la created_at (data plasării comenzii). Depășirea
-- termenului fără ca linia să fie marcată sosită/finalizată o trece automat pe „nu a sosit” (vezi
-- loadStaffIssues din index.html) — reutilizează exact fluxul existent de notificare, fără coloane noi
-- pentru asta.

alter table comenzi_furnizor add column if not exists data_estimativa date;

select 'Coloana data_estimativa a fost adăugată cu succes.' as status;
