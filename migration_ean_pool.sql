-- Rulează în Supabase Dashboard → SQL Editor.
-- Bancă de coduri EAN nefolosite — pentru produse noi fără cod de bare real, care au nevoie de un
-- EAN valid la încărcarea pe eMAG. Fiecare cod se alocă o singură dată unui anunț (la apăsarea
-- "Copiază EAN" sau la descărcarea presetului eMAG "produs nou") și se ȘTERGE din tabelă imediat
-- ce a fost alocat — lista arată mereu doar codurile încă disponibile.

create table if not exists ean_pool (
  id bigint primary key generated always as identity,
  ean text not null unique,
  created_at timestamptz default now()
);

alter table ean_pool disable row level security;
grant select, insert, update, delete on ean_pool to anon, authenticated;

select 'Tabela ean_pool a fost creată cu succes.' as status;
