-- COMENZI PLATFORME / STAFF — numele curierului (Sameday/DPD/FAN Courier/GLS/Cargus), retinut la
-- asocierea AWB-ului, ca Staff sa-l poata afisa direct pe card, inainte de numarul AWB.
-- Ruleaza in Supabase Dashboard -> SQL Editor. Este idempotent: sigur de rulat si peste schema existenta.

alter table platforma_comenzi add column if not exists awb_courier text;
alter table staff_awb_erori add column if not exists courier text;

select 'Coloana awb_courier pregatita.' as status;
