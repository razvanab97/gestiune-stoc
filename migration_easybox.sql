-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă coloanele pentru dimensiunile de produs folosite de verificarea EasyBox
-- (secțiunea nouă "📦 EasyBox" din fișa produsului).

alter table produse add column if not exists easybox_l numeric(6,1) default 0;
alter table produse add column if not exists easybox_w numeric(6,1) default 0;
alter table produse add column if not exists easybox_t numeric(6,1) default 0;

select 'Coloanele EasyBox au fost adăugate cu succes.' as status;
