// Browser headless (Chromium) — SINGURUL loc din api/ cu dependințe npm (@sparticuz/chromium +
// puppeteer-core, vezi package.json la rădăcină). Izolat intenționat într-un fișier separat de
// research-projects.js, ca dependința grea (binar ~50-70MB) să nu încetinească cold-start-ul
// celorlalte acțiuni din research-projects.js (care rulează mult mai des și nu au nevoie de browser).
//
// De ce există: fetch() simplu (research-projects.js, analyzeUrl) eșuează sigur pe Jumbo (403,
// blocare bot la nivel de server) și pe multe pagini Maxy.eu (SPA, HTML gol fără randare JS). Un
// browser headless randează pagina ca un utilizator real, ceea ce rezolvă cazul Maxy — verificat
// direct, local, pe maxy.eu (200 OK, conținut real după randare, vs. HTML gol la fetch simplu).
// Pentru Jumbo, un browser headless simplu NU e suficient — am testat direct (inclusiv cu
// puppeteer-extra-plugin-stealth) și tot dă 403; blocarea pare la nivel de IP/rețea, nu doar
// fingerprint de browser. S-ar putea totuși să funcționeze din rețeaua Vercel (IP diferit de cel
// din care am testat) — de-asta încercarea rămâne în cod, cu eșec clar dacă tot nu merge, NU un cost
// suplimentar dacă nu ajută.
//
// A doua utilizare: auto-căutare pe eMAG/Trendyol (azi complet manuală — se deschide doar un tab nou
// de căutare, fără nicio extragere automată de rezultate). Verificat direct, local, pe ambele:
// eMAG — carduri de produs identificabile prin selectoare CSS ([data-product-id]/.card-item/.card-v2);
// Trendyol — mult mai robust: rezultatele sunt disponibile ca JSON structurat, într-o variabilă
// globală (window['__single-search-result__PROPS'].data.products), nu doar prin markup fragil.

let chromiumMod = null, puppeteer = null;
async function loadDeps() {
  if (puppeteer) return;
  // Pe Vercel (VERCEL=1, setat automat de platformă): @sparticuz/chromium, binarul potrivit mediului
  // serverless. Local (dezvoltare/testare): puppeteer-core + un Chrome/Chromium deja instalat pe
  // mașină — @sparticuz/chromium NU rulează corect în afara mediului AWS Lambda/Vercel.
  puppeteer = require('puppeteer-core');
  if (process.env.VERCEL) chromiumMod = require('@sparticuz/chromium');
}

async function launchBrowser() {
  await loadDeps();
  if (process.env.VERCEL) {
    return puppeteer.launch({
      args: chromiumMod.args,
      defaultViewport: chromiumMod.defaultViewport,
      executablePath: await chromiumMod.executablePath(),
      headless: chromiumMod.headless,
    });
  }
  // Local: caută un Chrome/Chromium instalat (Mac — calea standard; altfel, setează
  // PUPPETEER_EXECUTABLE_PATH manual înainte de a rula local).
  const localPath = process.env.PUPPETEER_EXECUTABLE_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  return puppeteer.launch({ headless: true, executablePath: localPath, args: ['--no-sandbox'] });
}

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

async function withPage(fn) {
  const browser = await launchBrowser();
  try {
    const page = await browser.newPage();
    await page.setUserAgent(UA);
    await page.setExtraHTTPHeaders({ 'accept-language': 'ro-RO,ro;q=0.9,en;q=0.8' });
    await page.setViewport({ width: 1366, height: 900 });
    return await fn(page);
  } finally {
    await browser.close().catch(() => {});
  }
}

// Vercel limitează răspunsul unei funcții la 4.5MB — HTML-ul randat de un browser real poate depăși
// asta ușor (verificat direct: pagina principală maxy.eu randată = 4.7MB, DOAR din markup, fără poze
// embed). Scoatem <script> (păstrăm JSON-LD, singurul tip de <script> de care extract() are nevoie
// în research-projects.js) și <style> — nu afectează title/preț/descriere/imagini, doar reduce
// payload-ul. Bug real găsit la testare directă: fără asta, HTML-ul ajungea trunchiat înainte să
// ajungă la extract() (limita MAX_HTML din research-projects.js), iar titlul ieșea gol exact pe
// cazul pentru care a fost construit tot fluxul ăsta (Maxy).
function trimHtml(html) {
  const kept = html.replace(/<script(?![^>]*application\/ld\+json)[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  return kept.slice(0, 4 * 1024 * 1024);
}
// O randare + un singur retry cu delay scurt (nu reîncercări nesfârșite) — dacă și a doua încercare
// eșuează, întoarce eroarea clar, ca apelantul să cadă pe fluxul manual/PDF în loc să aștepte inutil.
async function fetchPageHtml(url) {
  const attempt = async () => withPage(async (page) => {
    const resp = await page.goto(url, { waitUntil: 'networkidle2', timeout: 25000 });
    const status = resp ? resp.status() : 0;
    if (status && status >= 400) throw new Error(`HTTP ${status}`);
    await new Promise((r) => setTimeout(r, 1200));
    return trimHtml(await page.content());
  });
  try { return await attempt(); }
  catch (e1) {
    await new Promise((r) => setTimeout(r, 1500));
    try { return await attempt(); }
    catch (e2) { throw e2; }
  }
}

// eMAG — carduri de produs prin selectoare CSS (verificat direct pe o căutare reală: 156 carduri
// găsite, titlu/preț/poză/link corecte pentru toate). Structura poate diferi ușor pe termen lung
// (redesign eMAG) — de-asta lista de selectoare e mai largă, nu una singură fragilă.
async function searchEmag(query) {
  return withPage(async (page) => {
    await page.goto(`https://www.emag.ro/search/${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1200));
    return page.evaluate(() => {
      const cards = document.querySelectorAll('[data-product-id], .card-item, .js-product-data, .card-v2');
      const seen = new Set(), out = [];
      cards.forEach((card) => {
        const titleEl = card.querySelector('a.card-v2-title, .card-title, h2 a, [class*="title"] a');
        const priceEl = card.querySelector('.product-new-price, [class*="price"]');
        const imgEl = card.querySelector('img');
        const linkEl = card.querySelector('a[href]');
        const link = linkEl?.href || '';
        const title = (titleEl || linkEl)?.textContent?.trim();
        if (!link || !title || seen.has(link)) return;
        seen.add(link);
        out.push({ title: title.slice(0, 200), price: priceEl?.textContent?.trim() || '', image: imgEl?.src || imgEl?.getAttribute('data-src') || '', link });
      });
      return out.slice(0, 20);
    });
  });
}

// Trendyol — datele reale ale căutării sunt expuse ca JSON structurat într-o variabilă globală,
// nu doar prin markup — mult mai robust decât selectoare CSS (verificat direct: nume/preț/poze/link
// complete, corecte, pentru toate produsele unei căutări reale).
async function searchTrendyol(query) {
  return withPage(async (page) => {
    await page.goto(`https://www.trendyol.com/ro/sr?q=${encodeURIComponent(query)}`, { waitUntil: 'networkidle2', timeout: 25000 });
    await new Promise((r) => setTimeout(r, 1200));
    return page.evaluate(() => {
      const raw = window['__single-search-result__PROPS'];
      const products = raw?.data?.products;
      if (!Array.isArray(products)) return [];
      return products.slice(0, 20).map((p) => ({
        title: String(p.name || '').slice(0, 200),
        price: p.price?.currentText ? `${p.price.currentText} ${p.price.currencySymbol || 'Lei'}` : '',
        image: p.image || (Array.isArray(p.images) ? p.images[0] : '') || '',
        link: p.url ? new URL(p.url, 'https://www.trendyol.com').href : '',
      })).filter((x) => x.link && x.title);
    });
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Metodă nepermisă' });
  const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  try {
    if (body.action === 'fetch_page') {
      const url = String(body.url || '').trim();
      if (!url || !/^https?:\/\//i.test(url)) return res.status(400).json({ error: 'URL invalid' });
      const html = await fetchPageHtml(url);
      return res.status(200).json({ html });
    }
    if (body.action === 'search') {
      const platform = body.platform === 'trendyol' ? 'trendyol' : 'emag';
      const query = String(body.query || '').trim().slice(0, 200);
      if (!query) return res.status(400).json({ error: 'Lipsește termenul de căutare' });
      const candidates = platform === 'trendyol' ? await searchTrendyol(query) : await searchEmag(query);
      return res.status(200).json({ candidates });
    }
    return res.status(400).json({ error: 'Acțiune necunoscută' });
  } catch (e) {
    return res.status(502).json({ error: e.message || 'Eroare browser headless' });
  }
};
module.exports.config = { maxDuration: 60 };
