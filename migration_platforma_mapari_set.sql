-- Rulează în Supabase Dashboard → SQL Editor (o singură dată; e sigur de rulat și a doua oară).
-- Adaugă `componente` la platforma_mapari — SETURI: o listare eMAG/Trendyol care conține DOUĂ SAU MAI MULTE
-- produse din stoc. Valoarea e lista COMPLETĂ a componentelor, produsul principal primul, ex.:
--   [{"produs_id":123,"cantitate":1},{"produs_id":456,"cantitate":2}]
-- `produs_id` rămâne produsul principal (primul din listă), deci tot ce citește maparea ca „un singur produs"
-- continuă să funcționeze neschimbat. NULL/lipsă = mapare obișnuită, un singur produs.
-- Folosită în Sincronizare (➕ „Set? Adaugă alt produs"): prețul de achiziție al setului = suma componentelor ×
-- cantități, iar la comenzi profitul/marja se calculează pe acest cost total.

alter table platforma_mapari add column if not exists componente jsonb;

select 'Coloana componente a fost adăugată la platforma_mapari.' as status;
