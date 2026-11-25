-- Update #775 — Staff: numărul din lot de pe etichetă (ex. „7/43") + textul de căutare citit de pe etichetă (nume destinatar, telefon).
-- Rulează o dată în Supabase → SQL Editor. Idempotent. Până atunci aplicația merge ca înainte (câmpurile noi se omit automat).
alter table platforma_comenzi add column if not exists awb_lot text;     -- ex. „7/43" = coletul 7 din 43 din lotul curierului
alter table platforma_comenzi add column if not exists awb_cauta text;   -- ex. „ion popescu | 0712345678 | *2055" — doar pentru Căutarea din Staff

-- Update #779 — „Verificare loturi AWB": numărul din lot și pe erorile de asociere (AWB-uri fără comandă), ca să se vadă „AWB-ul 29 există și nu are comandă".
alter table staff_awb_erori add column if not exists lot text;           -- ex. „29/30"
