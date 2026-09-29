-- Rulează în Supabase Dashboard → SQL Editor.
-- Termen maxim de expediere (cerut direct — „data maximă de finalizare, cu timer standard, nu tip
-- ceas"): eMAG expune `maximum_date_for_shipment` (verificat direct pe date live, nu ghicit din
-- documentație — vechea versiune PDF nu-l lista deloc), Trendyol expune `agreedDeliveryDate` (câmp
-- oficial documentat, Unix ms). Ambele convertite la UTC real înainte de salvare (vezi
-- emagDeadline din scripts/emag-local-connector.js / termenExpediere din api/trendyol.js), deci
-- coloana ține mereu un timestamp absolut, fără ambiguitate de fus orar.

alter table platforma_comenzi add column if not exists termen_expediere timestamptz;

select 'Coloana termen_expediere a fost adăugată cu succes.' as status;
