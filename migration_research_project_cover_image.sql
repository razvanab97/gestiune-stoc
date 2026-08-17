-- Research: permite setarea manuală a pozei de copertă a unui dosar (când niciun link nu are încă
-- poză extrasă automat) — separată de imaginile linkurilor individuale.
alter table research_projects add column if not exists cover_image text;

alter table research_projects disable row level security;
grant select, insert, update, delete on research_projects to anon, authenticated;
