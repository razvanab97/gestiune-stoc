# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A Romanian-language inventory/stock management app ("Stoc Manager - AB HOMES") for a single user. It is **one self-contained static HTML file** (`index.html`, ~2000 lines: inline `<style>` + inline `<script>`, no framework, no build step, no `package.json`, no dependencies). Backend is Supabase (Postgres via REST). Hosting is Vercel as a static site.

## Commands

There is no build, lint, or test tooling — this is a hand-edited static file.

- **Run locally**: open `index.html` directly in a browser (or serve the directory with any static file server, e.g. `python3 -m http.server`). AI-powered features require the Vercel serverless endpoint `/api/openai` and the `OPENAI_API_KEY` environment variable, so they do not work when opening the HTML file directly.
- **Deploy**: drag-and-drop `index.html` onto Vercel (per README), or push to the connected git remote. `vercel.json` configures the static build, rewrites all routes to `/index.html`, and sets security headers (X-Content-Type-Options, X-Frame-Options, X-XSS-Protection).
- **Database setup/migrations**: run the SQL files manually in the Supabase Dashboard → SQL Editor (Project: `nuvgwytanlgvcffxeahs`). `supabase_setup.sql` is the schema (idempotent — safe to re-run; uses `create table if not exists` / `add column if not exists`). `insert_produse.sql`, `update_images.sql`, `update_images_verk.sql` are one-off data-import scripts generated from supplier invoices/catalogs — not part of normal dev flow.

## Architecture

### Single-page app, three tabs
The whole UI lives in `index.html` behind `goPage(id, btn)` (around line 951), which toggles `.page`/`.h-tab` `on` classes:
- `#page-stoc` — Inventar (product list/table, add/edit modal, profit calculator, invoice import)
- `#page-jurnal` — Jurnal vânzări (sales journal, grouped by day, CSV export)
- `#page-raport` — Raport stoc (printable physical-stock report, filterable by category)

Switching to `raport`/`jurnal` triggers a render+retry loop (`tryR`) that waits for `P` (products) to be loaded before building the table, since data loads asynchronously from Supabase on page load.

### Global state (top of `<script>`, ~line 724)
- `P` — array of products (the in-memory source of truth for inventory)
- `TS` — map of `{productId: qtySoldToday}` for the daily quick-sell view
- `JL` — sales journal, grouped by date: `[{date, entries:[...]}]`
- `CATS` — custom product categories, persisted to `localStorage` (140+ predefined Romanian categories plus user-added ones via `addCustomCategory`)
- `editId`, `curImg`, `invLines`/`invParsed` — modal/form/invoice-import transient state

### Data layer: Supabase REST + localStorage fallback
- `sb(method, path, body)` (~line 695) is the single fetch wrapper for Supabase's PostgREST API (`/rest/v1/<table>`), using the anon key (`SUPA_URL`/`SUPA_KEY`, hardcoded — this is intentional per README, RLS is disabled, single-user app). `dbGet`/`dbPost`/`dbPatch`/`dbDelete` are thin wrappers around it.
- `dbToP(row)` / `pToDb(product)` translate between DB snake_case columns (`min_qty`, `price_buy_ttc`, ...) and the app's camelCase product objects (`minQty`, `priceBuyTTC`, ...). Always go through these when touching `produse` rows.
- `load()` (~line 772) fetches `produse`, today's `vanzari_zilnice`, and `jurnal` on startup, sets `sbReady=true` on success, and seeds demo data via `seedSample()` if the table is empty.
- If Supabase is unreachable, `loadLocalFallback()` reads cached data from `localStorage` (keys `K`/`TK`/`JK` = `sm6_prod`/`sm6_today`/`sm6_jurnal`) and the UI runs in a degraded "offline" mode (`setSyncStatus('err','Mod offline')`). All writes (`saveProdToDb`, `saveTodaySale`, `saveJurnalEntry`, ...) check `sbReady` and fall back to local-only persistence (`saveLocalOnly`) when Supabase isn't available.

### Supabase schema (`supabase_setup.sql`)
Three tables, no RLS (single-user, anon key is safe to expose client-side per README):
- `produse` — products (name, sku, category, supplier, bought/sold quantities, prices, characteristics like colors/sizes/material)
- `vanzari_zilnice` — cache of today's sales per product (unique on `data, product_id`, used for the quick-sell UI)
- `jurnal` — permanent sales journal/history (one row per product per day sold)

### AI integrations (OpenAI Responses API, via `callAI()`)
All AI requests go through the Vercel serverless endpoint `/api/openai`; the API key is never exposed in the browser:
- `doSuggestCat` — suggests 1-3 product categories from the product name as the user types
- `analyzeImage` — detects product name/category from an uploaded photo
- `importFromUrl` — imports a product (title translated, image, SKU) from a product page URL
- `parsePDFWithAI` — extracts product line items from an invoice PDF for bulk import (`openInvoice`/`applyInvoice` flow, with `fuzzyMatch`/`findExistingProduct` to detect existing products vs new ones)

### Other notable pieces
- Profit calculator (`pcCalc`/`pcCalcEmag`/`pcCalcTrendyol`, ~line 1182) computes margins for direct sale vs. eMAG vs. Trendyol marketplace fees
- `printRaport()` uses a dedicated `@media print` stylesheet block to produce a clean printable physical-stock checklist
- `exportCSV()` exports the sales journal for a given month

## Conventions

- UI strings, comments, and commit messages are in Romanian. Commit message style uses prefixes: `Fix:`, `Feature:`, `UI:`, `Add:` (see `git log`).
- Code style is dense/minified-by-hand (short var names, no semicolons consistency, chained ternaries) — match the existing style when editing rather than reformatting.
- CSS uses custom properties defined in `:root` (`--bg`, `--acc`, `--t1`, `--r`, `--sh`, ...) — reuse these tokens instead of hardcoding colors/spacing.
</content>
