-- Rulează în Supabase Dashboard → SQL Editor.
-- Verdict AI (compară poza + titlul + specificațiile) dacă un candidat eMAG/Trendyol e CHIAR
-- același produs ca al nostru, nu doar din aceeași categorie — completează scorul determinist
-- existent (suprapunere de cuvinte din titlu), care ratează sinonime ("cutie litieră" vs
-- "toaletă pisică") și poate scora fals-pozitiv titluri cu cuvinte generice comune.

alter table research_links add column if not exists ai_match_verdict text;
alter table research_links add column if not exists ai_match_reason text;

select 'Coloanele ai_match_verdict/ai_match_reason au fost adăugate cu succes.' as status;
