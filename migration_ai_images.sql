-- Rulează în Supabase Dashboard → SQL Editor.
-- Stochează pozele de produs recreate cu AI (api/image-generate.js) — base64, servite public printr-un
-- URL stabil (api/ai-image.js?id=...), utilizabil direct în exportul XLSX/ghidul eMAG.

create table if not exists ai_images (
  id bigint primary key generated always as identity,
  image_data text not null,
  mime text default 'image/png',
  created_at timestamptz default now()
);

alter table ai_images disable row level security;
grant select, insert, update, delete on ai_images to anon, authenticated;

select 'Tabela ai_images a fost creată cu succes.' as status;
