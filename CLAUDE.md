# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Romanian-language inventory/stock management app ("Stoc Manager - AB HOMES") for a single user. It is **one self-contained static HTML file** (`index.html`, ~5500 lines: inline `<style>` + inline `<script>`, no framework, no build step, no `package.json`, no dependencies). Backend is Supabase (Postgres via REST). Hosting is Vercel as a static site with several serverless functions in `api/` for AI/scraping features.

## Commands

There is no build, lint, or test tooling — this is a hand-edited static file.

- **Run locally**: open `index.html` directly in a browser (or serve the directory with any static file server, e.g. `python3 -m http.server`). AI-powered features require the Vercel serverless endpoint `/api/openai` and the `OPENAI_API_KEY` environment variable, so they do not work when opening the HTML file directly.
- **Deploy**: drag-and-drop `index.html` onto Vercel (per README), or push to the connected git remote. `vercel.json` configures the static build, rewrites all routes to `/index.html`, and sets security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection).
- **Database setup/migrations**: run the SQL files manually in the Supabase Dashboard → SQL Editor (Project: `nuvgwytanlgvcffxeahs`). `supabase_setup.sql` is the current full schema (idempotent — safe to re-run; uses `create table if not exists` / `add column if not exists`) — for a fresh setup this is the only file that needs to run. `migration_activity_log.sql` is a small incremental migration (adds `activitate_stoc`, for the stock-movement notification bell) not yet folded into `supabase_setup.sql`. `insert_produse.sql`, `update_images.sql`, `update_images_verk.sql` are one-off data-import scripts generated from supplier invoices/catalogs — not part of normal dev flow.

## Architecture

### Single-page app, six tabs
The whole UI lives in `index.html` behind `goPage(id, btn)`, which toggles `.page`/`.h-tab` `on` classes:
- `#page-stoc` — Inventar (product list/table, add/edit modal, invoice import, bulk stock actions)
- `#page-calc` — Calculator profit (eMAG / Trendyol / vânzare directă margin calculators)
- `#page-jurnal` — Jurnal vânzări (sales journal, grouped by day, CSV export) — also hosts "Comenzi" (stock-order history from `comenzi_stoc`)
- `#page-raport` — Raport stoc (printable physical-stock report, filterable by category, historic stock export)
- `#page-sync` — Sincronizare (maps eMAG/Trendyol external listings to local products for stock sync)
- `#page-research` — Research (competitor price research, listing builder, AI product import)

Switching to `raport`/`jurnal` triggers a render+retry loop (`tryR`/`tryS`/`tryC`/`tryRs`) that waits for `P` (products) to be loaded before building the table, since data loads asynchronously from Supabase on page load.

### Global state (top of `<script>`)
- `P` — array of products (the in-memory source of truth for inventory)
- `TS` — map of `{productId: qtySoldToday}` for the daily quick-sell view
- `JL` — sales journal, grouped by date: `[{date, entries:[...]}]`
- `OI` — stock-order/receipt history (from `comenzi_stoc`, populated by invoice import)
- `ACT` — recent stock-movement notifications (in/out, from `activitate_stoc`), shown in the 🔔 bell dropdown in the header
- `CATS` — custom product categories, persisted to `localStorage` (140+ predefined Romanian categories plus user-added ones via `addCustomCategory`)
- `editId`, `curImg`, `invLines`/`invParsed` — modal/form/invoice-import transient state

### Data layer: Supabase REST + localStorage fallback
- `sb(method, path, body)` is the single fetch wrapper for Supabase's PostgREST API (`/rest/v1/<table>`), using the anon key (`SUPA_URL`/`SUPA_KEY`, hardcoded — this is intentional per README, RLS is disabled, single-user app). `dbGet`/`dbPost`/`dbPatch`/`dbDelete` are thin wrappers around it.
- `dbToP(row)` / `pToDb(product)` translate between DB snake_case columns (`min_qty`, `price_buy_ttc`, ...) and the app's camelCase product objects (`minQty`, `priceBuyTTC`, ...). Always go through these when touching `produse` rows.
- `load()` fetches `produse`, today's `vanzari_zilnice`, `jurnal`, `comenzi_stoc` and `activitate_stoc` on startup, sets `sbReady=true` on success, and seeds demo data via `seedSample()` if the table is empty. Tables added after the initial schema (`comenzi_stoc`, `activitate_stoc`) are loaded in their own try/catch and fall back to their local cache if the migration hasn't been run yet — same pattern for both.
- If Supabase is unreachable, `loadLocalFallback()` reads cached data from `localStorage` (keys `K`/`TK`/`JK`/`OK`/`AK` = `sm6_prod`/`sm6_today`/`sm6_jurnal`/`sm6_stock_orders`/`sm6_activity`) and the UI runs in a degraded "offline" mode (`setSyncStatus('err','Mod offline')`). All writes (`saveProdToDb`, `saveTodaySale`, `saveJurnalEntry`, `logMove`, ...) check `sbReady` and fall back to local-only persistence when Supabase isn't available.

### Supabase schema (`supabase_setup.sql`)
Ten tables, no RLS (single-user, anon key is safe to expose client-side per README):
- `produse` — products (name, sku, category, supplier, bought/sold quantities, prices, characteristics like colors/sizes/material)
- `vanzari_zilnice` — cache of today's sales per product (unique on `data, product_id`, used for the quick-sell UI)
- `jurnal` — permanent sales journal/history (one row per product per day sold)
- `comenzi_stoc` — stock-receipt/order history (invoice imports, bulk stock additions)
- `platforma_mapari` — maps eMAG/Trendyol external listings to local products, for stock sync
- `listing_price_observations` — price observations collected from Research/competitor analysis
- `setari_app` — small global key/value settings store
- `research_projects` / `research_links` — competitor research projects and their scraped candidate links
- `activitate_stoc` — stock-movement log (in/out, with timestamp) behind the notification bell; added by `migration_activity_log.sql` — run it once in Supabase SQL Editor, otherwise the app falls back to a local-only (per-browser) log

### AI integrations (OpenAI Responses API, all via `callAI()`)
All AI requests go through the Vercel serverless endpoint `/api/openai`; the API key is never exposed in the browser:
- `doSuggestCat` — suggests 1-3 product categories from the product name as the user types
- `analyzeImage` — detects product name/category from an uploaded photo
- `importFromUrl` — imports a product (title translated, image, SKU) from a product page URL
- `parsePDFWithAI` — extracts product line items from an invoice PDF for bulk import (`openInvoice`/`applyInvoice` flow, with `fuzzyMatch`/`findExistingProduct` to detect existing products vs new ones)

### Other notable pieces
- Profit calculator (`computeEmag`/`computeTrendyol`/`computeDirect`, rendered by `emagRender`/`trendyolRender`/`directRender`) computes margins for eMAG vs. Trendyol vs. direct sale. The Trendyol calculator can auto-compute the real transport cost (`trendyolTransportInfo`) from FAN/DPD rate tables by weight/carrier/route (RO-RO/RO-GR/RO-BG), including Trendyol's subsidized "prag minim"/cross-border shipping rules, or fall back to a manual RON amount.
- `printRaport()` uses a dedicated `@media print` stylesheet block to produce a clean printable physical-stock checklist
- `exportCSV()` / `exportStockOrdersCSV()` / `exportHistoricStockCSV()` export CSVs (sales journal, stock orders, historic stock) — free-text fields go through `csvEsc()` to avoid malformed rows
- `logMove(tip, name, qty, sursa)` records a stock movement (`in`/`out`) into `ACT`/`activitate_stoc`, rendered by `renderNotif()` in the 🔔 header dropdown; called from the sell flows (`qSell`, `sellSearch`, `updateTQ`) and the stock-in flows (`saveProd`, `bulkAddStock`, `applyInvoice`)
- The "Update #N" widget bottom-left (`renderUpdWidget()`, data in the `UPDATES` array near the top of `<script>`) is a changelog the user can see in the running app — prepend a new entry there for any future code change, however small

## Conventions

- UI strings, comments, and commit messages are in Romanian. Commit message style uses prefixes: `Fix:`, `Feature:`, `UI:`, `Add:` (see `git log`).
- Code style is dense/minified-by-hand (short var names, no semicolons consistency, chained ternaries) — match the existing style when editing rather than reformatting.
- CSS uses custom properties defined in `:root` (`--bg`, `--acc`, `--t1`, `--r`, `--sh`, ...) — reuse these tokens instead of hardcoding colors/spacing.
