-- Rulează în Supabase Dashboard → SQL Editor.
-- Persistă rezultatul "✦ Recunoaștere AI" (interogările de căutare eMAG/Trendyol generate de AI pe
-- baza pozei/titlului/specificațiilor) — până acum se ținea DOAR în memoria browserului (JS), deci
-- dispărea la deschiderea altui dosar (re-render) sau la un simplu refresh de pagină. Bug real
-- raportat direct: "am dat recunoaște AI și cand am inchis dosarul deschizand altul, a disparut".

alter table research_links add column if not exists ai_search_queries jsonb;

select 'Coloana ai_search_queries a fost adăugată cu succes în research_links.' as status;
