-- Rulează în Supabase Dashboard → SQL Editor.
-- Repară eroarea "canceling statement due to statement timeout" (cod 57014) la încărcarea
-- inventarului. Cauză: coloana produse.img stochează pozele direct ca base64 în baza de date
-- (nu ca URL către un fișier găzduit separat), iar la 217 produse asta înseamnă ~30MB doar
-- pentru poze. Rolul "anon" (folosit de aplicație prin cheia publică) are implicit un
-- statement_timeout de 8 secunde pe Supabase — peste acest prag orice interogare, oricât de
-- simplă, e anulată automat de Postgres. Mărim pragul la 30 de secunde pentru rolul anon.
--
-- Notă: e un plasture, nu o rezolvare definitivă — tabelul produse va continua să crească.
-- Soluția corectă pe termen lung e mutarea pozelor în Supabase Storage (fișiere reale, doar
-- URL-ul rămâne în coloana img) — de discutat separat, e o schimbare mai mare.

alter role anon set statement_timeout = '30s';

select 'Timeout-ul rolului anon a fost mărit la 30s.' as status;
