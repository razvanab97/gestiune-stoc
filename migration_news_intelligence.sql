-- Rulează în Supabase Dashboard → SQL Editor.
-- News Intelligence + AI Social Post Creator — dedicat comerțului/retail/e-commerce/economie
-- relevantă pentru business. GENERAL, fără limitare geografică la Iași — Iași primește doar
-- prioritate mai mare în feed (iasi_relevant + bonus în priority_score), nu filtrare.
--
-- news_articles — știrile ingerate (manual, prin URL) + analiza AI (enrichment).
-- social_posts  — postările generate de Creator, fie pornind de la un articol (article_id),
--                 fie de la un subiect introdus manual (article_id = null).

create table if not exists news_articles (
  id bigint primary key generated always as identity,
  url text,
  title text not null,
  source text,
  raw_text text,
  published_at timestamptz,
  created_at timestamptz not null default now(),

  -- Analiză AI (enrichment) — vezi newsEnrichmentRules în index.html pentru regulile exacte
  summary text,
  category text,               -- unul dintre enum-urile stabile (vezi NEWS_CATEGORIES în index.html)
  content_type text,           -- news | market_insight | economic | regulation | company_move | trend | opportunity
  relevant boolean,
  iasi_relevant boolean not null default false,
  business_relevant boolean,
  business_impact text,        -- none | low | medium | high
  business_impact_reason text,
  priority_score numeric(5,1) default 0,
  overlay_text text,
  post_caption text,
  image_prompt text,           -- scena descrisă de AI, FĂRĂ sufixul obligatoriu de overlay (adăugat în JS)
  enriched_at timestamptz
);

create index if not exists news_articles_priority_idx on news_articles(priority_score desc);
create index if not exists news_articles_created_idx on news_articles(created_at desc);
create unique index if not exists news_articles_url_key on news_articles(url) where url is not null and url<>'';

create table if not exists social_posts (
  id bigint primary key generated always as identity,
  article_id bigint references news_articles(id) on delete set null,

  topic text,                  -- subiect (creator manual) sau titlul articolului (din știre)
  context text,                -- context/informații suplimentare introduse manual (opțional)
  category text,
  content_type text,
  post_angle text,             -- news | educational | business_insight | trend | opportunity | practical_tip
  style text default 'informativ',   -- informativ | news | business | educativ | premium | social
  length text default 'mediu',       -- scurt | mediu | lung
  platform text default 'instagram', -- instagram | facebook | linkedin — extensibil

  overlay_text text,
  post_caption text,
  image_prompt text,           -- scena AI, fără sufixul obligatoriu (compus mereu în JS din scenă+overlay_text)
  overlay_text_edited boolean not null default false,
  post_caption_edited boolean not null default false,
  image_prompt_edited boolean not null default false,

  status text not null default 'draft', -- draft | generated | ready | published | archived
  published_at timestamptz,
  external_post_id text,
  external_post_url text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists social_posts_status_idx on social_posts(status);
create index if not exists social_posts_article_idx on social_posts(article_id);
create index if not exists social_posts_created_idx on social_posts(created_at desc);

alter table news_articles disable row level security;
alter table social_posts disable row level security;

select 'Tabelele news_articles și social_posts au fost create.' as status;
