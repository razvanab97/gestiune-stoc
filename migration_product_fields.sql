-- Rulează în Supabase Dashboard → SQL Editor.
-- Completează schema produselor existente cu toate câmpurile folosite de aplicație.

alter table produse add column if not exists incoming_qty numeric(10,2) default 0;
alter table produse add column if not exists price_emag numeric(10,2) default 0;
alter table produse add column if not exists price_trendyol numeric(10,2) default 0;
alter table produse add column if not exists tva_acq numeric(4,2) default 0.21;
alter table produse add column if not exists colors text;
alter table produse add column if not exists sizes text;
alter table produse add column if not exists material text;
alter table produse add column if not exists dims text;
alter table produse add column if not exists notes text;
alter table produse add column if not exists internal_code text;
alter table produse add column if not exists price_buy_prev_ttc numeric(10,2) default 0;
alter table produse add column if not exists price_buy_changed_at timestamptz;

alter table produse alter column bought type numeric(10,2) using bought::numeric;
alter table produse alter column incoming_qty type numeric(10,2) using incoming_qty::numeric;
alter table produse alter column sold type numeric(10,2) using sold::numeric;
alter table produse alter column min_qty type numeric(10,2) using min_qty::numeric;
alter table produse alter column price_buy_prev_ttc type numeric(10,2) using price_buy_prev_ttc::numeric;
alter table vanzari_zilnice alter column qty type numeric(10,2) using qty::numeric;
alter table jurnal alter column qty type numeric(10,2) using qty::numeric;

create table if not exists comenzi_stoc (
  id bigint primary key generated always as identity,
  source text default 'Import stoc',
  total_items integer default 0,
  total_qty numeric(10,2) default 0,
  total_value numeric(12,2) default 0,
  updated_count integer default 0,
  created_count integer default 0,
  skipped_count integer default 0,
  details jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create index if not exists idx_comenzi_stoc_created on comenzi_stoc(created_at desc);
alter table comenzi_stoc disable row level security;
grant select, insert, update, delete on comenzi_stoc to anon, authenticated;

update produse
set internal_code = 'AB' || to_char(coalesce(created_at, now()) at time zone 'Europe/Bucharest', 'MMDD') || id
where internal_code is null or internal_code = '';

create unique index if not exists idx_produse_internal_code on produse(internal_code) where internal_code is not null and internal_code <> '';

create or replace function set_product_internal_code()
returns trigger as $$
begin
  if new.internal_code is null or new.internal_code = '' then
    new.internal_code := 'AB' || to_char(coalesce(new.created_at, now()) at time zone 'Europe/Bucharest', 'MMDD') || new.id;
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists produse_internal_code on produse;
create trigger produse_internal_code before insert on produse for each row execute function set_product_internal_code();

select 'Câmpurile produselor au fost adăugate cu succes.' as status;
