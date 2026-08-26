-- Rulează în Supabase Dashboard → SQL Editor.
-- Creează bucket-ul de Storage "product-images" pentru pozele produselor. Până acum poza
-- principală (produse.img) era salvată ca text base64 direct în Postgres — la 217 produse
-- asta însemna ~30MB doar pentru poze la un simplu "select *", suficient să declanșeze
-- eroarea 57014 (statement timeout) descrisă în migration_fix_anon_statement_timeout.sql.
-- De acum, pozele noi se încarcă aici ca fișiere reale, iar în coloana img rămâne doar URL-ul.
-- Bucket public (citire) + politică de upload permisivă pentru anon — consistent cu restul
-- aplicației (RLS dezactivat pe produse, cheie anon expusă intenționat, aplicație single-user).

insert into storage.buckets (id, name, public)
values ('product-images','product-images', true)
on conflict (id) do nothing;

create policy if not exists "Public read product images"
  on storage.objects for select
  using (bucket_id = 'product-images');

create policy if not exists "Anon upload product images"
  on storage.objects for insert
  with check (bucket_id = 'product-images');

select 'Bucket product-images creat, cu citire publica si upload permis pentru anon.' as status;
