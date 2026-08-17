-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă coloana "tara" (RO/HU/BG) la platforma_mapari — eMAG operează pe 3 piețe (România,
-- Ungaria, Bulgaria), fiecare cu propriul PNK pentru același produs. Coloana ține minte pe ce
-- piață e valabilă o asociere PNK↔produs, ca pagina produsului să poată arăta o coloană separată
-- per țară (vezi tab-ul "📦 Comenzi Platforme" → Import comenzi, care o completează automat din
-- moneda comenzii: RON→RO, HUF→HU, EUR→BG).

alter table platforma_mapari add column if not exists tara text;
create index if not exists idx_platforma_mapari_tara on platforma_mapari(platforma, tara);

select 'Coloana tara a fost adăugată la platforma_mapari.' as status;
