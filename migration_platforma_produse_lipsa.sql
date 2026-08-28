-- Rulează în Supabase Dashboard → SQL Editor.
-- Listări eMAG/Trendyol (din "Sincronizare" → Import în masă din fișier) fără niciun produs
-- corespunzător în Inventar, puse deoparte pentru mai târziu ("🕓 Mai târziu" pe rândul din
-- previzualizare) în loc de a fi create automat ca produs nou — util când nu toate listările de pe
-- platformă merită aduse înapoi în stoc curând. Nu ține nicio legătură cu produse(id): un rând de
-- aici NU e o mapare (platforma_mapari cere produs_id obligatoriu), ci doar o listă de așteptare;
-- la "+ Adaugă produs" din secțiunea "📥 Produse eMAG lipsă din stoc", produsul se creează normal,
-- iar apoi rândul de aici dispare și devine o mapare reală în platforma_mapari.

create table if not exists platforma_produse_lipsa (
  id bigint primary key generated always as identity,
  platforma text not null, -- 'emag' | 'trendyol'
  id_extern text,          -- PNK, dacă e cunoscut din fișierul importat
  titlu_extern text not null,
  created_at timestamptz default now()
);

create unique index if not exists idx_platforma_produse_lipsa_key
  on platforma_produse_lipsa(platforma, coalesce(id_extern,''), lower(titlu_extern));

alter table platforma_produse_lipsa disable row level security;

select 'Tabela platforma_produse_lipsa a fost creată.' as status;
