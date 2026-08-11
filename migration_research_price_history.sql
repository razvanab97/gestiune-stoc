-- Rulează în Supabase Dashboard → SQL Editor.
-- Creează tabela pentru istoricul de preț al linkurilor din dosarele Research
-- (folosită de butonul "🔄 Reverifică prețurile" din fiecare dosar) — înregistrează
-- când prețul unui link (furnizor sau competitor) s-a schimbat față de ultima verificare.

create table if not exists research_price_history (
  id bigint primary key generated always as identity,
  link_id bigint references research_links(id) on delete cascade,
  project_id bigint references research_projects(id) on delete cascade,
  url text,
  old_price numeric(10,2),
  new_price numeric(10,2),
  currency text default 'RON',
  created_at timestamptz default now()
);

create index if not exists idx_rph_link on research_price_history(link_id);
create index if not exists idx_rph_project on research_price_history(project_id);
create index if not exists idx_rph_created on research_price_history(created_at desc);

alter table research_price_history disable row level security;
grant select, insert, update, delete on research_price_history to anon, authenticated;

select 'Tabela research_price_history a fost creată cu succes.' as status;
