const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';
const MAX_HTML=2*1024*1024;
const VAT=.21,COMMISSION=.20,FIXED_COSTS=23,MIN_PROFIT=10,MIN_MARGIN=20,MAX_LINKS=20;
// Curs aproximativ de conversie în RON — la fel ca EUR_RON hardcodat în index.html pentru prețurile din Inventar.
// Fără asta, un link de furnizor în PLN/EUR era tratat ca RON direct, denaturând profitul/marja calculate.
const FX_TO_RON={RON:1,LEI:1,EUR:5.07,PLN:1.15,USD:4.65,GBP:5.9};
function toRon(price,currency){
  const p=Number(price)||0;if(!p)return 0;
  const rate=FX_TO_RON[String(currency||'RON').toUpperCase()]||1;
  return Math.round(p*rate*100)/100;
}

async function supa(method,path,body){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{method,headers:{'content-type':'application/json','apikey':SUPA_KEY,'authorization':'Bearer '+SUPA_KEY,'prefer':'return=representation,resolution=merge-duplicates'},body:body?JSON.stringify(body):undefined});
  const text=await r.text();let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data={message:text};}
  if(!r.ok){const err=new Error(data?.message||data?.error||`Supabase ${r.status}`);err.status=r.status;err.details=data;throw err;}
  return data;
}
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
// BUG REAL găsit — orice link care nu era pe lista fixă de 4 furnizori cunoscuți (jumbo/maxy/verk/
// i-want) ieșea clasificat 'altul', ceea ce (a) ascundea butonul de căutare eMAG/Trendyol și
// verificarea AI (ambele cer strict platform==='furnizor'), ȘI mult mai grav (b) — recalcProject
// exclude explicit din statisticile de preț de piață DOAR 'furnizor', nu și 'altul', deci prețul
// nostru de achiziție (de la un furnizor "necunoscut") intra GREȘIT în calculul prețului minim de
// concurență, umflând fals verdictul/marja. Fluxul aplicației presupune mereu UN singur link de cost
// (furnizorul) + linkuri de piață STRICT de pe eMAG/Trendyol (singurele generate/citite ca
// "concurență" — vezi add_pdf_listings, generateAiSearchLinks) — nu există un caz legitim de "altă
// platformă" în workflow-ul curent, deci orice non-eMAG/non-Trendyol e tratat direct ca furnizor.
function platformOf(url){
  const h=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
  if(h.includes('emag.'))return'emag';
  if(h.includes('trendyol.'))return'trendyol';
  return'furnizor';
}
function pnkOf(url){const m=String(url||'').match(/\/pd\/([A-Z0-9]+)\/?/i);return m?m[1].toUpperCase():'';}
// Jumbo (403 la nivel de server) și unele pagini Maxy (SPA, HTML gol) nu pot fi citite prin fetch
// automat — dar NU toate: old.maxy.eu, de exemplu, se randează server-side și are date reale. În loc
// de o listă fixă de domenii (fragilă, ratează cazuri ca old.maxy.eu), decizia se ia acum pe baza
// rezultatului REAL al fetch-ului (are titlu găsit sau nu) — vezi add_links mai jos.
function normalizeUrl(raw){
  const u=new URL(String(raw||'').trim().startsWith('http')?String(raw).trim():'https://'+String(raw||'').trim());
  u.hash='';
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref','recid','aid','oid','scenario_ID'].forEach(k=>u.searchParams.delete(k));
  return u.toString().replace(/[?#]$/,'').replace(/\/$/,'');
}
function priceFrom(s){
  if(!s)return 0;
  const v=String(s).replace(/\s/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
  return Math.round((parseFloat(v)||0)*100)/100;
}
function uniq(arr){return[...new Set(arr.filter(Boolean))];}
// Logo-uri/iconițe/elemente UI prinse de regexurile largi de <img> — nu sunt poze de produs.
// Același tipar ca isJunkImage din api/listing-builder.js, aplicat și aici (lipsea complet).
function isJunkImageUrl(u=''){
  return !u||/(sprite|logo|icon|placeholder|blank|favicon|avatar|loading|pixel|1x1|badge|seal|rating|star|\/flag|arrow|\/btn|button|bg-|background|\.svg(\?|$))/i.test(u);
}
// Aceeași poză apare des la mai multe rezoluții (?width=80 vs ?width=720 pe eMAG) — le tratăm ca UNA
// singură (păstrăm varianta cu rezoluție mai mare), altfel „numărul de poze” e umflat artificial.
function imageDedupKey(u){try{const x=new URL(u);x.search='';return x.toString();}catch(e){return u;}}
function imageWidthHint(u){const m=String(u||'').match(/[?&]width=(\d+)/i);return m?parseInt(m[1]):0;}
// Caută primul bloc JSON-LD de tip schema.org Product din pagină — Verk și i-want.pl (WooCommerce) îl au
// standard, cu date mult mai de încredere decât regex pe HTML brut (nume/preț/descriere completă/EAN real).
function extractJsonLdProduct(html){
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let parsed;
    try{parsed=JSON.parse(m[1]);}
    catch(e){
      // Bug real confirmat pe o pagină verk.store reală: template-ul lor lasă uneori o valoare goală
      // înainte de virgulă/acoladă (ex. `"returnDays": ,`) — JSON invalid strict, dar reparabil simplu.
      try{parsed=JSON.parse(m[1].replace(/:(\s*)(,|\})/g,':null$2'));}
      catch(e2){continue;}
    }
    const candidates=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.['@graph'])?parsed['@graph']:[parsed]);
    for(const node of candidates){
      const type=node?.['@type'];
      const isProduct=type==='Product'||(Array.isArray(type)&&type.includes('Product'));
      if(!isProduct)continue;
      let offers=node.offers;
      if(Array.isArray(offers))offers=offers.flat().find(o=>o&&typeof o==='object')||null;
      const rating=node.aggregateRating||{};
      const images=[].concat(node.image||[]).filter(x=>typeof x==='string');
      // brand = producătorul produsului; seller = cine vinde efectiv (offers.seller pe marketplace-uri ca
      // eMAG poate fi diferit de brand — un magazin marketplace poate vinde produse de orice brand).
      const brandName=typeof node.brand==='string'?node.brand:node.brand?.name;
      const sellerName=offers?.seller?.name||(typeof offers?.seller==='string'?offers.seller:'')||node.manufacturer?.name;
      // additionalProperty (schema.org PropertyValue[]) — eMAG îl expune cu specificații reale
      // (Material, Culoare, Dimensiuni, Capacitate etc.), confirmat pe pagină reală de produs.
      // Era complet ignorat până acum — specs rămânea mereu gol, deși datele existau în răspuns.
      const specs={};
      if(Array.isArray(node.additionalProperty)){
        for(const prop of node.additionalProperty){
          const k=clean(prop?.name||''),v=clean(prop?.value??'');
          if(k&&v)specs[k.slice(0,60)]=v.slice(0,200);
        }
      }
      return{
        title:clean(node.name||'').slice(0,240),
        description:clean(node.description||'').slice(0,2000),
        price:offers?.price!=null?priceFrom(offers.price):0,
        currency:offers?.priceCurrency||'',
        rating:parseFloat(rating.ratingValue)||0,
        review_count:parseInt(rating.reviewCount||rating.ratingCount)||0,
        ean:node.gtin13||node.gtin||node.gtin12||node.gtin8||node.mpn||(typeof node.productID==='string'?node.productID.replace(/^mpn:/,''):'')||'',
        brand:clean(brandName||'').slice(0,120),
        seller:clean(sellerName||'').slice(0,120),
        // sku = codul PROPRIU al furnizorului pentru acest produs (referință internă lui, nu EAN/cod de
        // bare) — util la crearea produsului în Inventar, ca reper rapid de recomandă/identificare la
        // furnizor. Complet distinct de `ean` de mai sus, deliberat, chiar dacă unele site-uri le confundă.
        sku:clean(node.sku||'').slice(0,60),
        specs,
        images
      };
    }
  }
  return null;
}
// Codul propriu al furnizorului pentru produs — de obicei etichetat vizibil pe pagină ("Cod produs:",
// "Cod Jumbo:", "SKU:", "Model:" etc.), NU un EAN/cod de bare. Căutat pe text curățat de tag-uri (nu pe
// HTML brut), altfel prinde des potriviri false din scripturi/atribute inline.
function findLabeledProductCode(text){
  const jumbo=text.match(/\bCod\s+Jumbo\s*:?\s*(\d{4,})/i);
  if(jumbo)return jumbo[1];
  const m=text.match(/\b(?:Cod\s+produs|Cod\s+intern|Product\s*code|Item\s*code|Art\.?\s*no\.?|SKU|Model)\s*:?\s*([A-Za-z0-9][A-Za-z0-9._-]{2,})/i);
  // Fără trim, un punct de sfârșit de propoziție imediat după cod (ex. "Cod produs: ABC-123. Stoc: da")
  // rămânea lipit de cod ("ABC-123."), pentru că punctul e caracter valid ÎN interiorul multor coduri —
  // îl scoatem doar dacă apare chiar la finalul potrivirii.
  return m?m[1].replace(/[.,;]+$/,''):'';
}
function extract(html,url){
  const data={url,normalized_url:normalizeUrl(url),platform:platformOf(url),pnk:pnkOf(url),title:'',price:0,currency:'RON',rating:0,review_count:0,images:[],specs:{},description:'',ean:'',brand:'',seller:'',product_code:''};
  const ld=extractJsonLdProduct(html);
  if(ld?.title)data.title=ld.title;
  else{
    const tm=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||html.match(/<title>([^<]+)/i);
    if(tm)data.title=clean(tm[1]).slice(0,240);
  }
  if(ld?.description)data.description=ld.description.slice(0,900);
  else{
    const dm=html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if(dm)data.description=clean(dm[1]).slice(0,900);
  }
  if(ld?.price){data.price=ld.price;}
  else{
    const pm=html.match(/"price"\s*:\s*"?([\d.,]+)"?/i)||html.match(/data-price-product=["']([\d.,]+)["']/i)||html.match(/([\d.,]+)\s*(?:RON|lei|zł|PLN|EUR)/i);
    if(pm)data.price=priceFrom(pm[1]);
  }
  if(ld?.currency)data.currency=ld.currency;
  else{
    const cur=html.match(/"priceCurrency"\s*:\s*"([^"]+)"/i);
    if(cur)data.currency=cur[1]||'RON';
  }
  if(ld?.rating)data.rating=ld.rating;
  else{
    const rm=html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i);
    if(rm)data.rating=parseFloat(rm[1])||0;
  }
  if(ld?.review_count)data.review_count=ld.review_count;
  else{
    const rev=html.match(/"reviewCount"\s*:\s*"?(\d+)"?/i)||html.match(/(\d[\d., ]*)\s*(?:recenzii|recenzie|review|reviews)/i);
    if(rev)data.review_count=parseInt(String(rev[1]).replace(/[^\d]/g,''))||0;
  }
  if(ld?.ean)data.ean=String(ld.ean).trim();
  if(ld?.specs&&Object.keys(ld.specs).length)data.specs=ld.specs;
  if(ld?.brand)data.brand=ld.brand;
  if(ld?.seller)data.seller=ld.seller;
  else{
    // Fallback pentru pagini fără JSON-LD Product complet — pattern generic "seller":"..." / "vânzător".
    const sm=html.match(/"seller"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)||html.match(/[Vv][âa]ndut de[:\s]+<[^>]*>([^<]{2,80})</i);
    if(sm)data.seller=clean(sm[1]).slice(0,120);
  }
  if(ld?.sku)data.product_code=ld.sku;
  else{
    const textOnly=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
    const code=findLabeledProductCode(textOnly);
    if(code)data.product_code=code.slice(0,60);
  }
  const imgs=(ld?.images||[]).slice();
  for(const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi))imgs.push(m[1]);
  for(const m of html.matchAll(/"(?:image|imageUrl|bigImage)"\s*:\s*"([^"]+)"/gi))imgs.push(m[1]);
  for(const m of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-zoom-image)=["']([^"']+)["']/gi))imgs.push(m[1]);
  let absImgs=imgs.map(x=>{try{return new URL(x,url).toString()}catch(e){return''}}).filter(x=>x&&!isJunkImageUrl(x));
  // eMAG afișează des poze ale altor produse pe aceeași pagină (variantă vecină din selector, recomandări
  // „s-ar putea să-ți placă"), sub același tipar de URL — le izolăm strict la id-ul de produs identificat
  // din singura imagine oficială (JSON-LD), altfel am număra/afișa poze ale unui produs GREȘIT.
  if(data.platform==='emag'){
    const idSrc=(ld?.images||[])[0]||'';
    const idMatch=idSrc.match(/\/products\/(\d+)\/(\d+)\//);
    if(idMatch)absImgs=absImgs.filter(u=>u.includes(`/products/${idMatch[1]}/${idMatch[2]}/`));
  }
  const seenImgs=new Map();
  for(const u of absImgs){
    const key=imageDedupKey(u);
    if(!seenImgs.has(key)||imageWidthHint(u)>imageWidthHint(seenImgs.get(key)))seenImgs.set(key,u);
  }
  data.images=[...seenImgs.values()].slice(0,16);
  return data;
}
function similarity(a,b){
  const aw=new Set(clean(a).toLowerCase().split(/\W+/).filter(x=>x.length>2)),bw=new Set(clean(b).toLowerCase().split(/\W+/).filter(x=>x.length>2));
  if(!aw.size||!bw.size)return 0;
  let hit=0;aw.forEach(x=>{if(bw.has(x))hit++;});
  return hit/Math.max(aw.size,bw.size);
}
// Port fidel al researchNorm/researchTokens/researchDims + scorePdfCandidate (index.html) — server-side,
// ca să putem scora candidați eMAG/Trendyol la add_links (BUG găsit: linkurile adăugate normal, lipind
// un URL — fluxul principal, nu doar cel de PDF — nu primeau NICIODATĂ un scor de potrivire; coloana
// "Match" din UI cădea pe numărul de recenzii, complet irelevant pentru "e chiar același produs?").
function researchNormServer(s){
  return String(s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^\p{L}\p{N}\s]/giu,' ').replace(/\s+/g,' ').trim();
}
const RESEARCH_STOPWORDS_SERVER=new Set('de cu si și pentru in în din la pe ca un o ale al the and for with sau plus pat'.split(' '));
function researchTokensServer(s){
  return researchNormServer(s).split(' ').filter(w=>w.length>2&&!RESEARCH_STOPWORDS_SERVER.has(w));
}
function researchDimsServer(s){
  return[...String(s||'').matchAll(/\d+(?:[.,]\d+)?\s*(?:x|×)\s*\d+(?:[.,]\d+)?(?:\s*(?:x|×)\s*\d+(?:[.,]\d+)?)?\s*(?:cm|mm|m)?|\d+(?:[.,]\d+)?\s*(?:cm|mm|m|l|ml|kg|g)/gi)].map(m=>researchNormServer(m[0]));
}
// Scoring 55/30/15 (nume/caracteristici/EAN) — identic cu scorePdfCandidate din index.html.
function scoreEmagTrendyolCandidate(base,cand){
  const bName=base.title||'',cName=cand.title||'';
  const bt=researchTokensServer(bName),ct=researchTokensServer(cName);
  const overlap=bt.length?bt.filter(t=>ct.includes(t)).length/bt.length:0;
  const nameScore=Math.round(Math.min(55,overlap*55));
  const bd=researchDimsServer([bName,base.description].join(' '));
  const cd=researchDimsServer([cName,cand.description].join(' '));
  const dimHit=bd.length&&cd.length?bd.some(d=>cd.includes(d)):false;
  const charScore=dimHit?30:Math.round(Math.min(30,overlap*18));
  const hay=researchNormServer([cName,cand.description].join(' '));
  const ean=String(base.ean||'').replace(/\D/g,'');
  const eanScore=ean&&hay.includes(ean)?15:0;
  const score=Math.max(0,Math.min(100,nameScore+charScore+eanScore));
  const zone=score>=80?'ok':score>=50?'mid':'low';
  return{score,zone};
}
function calcProfit(acqGross,saleGross){
  const buy=Number(acqGross)||0,sale=Number(saleGross)||0;
  if(!buy||!sale)return{profit:0,margin:0};
  const revenue=sale/(1+VAT),buyNet=buy/(1+VAT),commissionNet=sale*COMMISSION/(1+VAT);
  const gross=revenue-buyNet-commissionNet-FIXED_COSTS,tax=Math.max(0,gross)*.16,profit=gross-tax;
  return{profit:Math.round(profit*100)/100,margin:revenue>0?Math.round((profit/revenue*100)*100)/100:0};
}
function minSaleForBuy(acqGross,targetProfit=0,targetMargin=0){
  const buy=Number(acqGross)||0;if(!buy)return 0;
  let lo=0,hi=Math.max(100,buy*4);
  const ok=sale=>{const r=calcProfit(buy,sale);return r.profit>=targetProfit&&r.margin>=targetMargin;};
  while(!ok(hi)&&hi<1e6)hi*=1.6;
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;ok(mid)?hi=mid:lo=mid;}
  return Math.round(hi*100)/100;
}
function maxBuyForSale(saleGross){
  const sale=Number(saleGross)||0;if(!sale)return 0;
  let lo=0,hi=Math.max(1,sale);
  const ok=buy=>{const r=calcProfit(buy,sale);return r.profit>=MIN_PROFIT&&r.margin>=MIN_MARGIN;};
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;ok(mid)?lo=mid:hi=mid;}
  return Math.round(lo*100)/100;
}
function median(nums){
  const a=nums.filter(x=>x>0).sort((x,y)=>x-y);
  return a.length?a[Math.floor(a.length/2)]:0;
}
function riskFlags(project,links,marketMin,minZero){
  const text=clean([project.title,project.notes,...links.map(l=>`${l.title||''} ${l.description||''}`)].join(' ')).toLowerCase();
  const flags=[];
  if(/voluminos|greu|fragil|sticla|ceramic|oglinda|mobilier|scaun|masa|covor|pat|geant[aă]\s+mare|rucsac\s+mare/.test(text))flags.push('produs voluminos/fragil sau transport posibil scump');
  if(/m[aă]rim|compatibil|electronic|bater|acumulator|telefon|usb|led|incarcator|garan[tț]ie|retur/.test(text))flags.push('risc retur/reclamații peste medie');
  if(marketMin&&minZero&&marketMin<minZero*1.1)flags.push('prețul pieței este la sub 10% peste pragul minim AB HOMES');
  return flags;
}
function projectVerdict(project,links){
  // Prețul de piață se calculează DOAR din linkuri competitor (eMAG/Trendyol/altul) — linkurile
  // de furnizor (Jumbo/Maxy/Verk etc., adăugate ca sursă de cost) nu trebuie să se amestece în
  // referința de preț de vânzare, altfel prețul de achiziție al furnizorului corupe verdictul.
  // include_in_listing===false = candidat cu scor 50-79, neconfirmat încă manual — nu contează ca preț de piață.
  const valid=links.filter(l=>l.platform!=='furnizor'&&Number(l.price)>0&&l.status!=='eroare'&&l.include_in_listing!==false);
  const prices=valid.map(l=>toRon(l.price,l.currency)).filter(Boolean);
  const convertedCount=valid.filter(l=>String(l.currency||'RON').toUpperCase()!=='RON'&&String(l.currency||'RON').toUpperCase()!=='LEI').length;
  const buy=Number(project.acquisition_price)||0,marketMin=prices.length?Math.min(...prices):0,marketMedian=median(prices);
  const reviewMax=Math.max(0,...valid.map(l=>Number(l.review_count)||0));
  if(!buy)return{verdict:'Date insuficiente',profit_estimated:0,margin_estimated:0,max_buy_price:0,notes:'Lipsește prețul de achiziție.'};
  if(!marketMin)return{verdict:'Date insuficiente',profit_estimated:0,margin_estimated:0,max_buy_price:0,notes:'Lipsește un preț competitor valid (linkurile de furnizor nu contează ca preț de piață).'};
  const ref=marketMin,profit=calcProfit(buy,ref),maxBuy=maxBuyForSale(ref),minZero=minSaleForBuy(buy,0,0),flags=riskFlags(project,valid,marketMin,minZero);
  const profitable=profit.profit>=MIN_PROFIT&&profit.margin>=MIN_MARGIN;
  let verdict='Date insuficiente',notes=[];
  if(!profitable){
    verdict=maxBuy>0?`Cumpără doar sub ${maxBuy.toFixed(2)} lei`:'Evită';
    notes.push(`La prețul pieței ${ref.toFixed(2)} RON, profitul estimat este ${profit.profit.toFixed(2)} RON și marja ${profit.margin.toFixed(2)}%.`);
  }else if(flags.length){
    verdict='Testează 3-5 bucăți';
    notes.push('Profitabil, dar blocat de risc: '+flags.join('; ')+'.');
  }else if(valid.length>=2&&reviewMax>=10){
    verdict='Cumpără';
    notes.push('Trece pragurile de profit și are cerere minimă confirmată: 2+ competitori și 10+ review-uri.');
  }else{
    verdict='Testează 3-5 bucăți';
    notes.push(reviewMax<10?'Profitabil, dar fără suficiente review-uri; se testează, nu se blochează.':'Profitabil, dar datele de piață sunt încă limitate.');
  }
  notes.push(`Referință piață: minim ${marketMin.toFixed(2)} RON, mediană ${marketMedian?marketMedian.toFixed(2):'—'} RON. Prag zero profit estimat: ${minZero.toFixed(2)} RON.`);
  if(convertedCount)notes.push(`${convertedCount} preț(uri) convertite automat în RON (curs aproximativ) — verifică manual dacă decizia e la limită.`);
  return{verdict,profit_estimated:profit.profit,margin_estimated:profit.margin,max_buy_price:maxBuy,notes:notes.join(' ')};
}
async function recalcProject(projectId){
  const pr=(await supa('GET',`research_projects?id=eq.${projectId}&select=*`))?.[0];
  if(!pr)throw new Error('Dosarul nu există');
  const links=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
  const v=projectVerdict(pr,links);
  const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,{...v,updated_at:new Date().toISOString()});
  return{project:rows?.[0],links};
}
async function analyzeUrl(url){
  const headers={'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36','accept':'text/html,application/xhtml+xml,*/*','accept-language':'ro-RO,ro;q=0.9,en;q=0.8'};
  const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(url,{headers,signal:ctrl.signal,redirect:'follow'});clearTimeout(t);
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return extract((await r.text()).slice(0,MAX_HTML),url);
  }catch(e){
    clearTimeout(t);
    return{url,normalized_url:normalizeUrl(url),platform:platformOf(url),pnk:pnkOf(url),title:'',price:0,currency:'RON',rating:0,review_count:0,images:[],specs:{},description:'',status:'eroare',error:e.message};
  }
}

module.exports=async function handler(req,res){
  try{
    if(req.method==='GET'){
      // IMPORTANT: research_links.images și research_projects.cover_image sunt poze base64 stocate
      // direct în coloane text/jsonb — pe un cont real, asta a ajuns la 29.5MB pentru doar 13 dosare
      // (verificat direct în producție). Un răspuns de 30MB explica ȘI încărcarea de 12+ secunde, ȘI
      // dosarele care "și-au pierdut" linkurile: loturile din chunk-ul de mai jos depășeau limita și
      // erau prinse tăcut de catch-ul de eșec parțial, întorcând listă goală — arăta ca dispariție de
      // date, deși erau intacte în baza de date. Fix: pozele noi se comprimă la încărcare (vezi
      // resizeImageDataUrl în index.html), iar cele deja existente au fost comprimate o dată, manual
      // (55.9MB → 6MB) — cover_image e acum mic (câteva zeci de KB), sigur de inclus în lista generală.
      // research_links.images rămâne EXCLUS din lista generală (mai multe poze per link, tot ar aduna
      // câțiva MB) — se aduce separat, o singură dată per dosar, când chiar îl deschizi (hydrate_project).
      const projects=await supa('GET','research_projects?select=id,title,acquisition_price,supplier,verdict,profit_estimated,margin_estimated,max_buy_price,notes,listing_status,listing,cover_image,created_at,updated_at&order=updated_at.desc&limit=50');
      // finalizat e o coloană nouă (migration_research_finalizat.sql) — cerută separat, cu fallback la
      // false pentru toate dacă migrarea nu a fost încă rulată, ca lista principală de dosare să NU se
      // rupă din cauza unei coloane lipsă (același tipar de reziliență ca la comenzi_stoc/activitate_stoc).
      if(projects.length){
        try{
          const finalRows=await supa('GET',`research_projects?select=id,finalizat&id=in.(${projects.map(p=>p.id).join(',')})`);
          const finalMap=new Map((finalRows||[]).map(r=>[r.id,!!r.finalizat]));
          projects.forEach(p=>{p.finalizat=finalMap.get(p.id)||false;});
        }catch(e){projects.forEach(p=>{p.finalizat=false;});}
      }
      const ids=projects.map(p=>p.id);
      const LINK_LIST_COLUMNS='id,project_id,url,normalized_url,platform,pnk,title,price,currency,rating,review_count,specs,description,duplicate_of,duplicate_type,include_in_listing,status,error,created_at,updated_at,source,score,score_zone,brand,seller,ean,ai_match_verdict,ai_match_reason';
      const CHUNK=10;
      const chunks=[];
      for(let i=0;i<ids.length;i+=CHUNK)chunks.push(ids.slice(i,i+CHUNK));
      const linkResults=await Promise.all(chunks.map(async chunk=>{
        try{return await supa('GET',`research_links?project_id=in.(${chunk.join(',')})&select=${LINK_LIST_COLUMNS}&order=created_at.desc`);}
        catch(e){console.error('research_links chunk failed',e.message);return[];}
      }));
      const links=linkResults.flat().map(l=>({...l,images:[]}));
      // product_code e o coloană nouă (migration_link_product_code.sql) — cerută separat, cu fallback
      // silențios dacă migrarea nu a fost încă rulată, ca lista principală (linkurile din fiecare dosar)
      // să NU dispară din cauza unei coloane lipsă (același tipar de reziliență ca la finalizat mai sus).
      if(links.length){
        try{
          const codeRows=await supa('GET',`research_links?select=id,product_code&id=in.(${links.map(l=>l.id).join(',')})`);
          const codeMap=new Map((codeRows||[]).map(r=>[r.id,r.product_code||'']));
          links.forEach(l=>{l.product_code=codeMap.get(l.id)||'';});
        }catch(e){links.forEach(l=>{l.product_code='';});}
      }
      // emag_performance — la fel, coloană nouă (migration_link_emag_performance.sql), cu fallback
      // silențios pe gol dacă migrarea nu a fost încă rulată.
      if(links.length){
        try{
          const perfRows=await supa('GET',`research_links?select=id,emag_performance&id=in.(${links.map(l=>l.id).join(',')})`);
          const perfMap=new Map((perfRows||[]).map(r=>[r.id,r.emag_performance||'']));
          links.forEach(l=>{l.emag_performance=perfMap.get(l.id)||'';});
        }catch(e){links.forEach(l=>{l.emag_performance='';});}
      }
      return res.status(200).json({projects:projects.map(p=>({...p,links:links.filter(l=>l.project_id===p.id)}))});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(body.action==='hydrate_project'){
      // Aduce imaginile (cover_image + research_links.images) pentru UN singur dosar — apelat doar
      // când utilizatorul chiar deschide/expandează acel dosar, nu pentru toată lista deodată.
      // Un singur dosar = query mic, rapid, fără risc de timeout, indiferent câte poze are.
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const[projRows,links]=await Promise.all([
        supa('GET',`research_projects?id=eq.${projectId}&select=cover_image`),
        supa('GET',`research_links?project_id=eq.${projectId}&select=id,images`)
      ]);
      return res.status(200).json({coverImage:projRows?.[0]?.cover_image||null,links});
    }
    if(body.action==='create_project'){
      const title=clean(body.title);
      if(!title)return res.status(400).json({error:'Titlul dosarului este obligatoriu'});
      const rows=await supa('POST','research_projects',{title,acquisition_price:Number(body.acquisition_price)||0,supplier:clean(body.supplier),verdict:'Date insuficiente',listing_status:'negenerat'});
      return res.status(200).json({project:rows?.[0]});
    }
    if(body.action==='update_project_title'){
      // Editare manuală a titlului dosarului (ex. traducerea automată de la creare nu a ieșit perfect,
      // sau utilizatorul vrea pur și simplu alt titlu) — acțiune minimă, ca update_link_title, nu atinge
      // preț/furnizor/verdict/alte câmpuri deja salvate ale dosarului.
      const projectId=Number(body.project_id);
      const title=clean(body.title).slice(0,240);
      if(!projectId||!title)return res.status(400).json({error:'Lipsesc datele'});
      const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,{title,updated_at:new Date().toISOString()});
      const project=rows?.[0];
      if(!project)return res.status(404).json({error:'Dosarul nu a fost găsit'});
      return res.status(200).json({project});
    }
    // Marchează/demarchează un dosar ca finalizat — nu șterge/mută nimic, doar un flag care ascunde
    // dosarul din lista activă implicit (vezi researchShowFinalized în index.html), ca pagina să rămână
    // curată fără să piardă istoricul dosarelor deja încheiate.
    if(body.action==='set_project_finalized'){
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,{finalizat:!!body.finalizat,updated_at:new Date().toISOString()});
      const project=rows?.[0];
      if(!project)return res.status(404).json({error:'Dosarul nu a fost găsit'});
      return res.status(200).json({project});
    }
    // ── Bancă de coduri EAN — pentru produse noi fără cod de bare real. Alocate unul câte unul (cel
    // mai vechi introdus, primul folosit), ȘTERSE din tabelă imediat ce sunt alocate (nu doar marcate
    // folosite) — cerință explicită: lista trebuie să arate mereu doar ce a mai rămas disponibil.
    if(body.action==='add_ean_codes'){
      const raw=Array.isArray(body.codes)?body.codes:[];
      const codes=[...new Set(raw.map(c=>String(c||'').replace(/\D/g,'')).filter(c=>c.length>=8&&c.length<=13))];
      if(!codes.length)return res.status(400).json({error:'Niciun cod EAN valid (8-13 cifre) găsit'});
      const existing=await supa('GET','ean_pool?select=ean');
      const existingSet=new Set((existing||[]).map(r=>r.ean));
      const newCodes=codes.filter(c=>!existingSet.has(c));
      if(newCodes.length)await supa('POST','ean_pool',newCodes.map(ean=>({ean})));
      const countRows=await supa('GET','ean_pool?select=id');
      return res.status(200).json({added:newCodes.length,duplicates:codes.length-newCodes.length,count:countRows.length});
    }
    // Lista completă (nu doar numărul) — utilizatorul trebuie să poată vedea și alege manual ce cod
    // să marcheze folosit, nu doar să afle câte mai sunt. Limitată la 500, suficient pentru o bancă
    // de coduri lucrată manual; ordonată ca la consume_ean (cel mai vechi întâi).
    if(body.action==='ean_pool_list'){
      const rows=await supa('GET','ean_pool?select=id,ean,created_at&order=id.asc&limit=500');
      return res.status(200).json({codes:rows||[]});
    }
    // Șterge un cod ALES de utilizator (bifat ca „folosit"), spre deosebire de consume_ean care ia
    // mereu cel mai vechi — aceeași operație de fond (dispare din bancă), doar altă sursă a alegerii.
    if(body.action==='remove_ean_code'){
      const id=Number(body.id);
      if(!id)return res.status(400).json({error:'Lipsește id-ul codului'});
      await supa('DELETE',`ean_pool?id=eq.${id}`);
      const countRows=await supa('GET','ean_pool?select=id');
      return res.status(200).json({count:countRows.length});
    }
    if(body.action==='consume_ean'){
      const rows=await supa('GET','ean_pool?select=id,ean&order=id.asc&limit=1');
      const row=rows?.[0];
      if(!row)return res.status(200).json({ean:null,remaining:0});
      await supa('DELETE',`ean_pool?id=eq.${row.id}`);
      const remainingRows=await supa('GET','ean_pool?select=id');
      return res.status(200).json({ean:row.ean,remaining:remainingRows.length});
    }
    if(body.action==='add_links'){
      const projectId=Number(body.project_id),urls=Array.isArray(body.urls)?body.urls.slice(0,MAX_LINKS):[];
      if(!projectId||!urls.length)return res.status(400).json({error:'Lipsesc dosarul sau linkurile'});
      const existing=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
      const added=[],skipped=[],flagged=[];
      const queue=[];
      for(const raw of urls){
        let norm='',pnk='';
        try{norm=normalizeUrl(raw);pnk=pnkOf(norm);}catch(e){skipped.push({url:raw,reason:'URL invalid'});continue;}
        const dupe=existing.find(l=>l.normalized_url===norm)||(pnk?existing.find(l=>l.pnk===pnk):null);
        if(dupe){skipped.push({url:raw,reason:'duplicat sigur',duplicate_of:dupe.id});continue;}
        if(queue.find(x=>x.norm===norm||(pnk&&x.pnk===pnk))){skipped.push({url:raw,reason:'duplicat în lista curentă'});continue;}
        queue.push({raw,norm,pnk});
      }
      // Fost: predicție statică pe hostname ("jumbo."/"maxy." = mereu needsScreenshot, fără să încercăm
      // fetch-ul deloc). Confirmat pe o pagină reală old.maxy.eu: unele subdomenii/pagini Maxy CHIAR se
      // randează server-side, cu titlu/poze/EAN/brand reale — doar prețul lipsește des din HTML brut
      // (încărcat separat, prin JS, după randare, nu vizibil unui fetch simplu). O listă fixă de domenii
      // ratează asta. Acum încercăm ÎNTOTDEAUNA fetch-ul întâi și decidem "are nevoie de screenshot" pe
      // baza rezultatului REAL — găsit titlu sau nu — nu pe o presupunere dinainte.
      const analyzed=await Promise.all(queue.map(async x=>{
        const data=await analyzeUrl(x.norm);
        if(!data.title)return{...x,data:{...data,status:data.error?'eroare':'aștept screenshot'}};
        return{...x,data};
      }));
      // Titlul dosarului, ca ultim fallback de referință pentru scoring — dacă niciun link de furnizor
      // nu are încă un titlu (dosar nou, adaugi totul dintr-o dată), tot avem CEVA de comparat.
      let projectTitle='';
      try{const projRows=await supa('GET',`research_projects?id=eq.${projectId}&select=title`);projectTitle=projRows?.[0]?.title||'';}catch(e){}
      for(const item of analyzed){
        const{raw,norm,pnk,data}=item;
        const probable=existing.find(l=>data.title&&l.title&&similarity(data.title,l.title)>.72&&(!data.price||!l.price||Math.abs(Number(data.price)-Number(l.price))/Math.max(Number(l.price),1)<.12));
        const row={project_id:projectId,url:String(raw).trim(),normalized_url:norm,platform:data.platform,pnk:data.pnk||pnk,title:data.title,price:data.price||0,currency:data.currency||'RON',rating:data.rating||0,review_count:data.review_count||0,images:data.images||[],specs:data.specs||{},description:data.description||'',brand:data.brand||'',seller:data.seller||'',ean:data.ean||'',duplicate_of:probable?.id||null,duplicate_type:probable?'probabil':'none',include_in_listing:true,source:data.title?'web':'screenshot',status:data.status||(data.error?'eroare':'analizat'),error:data.error||null};
        // BUG găsit: linkurile eMAG/Trendyol adăugate normal (lipind un URL — fluxul PRINCIPAL de
        // adăugare, nu doar cel de import PDF) nu primeau NICIODATĂ un scor de potrivire — coloana
        // "Match" din UI cădea pe numărul de recenzii, complet irelevant pentru "e chiar același
        // produs?". Acum se scorează la fel ca la import PDF (scoreEmagTrendyolCandidate, 55/30/15
        // nume/caracteristici/EAN), față de linkul de furnizor deja din dosar (dacă e deja în listă,
        // inclusiv unul adăugat chiar în acest apel, mai devreme în buclă).
        if((data.platform==='emag'||data.platform==='trendyol')&&data.title){
          const baseRef=existing.find(l=>l.platform==='furnizor'&&l.title)||(projectTitle?{title:projectTitle,description:'',ean:''}:null);
          if(baseRef){
            const sc=scoreEmagTrendyolCandidate(baseRef,{title:data.title,description:data.description});
            row.score=sc.score;row.score_zone=sc.zone;
            // Aceeași politică ca la import PDF: sub 80 nu se include automat în calculul verdictului/
            // prețurilor de piață — o potrivire slabă nu trebuie să denatureze prețul minim de
            // concurență. Zona 50-79 rămâne editabilă din UI (checkbox "confirmă"); sub 50 rămâne exclusă.
            row.include_in_listing=sc.score>=80;
          }
        }
        const ins=await supa('POST','research_links',row);
        const saved=ins?.[0]||row;
        // product_code e o coloană nouă (migration_link_product_code.sql) — scrisă separat, best-effort,
        // NU în insertul de mai sus: dacă am pune-o direct în `row` și migrarea n-a fost încă rulată,
        // Supabase ar respinge TOT insertul (nu doar coloana lipsă), blocând complet adăugarea de linkuri.
        if(data.product_code){
          try{
            const codeRows=await supa('PATCH',`research_links?id=eq.${saved.id}`,{product_code:data.product_code});
            if(codeRows?.[0])saved.product_code=codeRows[0].product_code;
          }catch(e){/* coloana lipsă — ignorăm silențios până se rulează migrarea */}
        }
        existing.push(saved);added.push(saved);if(probable)flagged.push(saved);
      }
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      const verdict=await recalcProject(projectId);
      return res.status(200).json({added,skipped,flagged,verdict:verdict.project});
    }
    if(body.action==='update_link_title'){
      // Titlu retradus în română de AI, client-side (vezi researchTranslateLinkTitles din index.html) —
      // serverul doar salvează rezultatul, nu apelează AI aici. Acțiune minimă, separată de set_link_data,
      // ca să nu rescrie/atingă preț/poze/alte câmpuri deja salvate ale linkului.
      const linkId=Number(body.link_id);
      const title=clean(body.title).slice(0,240);
      if(!linkId||!title)return res.status(400).json({error:'Lipsesc datele'});
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,{title,updated_at:new Date().toISOString()});
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      return res.status(200).json({link});
    }
    if(body.action==='update_link_match_verdict'){
      // Verdict "e chiar același produs?" calculat de AI, client-side (vezi verifyLinkMatchWithAI din
      // index.html, compară poză+titlu+specificații) — serverul doar salvează rezultatul, nu apelează
      // AI aici. Completează scorul determinist existent (score/score_zone), nu îl înlocuiește.
      const linkId=Number(body.link_id);
      const verdict=['match','no_match','uncertain'].includes(body.verdict)?body.verdict:'';
      const reason=clean(body.reason).slice(0,500);
      if(!linkId||!verdict)return res.status(400).json({error:'Lipsesc datele'});
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,{ai_match_verdict:verdict,ai_match_reason:reason});
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      return res.status(200).json({link});
    }
    if(body.action==='set_link_data'){
      // Completează un link 'aștept screenshot' (Jumbo/Maxy) cu datele deja extrase de AI, client-side,
      // dintr-o poză încărcată — serverul nu face fetch și nu apelează AI aici, doar salvează rezultatul.
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const title=clean(body.title).slice(0,240);
      if(!title)return res.status(400).json({error:'Titlul extras din screenshot este gol'});
      // Poza din screenshot rămâne salvată — folosită ulterior ca "poză principală" la generarea AI
      // a căutării eMAG/Trendyol (produsul e vizibil în captură chiar dacă nu are o poză separată de site).
      const patch={title,price:Number(body.price)||0,currency:clean(body.currency)||'RON',description:clean(body.description||'').slice(0,900),brand:clean(body.brand||'').slice(0,120),seller:clean(body.seller||'').slice(0,120),rating:Number(body.rating)||0,review_count:Number(body.reviewCount)||0,source:'screenshot',status:'analizat',error:null,updated_at:new Date().toISOString()};
      if(Array.isArray(body.images)&&body.images.length)patch.images=body.images.slice(0,5);
      if(body.ean)patch.ean=clean(body.ean).slice(0,60);
      // Product Truth (eMAG Listing Readiness) citește specs — fără asta, orice link analizat din
      // poză (Trendyol/Maxy/Jumbo/eMAG blocat, calea principală în practică) rămânea complet orb la
      // atribute (Material, Dimensiuni etc.), deși userul le vede clar în captura de ecran.
      if(body.specs&&typeof body.specs==='object'){
        const specs={};
        for(const k of Object.keys(body.specs)){
          const kk=clean(k).slice(0,60),vv=clean(String(body.specs[k]??'')).slice(0,200);
          if(kk&&vv)specs[kk]=vv;
        }
        if(Object.keys(specs).length)patch.specs=specs;
      }
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,patch);
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      // product_code separat, best-effort — vezi explicația din add_links (migrare nouă, nu trebuie
      // să poată bloca restul datelor din screenshot dacă migrarea nu a fost încă rulată).
      if(body.productCode){
        try{
          const codeRows=await supa('PATCH',`research_links?id=eq.${linkId}`,{product_code:clean(body.productCode).slice(0,60)});
          if(codeRows?.[0])link.product_code=codeRows[0].product_code;
        }catch(e){/* coloana lipsă — ignorăm silențios până se rulează migrarea */}
      }
      const verdict=await recalcProject(link.project_id);
      return res.status(200).json({link,verdict:verdict.project});
    }
    if(body.action==='add_pdf_listings'){
      // eMAG/Trendyol nu pot fi deschise/citite automat linkuri-cu-linkuri — utilizatorul strânge
      // screenshot-uri ale rezultatelor căutării într-un PDF, AI-ul (client-side) citește fiecare
      // anunț din pagini, iar aici doar salvăm rezultatele deja scorate (fără poze din PDF, Q72).
      const projectId=Number(body.project_id),platform=body.platform==='trendyol'?'trendyol':'emag';
      const listings=Array.isArray(body.listings)?body.listings.slice(0,30):[];
      if(!projectId||!listings.length)return res.status(400).json({error:'Lipsesc dosarul sau anunțurile din PDF'});
      const stamp=Date.now();
      const rows=listings.map((l,i)=>{
        const title=clean(l.title).slice(0,240),score=Math.max(0,Math.min(100,Number(l.score)||0));
        const zone=score>=80?'ok':score>=50?'mid':'low';
        // Product Truth (eMAG Listing Readiness) citește specs/ean — fără ele, candidații din PDF
        // rămâneau mereu orbi la atribute, chiar dacă AI-ul le vedea clar pe pagina de produs (Q83).
        const specs={};
        if(l.specs&&typeof l.specs==='object'){
          for(const k of Object.keys(l.specs)){
            const kk=clean(k).slice(0,60),vv=clean(String(l.specs[k]??'')).slice(0,200);
            if(kk&&vv)specs[kk]=vv;
          }
        }
        return{project_id:projectId,url:`pdf-import://${platform}/${stamp}-${i}`,normalized_url:`pdf-import://${platform}/${stamp}-${i}`,platform,pnk:null,title,price:Number(l.price)||0,currency:clean(l.currency)||'RON',rating:Number(l.rating)||0,review_count:Number(l.reviewCount)||0,images:[],specs,ean:clean(l.ean||'').slice(0,60),description:clean(l.description||'').slice(0,900),brand:clean(l.brand||'').slice(0,120),seller:clean(l.seller||'').slice(0,120),duplicate_of:null,duplicate_type:'none',include_in_listing:score>=80,source:'pdf',score,score_zone:zone,status:'analizat',error:null};
      }).filter(r=>r.title);
      if(!rows.length)return res.status(400).json({error:'Niciun anunț valid găsit în PDF'});
      const ins=await supa('POST','research_links',rows);
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      const verdict=await recalcProject(projectId);
      return res.status(200).json({added:ins||rows,verdict:verdict.project});
    }
    if(body.action==='set_project_image'){
      // Poză de copertă setată manual — folosită doar când niciun link din dosar nu are deja o poză
      // extrasă automat (JSON-LD/screenshot). Stocată direct ca data URL, la fel ca pozele de pe linkuri.
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const image=String(body.image||'');
      if(!image.startsWith('data:image'))return res.status(400).json({error:'Imagine invalidă'});
      const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,{cover_image:image,updated_at:new Date().toISOString()});
      const project=rows?.[0];
      if(!project)return res.status(404).json({error:'Dosarul nu a fost găsit'});
      return res.status(200).json({project});
    }
    if(body.action==='delete_project'){
      // research_links are legate cu "on delete cascade" pe project_id — ștergerea dosarului șterge automat toate linkurile.
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      await supa('DELETE',`research_projects?id=eq.${projectId}`);
      return res.status(200).json({deleted:projectId});
    }
    if(body.action==='delete_link'){
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const existing=(await supa('GET',`research_links?id=eq.${linkId}&select=project_id`))?.[0];
      if(!existing)return res.status(404).json({error:'Linkul nu a fost găsit'});
      await supa('DELETE',`research_links?id=eq.${linkId}`);
      const verdict=await recalcProject(existing.project_id);
      return res.status(200).json({deleted:linkId,verdict:verdict.project});
    }
    if(body.action==='dismiss_link_duplicate'){
      // Utilizatorul confirmă manual că NU e duplicat (detecția "probabil" e doar suprapunere de
      // titlu+preț, poate greși) — curăță flag-ul permanent, fără să șteargă linkul.
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,{duplicate_of:null,duplicate_type:'none'});
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      return res.status(200).json({link});
    }
    if(body.action==='toggle_link_include'){
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,{include_in_listing:!!body.include,updated_at:new Date().toISOString()});
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      const verdict=await recalcProject(link.project_id);
      return res.status(200).json({link,verdict:verdict.project});
    }
    // Performanță eMAG (Target Zone) — apreciere manuală, pe baza analizei/căutărilor proprii, nu
    // calculată automat de sistem. Doar pentru linkuri eMAG, dar nu forțăm asta aici — coloana e
    // generică, câmpul rămâne pur informativ oricum.
    if(body.action==='set_link_performance'){
      const linkId=Number(body.link_id);
      const allowed=['','supercold','cold','standard','hot','superhot'];
      const performance=allowed.includes(body.performance)?body.performance:'';
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,{emag_performance:performance,updated_at:new Date().toISOString()});
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      return res.status(200).json({link});
    }
    if(body.action==='recheck_links'){
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const all=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
      // Linkurile din screenshot (Jumbo/Maxy) sau din PDF (fără URL real, doar pdf-import://...) nu pot
      // fi re-verificate prin fetch — s-ar suprascrie greșit cu status "eroare" la un URL nefuncțional.
      const existing=all.filter(l=>l.source!=='screenshot'&&l.source!=='pdf');
      if(!existing.length)return res.status(200).json({checked:0,changed:0});
      const reanalyzed=await Promise.all(existing.map(async l=>({link:l,data:await analyzeUrl(l.url)})));
      let changed=0;
      const history=[];
      for(const{link,data}of reanalyzed){
        const oldPrice=Number(link.price)||0,newPrice=Number(data.price)||0;
        const priceChanged=Math.abs(oldPrice-newPrice)>=0.01;
        if(priceChanged){
          changed++;
          history.push({link_id:link.id,project_id:projectId,url:link.url,old_price:oldPrice,new_price:newPrice,currency:data.currency||link.currency||'RON'});
        }
        await supa('PATCH',`research_links?id=eq.${link.id}`,{title:data.title||link.title,price:data.price||0,currency:data.currency||link.currency||'RON',rating:data.rating||link.rating||0,review_count:data.review_count||link.review_count||0,images:data.images||link.images||[],specs:(data.specs&&Object.keys(data.specs).length)?data.specs:link.specs||{},description:data.description||link.description||'',brand:data.brand||link.brand||'',seller:data.seller||link.seller||'',ean:data.ean||link.ean||'',status:data.error?'eroare':'analizat',error:data.error||null,updated_at:new Date().toISOString()});
      }
      if(history.length){try{await supa('POST','research_price_history',history);}catch(e){/* tabela poate lipsi dacă migrarea nu a fost rulată — reverificarea tot funcționează, doar fără istoric */}}
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      const verdict=await recalcProject(projectId);
      return res.status(200).json({checked:existing.length,changed,verdict:verdict.project,links:verdict.links});
    }
    if(body.action==='recalc_project'){
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const verdict=await recalcProject(projectId);
      return res.status(200).json(verdict);
    }
    if(body.action==='set_listing_status'||body.action==='save_listing'){
      const projectId=Number(body.project_id),status=clean(body.status)||'generat';
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const patch={listing_status:status,updated_at:new Date().toISOString()};
      if(body.listing&&typeof body.listing==='object')patch.listing=body.listing;
      const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,patch);
      return res.status(200).json({project:rows?.[0]});
    }
    return res.status(400).json({error:'Acțiune necunoscută'});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Eroare research projects',details:e.details||null});
  }
};
