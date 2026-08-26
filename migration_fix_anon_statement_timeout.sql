-- Rulează în Supabase Dashboard → SQL Editor.
-- Repară eroarea "canceling statement due to statement timeout" (cod 57014) la încărcarea
-- inventarului. Cauză: coloana produse.img stochează pozele direct ca base64 în baza de date
-- (nu ca URL către un fișier găzduit separat), iar la 217 produse asta înseamnă ~30MB doar
-- pentru poze. Peste acest volum, orice interogare, oricât de simplă, e anulată automat de
-- Postgres după un anumit timp.
--
-- Corecție față de prima versiune a acestei migrări: am încercat inițial "alter role anon",
-- dar API-ul Supabase (PostgREST) se conectează la Postgres autentificat ca rolul
-- "authenticator", apoi comută intern spre "anon" per cerere (SET ROLE) — iar Postgres
-- aplică setările de "alter role ... set" doar rolului cu care te-ai autentificat efectiv,
-- nu celui în care comuți ulterior. De-aia setarea pe "anon" n-a avut niciun efect. Corect e
-- pe "authenticator".
--
-- Notă: e un plasture, nu o rezolvare definitivă — tabelul produse va continua să crească.
-- Soluția corectă pe termen lung e mutarea pozelor în Supabase Storage (fișiere reale, doar
-- URL-ul rămâne în coloana img) — vezi migration_storage_product_images.sql și butonul
-- "📤 Migrează poze în Storage" din Raport stoc.

alter role authenticator set statement_timeout = '60s';

select 'Timeout-ul rolului authenticator a fost marit la 60s.' as status;
