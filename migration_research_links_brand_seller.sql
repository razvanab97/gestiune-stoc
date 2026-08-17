-- Research: reține brand-ul produsului și vânzătorul (marketplace seller) extrase din JSON-LD
-- (offers.seller.name pe eMAG e chiar vânzătorul marketplace, poate diferi de brand) — ca să vezi
-- rapid cine și ce vinde pe fiecare listare dintr-un dosar.
alter table research_links add column if not exists brand text;
alter table research_links add column if not exists seller text;

alter table research_links disable row level security;
grant select, insert, update, delete on research_links to anon, authenticated;
