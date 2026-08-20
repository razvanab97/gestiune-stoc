-- Rulează în Supabase Dashboard → SQL Editor.
-- Galerie AI de produs (Generator anunțuri → Research): planul de cadre + imaginile generate pentru
-- fiecare dosar, plus Product Visual DNA (analiza vizuală a pozelor originale — culoare, formă, imprimeu,
-- accesorii — folosită la FIECARE generare ca AI-ul să nu inventeze caracteristici ale produsului).
-- Scopul e dosarul (research_projects.id), nu produsul din Inventar — „Aplică în produs" copiază
-- galeria aprobată în produse.images, exact ca restul câmpurilor anunțului.

alter table research_projects add column if not exists visual_dna jsonb default '{}'::jsonb;

create table if not exists product_generated_images (
  id bigint primary key generated always as identity,
  project_id bigint references research_projects(id) on delete cascade,
  position integer default 0,
  type text,
  title text,
  prompt text,
  source_images jsonb default '[]'::jsonb,
  generated_image_url text,
  identity_score integer,
  validation_result jsonb default '{}'::jsonb,
  status text default 'planned',
  approved boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pgi_project on product_generated_images(project_id);

alter table product_generated_images disable row level security;
grant select, insert, update, delete on product_generated_images to anon, authenticated;

select 'Tabela product_generated_images (Galerie AI produs) a fost creată cu succes.' as status;
