-- Rulează în Supabase Dashboard → SQL Editor (idempotent — sigur de rulat de mai multe ori).
-- TIME TRACKING per proiect: tracker-ul de pe Mac scrie sesiuni aici, fiecare aplicație își citește
-- „Timp azi" de aici, iar statisticile (azi / 7 zile / luna / total / comparație) se calculează din ele.
-- Sistemul e partajat: toate aplicațiile/proiectele scriu în aceleași tabele, separat pe project_id
-- (ex. 'gestiune-stoc', 'ab-textile', 'contaflow', ...).

-- Proiectele (doar nume afișat + culoare; project_id din time_sessions NU depinde de acest tabel,
-- ca un proiect nou să poată începe să înregistreze timp imediat, înainte să fie înregistrat aici).
create table if not exists time_projects (
  id text primary key,                 -- slug, ex. 'gestiune-stoc'
  name text not null,
  color text,
  sort integer not null default 0,
  created_at timestamptz not null default now()
);

-- O sesiune = o perioadă continuă de lucru pe UN proiect.
create table if not exists time_sessions (
  id uuid primary key default gen_random_uuid(),
  project_id text not null,
  device text not null default 'mac',
  started_at timestamptz not null,
  last_seen_at timestamptz not null,   -- heartbeat: ultima confirmare a trackerului că sesiunea e activă
  ended_at timestamptz,                -- NULL cât timp sesiunea e deschisă
  duration_seconds integer not null default 0,   -- timp ACTIV acumulat (fără pauze/inactivitate)
  date date not null,                  -- ziua (Europe/Bucharest) în care a început sesiunea
  source text,                         -- ex. 'claude-code', 'codex'
  created_at timestamptz not null default now()
);

create index if not exists time_sessions_project_date_idx on time_sessions (project_id, date);
create index if not exists time_sessions_date_idx on time_sessions (date);

-- Garanție la nivel de bază de date: cel mult O sesiune deschisă per dispozitiv — două proiecte nu pot
-- acumula timp simultan pe același calculator, indiferent de bug-uri în tracker.
create unique index if not exists time_sessions_one_open_per_device
  on time_sessions (device) where ended_at is null;

-- Totaluri pe zi/proiect — sursa statisticilor (mic: zile × proiecte, nu toate sesiunile).
create or replace view time_daily as
  select project_id, date, sum(duration_seconds)::integer as seconds, count(*)::integer as sessions
  from time_sessions
  group by project_id, date;

-- La fel, dar cu sursa: 'web' = timp lucrat ÎN aplicație (tab activ, măsurat de time-tracking.js);
-- 'claude-code' / 'codex' = timp de DEZVOLTARE cu AI (măsurat de trackerul de pe Mac). Statisticile le arată separat.
create or replace view time_daily_src as
  select project_id, date, coalesce(source, '') as source, sum(duration_seconds)::integer as seconds, count(*)::integer as sessions
  from time_sessions
  group by project_id, date, coalesce(source, '');

-- Aplicație single-user cu cheie anonimă (ca restul bazei): fără RLS, permisiuni explicite.
alter table time_projects disable row level security;
alter table time_sessions disable row level security;
grant select, insert, update, delete on time_projects, time_sessions to anon, authenticated;
grant select on time_daily to anon, authenticated;
grant select on time_daily_src to anon, authenticated;

insert into time_projects (id, name, color, sort) values
  ('gestiune-stoc', 'Stoc Manager', '#7657F6', 1),
  ('ab-textile', 'AB Textile', '#F79009', 2),
  ('contaflow', 'ContaFlow', '#12B76A', 3),
  ('apartpro', 'ApartPro', '#0BA5EC', 4),
  ('agentie-imobiliara-ai', 'Agenție imobiliară AI', '#EE46BC', 5)
on conflict (id) do nothing;

select 'Time tracking pregătit: time_projects, time_sessions, time_daily, time_daily_src.' as status;
