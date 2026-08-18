-- Rulează în Supabase Dashboard → SQL Editor.
-- Adaugă numele clientului pe fiecare linie de comandă importată din eMAG/Trendyol
-- (tab "📦 Comenzi Platforme"), ca să fie mai ușor de asociat/regăsit comenzile.

alter table platforma_comenzi add column if not exists client_nume text;

select 'Coloana client_nume a fost adăugată la platforma_comenzi.' as status;
