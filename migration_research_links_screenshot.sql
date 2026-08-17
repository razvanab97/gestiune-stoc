-- Research: suportă linkuri Jumbo/Maxy analizate prin screenshot (AI vision), nu prin fetch automat
-- (Jumbo blochează server-side cu 403, Maxy e SPA fără HTML randat — vezi research-produse-emag-trendyol.md).
alter table research_links add column if not exists source text default 'web';
comment on column research_links.source is 'web = extras automat din URL; screenshot = completat manual prin poză + AI vision; pdf = extras dintr-un PDF cu mai multe anunțuri';

-- Scor de potrivire (0-100) pentru candidații găsiți automat sau dintr-un PDF cu mai multe anunțuri —
-- vezi research-produse-emag-trendyol.md, Q73: 35/20/10/35 (nume/caracteristici/EAN/poză) cu poză,
-- 55/30/15 (nume/caracteristici/EAN) fără poză (candidați din PDF, care nu au poză proprie).
alter table research_links add column if not exists score integer;
alter table research_links add column if not exists score_zone text;
comment on column research_links.score_zone is 'ok (80-100, folosit automat), mid (50-79, necesită reconfirmare manuală), low (0-49, ascuns implicit)';

alter table research_links disable row level security;
grant select, insert, update, delete on research_links to anon, authenticated;
