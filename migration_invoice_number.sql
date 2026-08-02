-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă numărul de factură / codul comenzii la istoricul de recepții stoc (comenzi_stoc),
-- ca să rămână o referință clară pentru fiecare import viitor de factură.

alter table comenzi_stoc add column if not exists invoice_number text;
create index if not exists idx_comenzi_stoc_invoice_number on comenzi_stoc(invoice_number) where invoice_number is not null and invoice_number <> '';

select 'Coloana invoice_number a fost adăugată cu succes.' as status;
