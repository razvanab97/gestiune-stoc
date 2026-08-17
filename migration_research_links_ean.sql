-- Research: EAN/GTIN era deja extras din pagină (JSON-LD) dar aruncat, niciodată salvat — necesar
-- pentru scoring-ul de completitudine/calitate (componenta "identificarea produsului").
alter table research_links add column if not exists ean text;

alter table research_links disable row level security;
grant select, insert, update, delete on research_links to anon, authenticated;
