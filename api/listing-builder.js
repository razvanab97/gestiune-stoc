const MAX_HTML=900000,MAX_LINKS=20;

const HDRS={
  'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language':'ro-RO,ro;q=0.9,en;q=0.8'
};

function decode(s=''){return String(s).replace(/&quot;/g,'"').replace(/&#34;/g,'"').replace(/&#39;|&apos;|&#039;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function cleanText(s=''){return decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function meta(html,key){
  const safe=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pats=[
    new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']'+safe+'["\'][^>]+content=["\']([^"\']+)["\']','i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\']'+safe+'["\']','i')
  ];
  for(const p of pats){const m=html.match(p);if(m)return decode(m[1]);}
  return '';
}
function absUrl(v,base){const s=decode(v||'');if(!s)return'';try{return new URL(s,base).href;}catch(e){return '';}}
function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}
function srcsetUrls(v=''){
  return String(v||'').split(',').map(x=>x.trim().split(/\s+/)[0]).filter(Boolean);
}
function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
function isJunkImage(url=''){
  return !url||/(sprite|logo|icon|placeholder|blank|favicon|avatar|loading|pixel|1x1|badge|seal|rating|star|flag|arrow|btn|button|bg-|background)/i.test(url);
}
function isLikelyProductImage(url=''){
  return /\.(jpe?g|png|webp)(\?|$)/i.test(url)&&!isJunkImage(url);
}

// eMAG necesită minim 600×800px pentru imagini
const EMAG_MIN_W=600,EMAG_MIN_H=800;

// Scorează calitatea unei imagini pe baza URL-ului — fără fetch, doar euristică
// Include și estimare rezoluție pentru cerințele eMAG (min 600×800)
function scoreImageUrl(url=''){
  const u=url.toLowerCase();
  let score=50;

  // Semnale pozitive — lifestyle/impact/detalii
  if(/lifestyle|ambiance|scene|context|staged|model|room|interior|setting|decor|styled/i.test(u))score+=35;
  if(/spec|technical|detail|dimension|measure|annotated|infographic/i.test(u))score+=25;
  if(/main|hero|primary|featured|cover|banner|principal|principale/i.test(u))score+=20;
  if(/[-_]1\.|-01\.|-001\.|_01\.|_001\./i.test(u))score+=12;
  if(/[-_]2\.|-02\.|_02\./i.test(u))score+=8;

  // Dimensiune din URL — estimare rezoluție pentru filtrare eMAG
  // Penalizăm mai agresiv imaginile care par să fie sub 600×800
  const dims=u.match(/[_\-x](\d{3,4})[_\-x](\d{3,4})/);
  if(dims){
    const w=+dims[1],h=+dims[2],mx=Math.max(w,h),mn=Math.min(w,h);
    if(mx>=1200)score+=30;
    else if(mx>=800)score+=18;
    else if(mx>=600)score+=8;
    else if(mx<600||mn<400)score-=35; // probabil sub 600×800 — penalizare puternică
    else if(mx<400)score-=50;
  }
  const wq=u.match(/[?&](?:w|width|imwidth|size)=(\d+)/);
  if(wq){
    const w=+wq[1];
    if(w>=1000)score+=22;
    else if(w>=800)score+=15;
    else if(w>=600)score+=8;
    else if(w<600)score-=30; // sub minimul eMAG
    else if(w<400)score-=50;
  }
  // Detectare pattern-uri cunoscute de imagini mari (Jumbo, Maxy, Verk etc.)
  if(/[/_](\d{4,})[/_]/.test(u)&&parseInt(u.match(/[/_](\d{4,})[/_]/)?.[1]||'0')>=800)score+=10;

  // Semnale negative — generic/mic/junk
  if(/white.?bg|fond.?blanc|white.?back|weiss|fondo.?blanco/i.test(u))score-=8;
  if(/thumb(?:nail)?|mini|small|xs|_s\.|_m\./i.test(u))score-=25;
  if(/50x|75x|100x|150x|200x|icon|logo|badge|sprite/i.test(u))score-=40;
  if(/placeholder|loading|blank|pixel|1x1|empty/i.test(u))score-=60;

  // Format bonus
  if(/\.webp/i.test(u))score+=5;

  return Math.max(0,Math.min(100,score));
}

function scoreLabel(score){
  if(score>=80)return'impact/lifestyle';
  if(score>=65)return'produs principal';
  if(score>=50)return'produs ≥600px';
  if(score>=35)return'rezoluție mică';
  return'prea mic/junk';
}

function findProductJson(html){
  const find=o=>{
    if(!o||typeof o!=='object')return null;
    if(Array.isArray(o)){for(const x of o){const r=find(x);if(r)return r;}return null;}
    if(o['@type']==='Product'||(Array.isArray(o['@type'])&&o['@type'].includes('Product')))return o;
    if(o['@graph'])return find(o['@graph']);
    return null;
  };
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const p=find(JSON.parse(m[1]));if(p)return p;}catch(e){}
  }
  return null;
}

function parsePage(html,url){
  const product=findProductJson(html)||{};
  const image=Array.isArray(product.image)?product.image[0]:product.image;
  const imgs=[
    image,
    meta(html,'og:image'),
    meta(html,'twitter:image'),
    ...(Array.isArray(product.image)?product.image:[]),
    ...[...html.matchAll(/<img[^>]+(?:src|data-src|data-original|data-lazy-src|data-zoom-image|data-large-image)=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1]),
    ...[...html.matchAll(/<img[^>]+(?:srcset|data-srcset)=["']([^"']+)["'][^>]*>/gi)].flatMap(m=>srcsetUrls(m[1])),
    ...[...html.matchAll(/background-image\s*:\s*url\(['"]?(https?[^'")\s]+)/gi)].map(m=>m[1]),
    ...[...html.matchAll(/"(?:image|imageUrl|img|photo|thumbnail|large_image|zoom_image|fullImage|bigImage)":\s*"(https?[^"]+)"/gi)].map(m=>m[1]),
    // array-uri de imagini în JSON
    ...[...html.matchAll(/"(?:images|gallery|photos)"\s*:\s*\[([\s\S]*?)\]/gi)].flatMap(m=>[...m[1].matchAll(/"(https?[^"]+)"/g)].map(x=>x[1]))
  ].map(x=>absUrl(x,url)).filter(x=>x&&isLikelyProductImage(x));

  const uniq=[...new Set(imgs)].slice(0,40);
  const title=decode(product.name||meta(html,'og:title')||meta(html,'twitter:title')||(html.match(/<title>([^<]+)<\/title>/i)||[])[1]||'');
  const description=decode(product.description||meta(html,'og:description')||meta(html,'description')||'');
  const offer=Array.isArray(product.offers)?product.offers[0]:product.offers||{};
  const price=parsePrice(offer.price||offer.lowPrice||meta(html,'product:price:amount')||meta(html,'og:price:amount')||(html.match(/"fpf_product_price"\s*:\s*"([^"]+)"/i)||[])[1]);
  const currency=String(offer.priceCurrency||meta(html,'product:price:currency')||meta(html,'og:price:currency')||'RON').toUpperCase();
  return{
    url,
    host:new URL(url).hostname.replace(/^www\./,''),
    title,
    description,
    price,
    currency,
    images:uniq,
    text:cleanText(html).slice(0,5000)
  };
}

async function fetchPage(url){
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol)||isPrivateHost(parsed.hostname.toLowerCase()))throw new Error('URL nepermis');
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(url,{headers:HDRS,redirect:'follow',signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const buf=await r.arrayBuffer();
    const html=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,MAX_HTML)));
    return parsePage(html,url);
  }catch(e){clearTimeout(t);return{url,host:parsed.hostname.replace(/^www\./,''),error:e.message,title:'',description:'',images:[],text:''};}
}

// DuckDuckGo Images cu extragere VQD robustă
async function searchDDGImages(query){
  try{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),9000);

    // Pas 1: obține VQD token — încearcă multiple formate
    const initRes=await fetch(`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,{
      headers:{
        ...HDRS,
        'Referer':'https://duckduckgo.com/',
        'sec-fetch-site':'same-origin',
        'sec-fetch-mode':'navigate',
        'sec-fetch-dest':'document'
      },
      signal:ctrl.signal
    });
    if(!initRes.ok){clearTimeout(t);return[];}
    const initHtml=await initRes.text();

    const vqd=(
      initHtml.match(/vqd=["']?([\d-]+)["']?/)?.[1]||
      initHtml.match(/['"]vqd['"]\s*:\s*['"]([^'"]+)['"]/)?.[1]||
      initHtml.match(/&vqd=([^&"'\s<>]+)/)?.[1]||
      initHtml.match(/vqd%3D([^%&"'\s<>]+)/)?.[1]||
      initHtml.match(/vqd=([\w.-]+)/)?.[1]
    );
    if(!vqd){clearTimeout(t);return[];}

    // Pas 2: fetch imagini
    const imgRes=await fetch(
      `https://duckduckgo.com/i.js?l=ro-ro&o=json&q=${encodeURIComponent(query)}&vqd=${encodeURIComponent(vqd)}&f=,,,,,&p=1`,
      {
        headers:{
          ...HDRS,
          'Accept':'application/json',
          'Referer':`https://duckduckgo.com/?q=${encodeURIComponent(query)}&iax=images&ia=images`,
          'sec-fetch-site':'same-origin',
          'sec-fetch-mode':'cors',
          'sec-fetch-dest':'empty'
        },
        signal:ctrl.signal
      }
    );
    clearTimeout(t);
    if(!imgRes.ok)return[];
    const data=await imgRes.json();
    return(data.results||[]).slice(0,20).map(r=>r.image).filter(x=>x&&isLikelyProductImage(x));
  }catch(e){return[];}
}

// Plasă de siguranță deterministă pentru text lipit fără spațiu (ex: "ajustabile.Compartimente") —
// AI-ul primește instrucțiuni explicite să nu facă asta, dar poate scăpa ocazional. Aplicăm DOAR pe
// text simplu (titlu/descriere/bullets/specs) — NU pe description_html, unde ar strica URL-uri din
// atribute (ex: ".jpg" într-un src ar deveni ". jpg").
function fixPlainTextSpacing(s){
  if(!s||typeof s!=='string')return s;
  return s.replace(/([.!?,;:])([A-ZĂÂÎȘȚa-zăâîșț])/g,'$1 $2');
}
// Pentru HTML: doar spațiu după tag-uri de închidere lipite direct de cuvântul următor — sigur,
// nu atinge URL-uri (care nu conțin secvența literală "</tag>").
function fixHtmlTagSpacing(html){
  if(!html||typeof html!=='string')return html;
  return html.replace(/(<\/(?:strong|b|em|span|a)>)(\w)/gi,'$1 $2');
}
function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  return(data?.output||[]).flatMap(i=>i?.content||[]).filter(x=>x?.type==='output_text').map(x=>x.text||'').join('\n');
}
function jsonBlock(text=''){
  const cleaned=String(text||'').replace(/```json|```/gi,'').trim();
  let start=cleaned.indexOf('{');
  if(start<0)return '{}';
  let depth=0,inStr=false,esc=false,end=-1;
  for(let i=start;i<cleaned.length;i++){
    const ch=cleaned[i];
    if(inStr){
      if(esc)esc=false;
      else if(ch==='\\')esc=true;
      else if(ch==='"')inStr=false;
      continue;
    }
    if(ch==='"')inStr=true;
    else if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0){end=i;break;}
    }
  }
  return end>=start?cleaned.slice(start,end+1):cleaned.slice(start,cleaned.lastIndexOf('}')+1);
}
function parseLooseJson(text){
  // BUG GRAV găsit: .replace(/ /g,'') ștergea ABSOLUT TOATE spațiile din tot JSON-ul, inclusiv din
  // INTERIORUL valorilor de tip string ("Ghiozdan Negru Verde" → "GhiozdanNegruVerde") — nu doar
  // spațiile structurale (nesemnificative) dintre chei/paranteze. JSON.parse acceptă oricum spații
  // structurale fără nicio problemă — linia nu avea niciun rol legitim, doar distrugea tot textul
  // generat (titlu/descriere/bullets/specificații) la FIECARE anunț generat, din tot proiectul.
  const raw=jsonBlock(text)
    .replace(/,\s*([}\]])/g,'$1')
    .replace(/[""]/g,'"')
    .replace(/['']/g,"'");
  return JSON.parse(raw);
}
async function repairJsonWithAI(raw,mode){
  const prompt=`Repară textul de mai jos într-un JSON valid. Păstrează exact structura și informațiile, doar corectează virgule, ghilimele, escape-uri și acolade. Răspunde DOAR cu JSON valid, fără explicații.\n\nMod: ${mode}\n\nTEXT:\n${String(raw||'').slice(0,24000)}`;
  const ai=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+process.env.OPENAI_API_KEY},
    body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_output_tokens:2200,input:[{role:'user',content:[{type:'input_text',text:prompt}]}]})
  });
  const data=await ai.json();
  if(!ai.ok)throw new Error('Repararea JSON a eșuat');
  return parseLooseJson(outputText(data));
}
async function parseAiJson(text,mode){
  try{return parseLooseJson(text);}
  catch(err){
    try{return await repairJsonWithAI(text,mode);}
    catch(err2){throw new Error(`JSON AI invalid și nereparabil: ${err.message}`);}
  }
}

// Pregătește lista de imagini presortată cu scoruri pentru AI
function prepareImageListForAI(allImages){
  return allImages
    .map(url=>({url,score:scoreImageUrl(url),label:scoreLabel(scoreImageUrl(url))}))
    .sort((a,b)=>b.score-a.score)
    .slice(0,25);
}

function buildBuildPrompt(product,pages,allImages){
  const scored=prepareImageListForAI(allImages);
  const imgList=scored.map(({url,score,label})=>`  [${score}% ${label}] ${url}`).join('\n');

  return`Ești specialist senior în creare anunțuri marketplace pentru România (eMAG, Trendyol, website propriu).
Creează un anunț complet, convingător și optimizat SEO. Brandul este AB HOMES.

━━━ DATE PRODUS ━━━
${JSON.stringify(product).slice(0,4000)}

━━━ PAGINI SURSĂ (titlu, descriere, specificații, text) ━━━
${JSON.stringify(pages.map(p=>({url:p.url,host:p.host,title:p.title,description:p.description,text:p.text?.slice(0,1500),price:p.price,currency:p.currency}))).slice(0,16000)}

━━━ IMAGINI DISPONIBILE (presortate după calitate estimată) ━━━
${imgList}

━━━ IMAGINI ATAȘATE VIZUAL ━━━
Primele imagini din lista de mai sus cu scor ≥55 (până la 4) sunt atașate și ca fișiere imagine reale — le poți VEDEA, nu doar citi URL-ul. Folosește-le DOAR ca să confirmi detalii clar vizibile (culoare exactă, textură/finisaj, accesorii incluse, conținut pachet, formă) și să le adaugi în descriere/specificații dacă au impact comercial real. NU descrie ce nu e clar vizibil în poze, nu specula, nu inventa.

━━━ REGULI TITLU (vast, complex, vandabil, SEO) ━━━
TITLU eMAG (title):
- Format: [Tip produs] [Brand AB HOMES] [Material/Stil] [Caracteristică 1] [Caracteristică 2] [Dimensiune] - [Beneficiu scurt], 100-180 caractere
- Exemplu: "Ghiozdan cu roți AB HOMES Minecraft, Poliester, 33x45x22 cm, Capacitate 22 L, Compartimente multiple, Mâner reglabil - Practic și rezistent pentru școală"
- OBLIGATORIU: "AB HOMES" apare undeva ÎN INTERIORUL titlului (NU ca prim cuvânt — vine imediat după tipul de produs)
- Sintetizează din DOUĂ surse combinate — nu copia un singur titlu sursă cuvânt cu cuvânt:
  1. Titlurile paginilor sursă (title) — termenii care apar recurent/distinctiv la mai multe surse sunt cuvinte-cheie reale, căutate de cumpărători
  2. Detalii concrete NOI găsite în descrieri/text, care NU apar în niciun titlu sursă — dacă au impact comercial real, adaugă-le în titlu
- Include cât mai multe atribute concrete (material, culoare, dimensiuni, capacitate, caracteristici) — titlu vast, nu minimalist
- Cuvinte cheie cu volum mare pe eMAG în față

TITLU Trendyol (title_trendyol):
- Max 100 caractere, mai scurt, poate fi în engleză sau română — câmp secundar, titlul eMAG e principal

━━━ FORMATARE TEXT ━━━
- Spații corecte între TOATE cuvintele și propozițiile — niciodată cuvinte lipite (ex: „ajustabile.Compartimente" e GREȘIT, corect „ajustabile. Compartimente")
- În HTML, pune mereu un spațiu după tag-uri de tip </strong>/</b>/</em> dacă urmează text

━━━ REGULI DESCRIERE HTML ━━━
description_html: HTML structurat cu imagini intercalate — OBLIGATORIU minim 3 tag-uri <img>:

Structură EXACTĂ (nu omite imaginile!):
<p>[Intro cu AB HOMES și beneficiul principal]</p>
<img src="[URL imagine 1 — impact/lifestyle, scor cel mai mare]">
<p>[Paragraful beneficiilor principale, 2-3 fraze]</p>
<ul><li>...</li><li>...</li><li>...</li></ul>
<img src="[URL imagine 2 — specificații/detalii tehnice]">
<p>[Detalii tehnice, materiale, dimensiuni, utilizare]</p>
<img src="[URL imagine 3 — lifestyle sau unghi diferit]">
<p>[CTA scurt: "Comandă acum..." sau "Disponibil la..."]</p>

- Folosește <p>, <ul>, <li>, <strong>; 1500-2400 caractere text (fără taguri HTML) — descriere dezvoltată, cu paragrafe multiple (intro, beneficii, detalii tehnice, utilizare/întreținere, CTA), nu doar 2-3 fraze scurte
- IMPORTANT: dacă lista de imagini are cel puțin 3 URL-uri, toate 3 <img> sunt OBLIGATORII
- Alege URL-uri din lista de imagini disponibile (prioritar cele cu scor mare)

━━━ REGULI SELECȚIE IMAGINI ━━━
- eMAG necesită MINIM 600×800px — preferă imagini cu scor ≥50 (rezoluție ≥600px estimată)
- Selectează din lista de mai sus exact 10 URL-uri (sau mai puțin dacă nu există)
- INDEX 0 (prima): OBLIGATORIU imagine cu scor ≥60, de preferință "impact/lifestyle" sau cu specificații — NU fundal alb generic, NU thumbnail, NU imagini cu scor sub 50
- Ordinea: impact/lifestyle → specificații/detalii → produs principal → alte unghiuri → pachet
- Dacă scorul e sub 35 ("prea mic/junk"), exclude acea imagine
- Preferă URL-uri care conțin dimensiuni mari (ex: 1200x1200, 800x, w=1000) față de cele cu dimensiuni mici
- Copiază URL-urile EXACT, fără modificare
- Imaginile din description_html trebuie să fie URL-uri din lista de imagini selectate

━━━ REGULI SPECIFICAȚII ━━━
- Completează cât mai multe câmpuri; nu inventa valori absente din date

━━━ FORMAT OUTPUT ━━━
Returnează STRICT JSON valid:
{
  "title":"...",
  "title_trendyol":"...",
  "short_title":"...",
  "description":"...",
  "description_html":"<p>...</p><img src='...'>...",
  "bullets":["...","...","...","...","..."],
  "seo_keywords":["..."],
  "specs":{"Brand":"AB HOMES","Tip produs":"...","Material":"...","Culoare":"...","Dimensiuni":"...","Capacitate/Greutate":"...","Utilizare":"...","Caracteristici":"...","Conținut pachet":"...","Întreținere":"...","Alte detalii":"..."},
  "category_emag":"...",
  "category_trendyol":"...",
  "main_image":"https://...",
  "images":["https://..."],
  "source_notes":"ce informații au fost folosite / ce lipsește"
}`;
}

function buildSynthesizePrompt(pages,allImages){
  const scored=prepareImageListForAI(allImages);
  const imgList=scored.map(({url,score,label})=>`  [${score}% ${label}] ${url}`).join('\n');

  return`Ești specialist senior în creare anunțuri marketplace pentru România. Din mai multe linkuri sursă, construiești UN SINGUR anunț nou, mai bun decât oricare sursă. Brandul este AB HOMES.

━━━ PAGINI SURSĂ ━━━
${JSON.stringify(pages.map(p=>({url:p.url,host:p.host,title:p.title,description:p.description,text:p.text?.slice(0,1500),price:p.price,currency:p.currency}))).slice(0,20000)}

━━━ IMAGINI DISPONIBILE (presortate după calitate) ━━━
${imgList}

━━━ IMAGINI ATAȘATE VIZUAL ━━━
Primele imagini din lista de mai sus cu scor ≥55 (până la 4) sunt atașate și ca fișiere imagine reale — le poți VEDEA, nu doar citi URL-ul. Folosește-le DOAR ca să confirmi detalii clar vizibile (culoare exactă, textură/finisaj, accesorii incluse, conținut pachet, formă) și să le adaugi în descriere/specificații dacă au impact comercial real. NU descrie ce nu e clar vizibil în poze, nu specula, nu inventa.

━━━ REGULI TITLU (vast, complex, vandabil, SEO) ━━━
- Format: [Tip produs] [Brand AB HOMES] [Model/Temă dacă există] [Material] [Caracteristici cheie] [Dimensiuni/Capacitate] - [Beneficiu], 100-180 caractere, dens în cuvinte-cheie SEO
- Exemplu de structură reală: "Ghiozdan cu roți AB HOMES Minecraft, Poliester, 33x45x22 cm, Capacitate 22 L, Compartimente multiple, Mâner reglabil - Practic și rezistent pentru școală"
- OBLIGATORIU: cuvântul "AB HOMES" apare undeva ÎN INTERIORUL titlului (NU ca prim cuvânt — vine imediat după tipul de produs, ca în exemplu)
- Sintetizează titlul din DOUĂ surse combinate — nu copia un singur titlu sursă cuvânt cu cuvânt:
  1. Titlurile paginilor sursă de mai sus (title) — identifică termenii care apar recurent/distinctiv la mai multe surse (sunt cuvinte-cheie reale, căutate de cumpărători)
  2. Detalii concrete NOI găsite în descrieri/text (description/text), care NU apar în niciun titlu sursă — dacă un detaliu (capacitate, material, funcție, compatibilitate, dimensiuni) apare doar în descriere și are impact comercial, adaugă-l în titlu
- Include cât mai multe atribute concrete (material, culoare, dimensiuni, capacitate, caracteristici) — un titlu vast, complet, nu unul minimalist — fiecare atribut e un cuvânt-cheie căutat separat
- Populează și seo_keywords cu 5-10 termeni de căutare reali (din titlurile surselor + termeni generici de categorie), folosiți efectiv în titlu/descriere, nu doar listați decorativ
- Titlu Trendyol: max 100 caractere, poate fi engleză
- Titlul.eMAG e câmpul principal folosit — Titlul Trendyol e doar referință secundară

━━━ FORMATARE TEXT ━━━
- Spații corecte între TOATE cuvintele și propozițiile — niciodată cuvinte lipite (ex: „ajustabile.Compartimente" e GREȘIT, corect e „ajustabile. Compartimente")
- În HTML, pune mereu un spațiu după tag-uri de tip </strong>/</b>/</em> dacă urmează text, ca să nu se lipească de cuvântul următor

━━━ REGULI DESCRIERE (mai vastă, dezvoltată) ━━━
- Descriere HTML: intro → img[impact] → beneficii → img[specificații] → detalii → img[lifestyle] → CTA
- text (fără taguri HTML): 1500-2400 caractere — dezvoltată, cu paragrafe multiple (intro, beneficii, detalii tehnice/materiale/dimensiuni, întreținere/utilizare, CTA), nu doar 2-3 fraze scurte
- Acoperă explicit: ce este produsul, pentru cine/ce ocazie e potrivit, materiale și dimensiuni, caracteristici cheie (fiecare cu beneficiul ei, nu doar enumerate), conținut pachet dacă e cazul
- INDEX 0 din images[]: OBLIGATORIU impact/lifestyle (scor ≥60) — NU fundal alb
- Selectează max 10 imagini ordonate calitativ: impact → specificații → detalii → lifestyle → pachet
- Exclude imagini cu scor sub 35
- Nu copia descrieri integral; rescrie mai bun, mai complet; nu inventa specificații
- Returnează STRICT JSON valid

{
  "title":"...",
  "title_trendyol":"...",
  "short_title":"...",
  "description":"...",
  "description_html":"<p>...</p><img src='...'>...",
  "bullets":["..."],
  "seo_keywords":["..."],
  "specs":{"Brand":"AB HOMES","Tip produs":"...","Material":"...","Culoare":"...","Dimensiuni":"...","Capacitate/Greutate":"...","Utilizare":"...","Caracteristici":"...","Conținut pachet":"...","Întreținere":"...","Alte detalii":"..."},
  "category_emag":"...",
  "category_trendyol":"...",
  "main_image":"https://...",
  "images":["https://..."],
  "best_images":[{"url":"https://...","role":"impact/specificatii/detaliu/lifestyle/pachet","reason":"..."}],
  "source_titles":["..."],
  "source_notes":"..."
}`;
}

function buildAnalyzePrompt(product,pages,allImages){
  const scored=prepareImageListForAI(allImages);
  const imgList=scored.map(({url,score,label})=>`  [${score}% ${label}] ${url}`).join('\n');

  return`Ești specialist în marketplace-uri eMAG/Trendyol și optimizare anunțuri. Analizează listările externe față de produsul de bază.

Produs de bază:
${JSON.stringify(product).slice(0,5000)}

Pagini analizate:
${JSON.stringify(pages.map(p=>({url:p.url,host:p.host,title:p.title,description:p.description,text:p.text?.slice(0,1500),price:p.price,currency:p.currency}))).slice(0,20000)}

Imagini disponibile (presortate după calitate):
${imgList}

Scoruri:
- match_score 0-100: 80-100 același produs, 50-79 necesită confirmare, sub 50 alt produs
- optimization_score 0-100: calitate titlu + descriere + specificații + poze

Creează și o listare îmbunătățită:
- Titlu eMAG SEO (80-150 caractere)
- Titlu Trendyol (max 100 caractere)
- Descriere HTML cu imagini intercalate
- Prima imagine (index 0): OBLIGATORIU impact/lifestyle (scor ≥60) — NU fundal alb
- Selectează max 10 imagini ordonate calitativ
- Exclude imagini cu scor sub 35

Returnează STRICT JSON valid:
{"listings":[{"url":"...","platform":"eMAG/Trendyol/altul","extracted_title":"...","price":0,"currency":"RON","match_score":0,"is_same_product":"da/probabil/incert/nu","optimization_score":0,"strengths":["..."],"weaknesses":["..."],"reusable_parts":["..."],"specs_found":["..."],"image_notes":"..."}],"price_summary":{"valid_prices":[0],"min":0,"max":0,"average":0,"median":0,"recommended_reference_price":0,"notes":"..."},"best_patterns":["..."],"missing_info":["..."],"improved_listing":{"title":"...","title_trendyol":"...","short_title":"...","description":"...","description_html":"<p>...</p>","bullets":["..."],"seo_keywords":["..."],"specs":{"Brand":"AB HOMES","Material":"...","Dimensiuni":"...","Culoare":"...","Utilizare":"..."},"category_emag":"...","category_trendyol":"...","main_image":"https://...","images":["https://..."],"source_notes":"..."}}`;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY lipsă'});
  try{
    const mode=['analyze','synthesize'].includes(req.body?.mode)?req.body.mode:'build';
    const urls=[...new Set((req.body?.urls||[]).filter(u=>/^https?:\/\//i.test(String(u||''))).slice(0,MAX_LINKS))];
    const product=req.body?.product||{};
    // Anunțuri citite din screenshot/PDF (Research, linkuri Jumbo/Maxy sau candidați fără URL fetch-abil) —
    // nu pot fi refăcute prin fetch, dar textul deja extras de AI e valoros; îl trecem direct în "pages",
    // fără imagini (calitate slabă din captură — pozele vin din altă sursă, ca la extracția din PDF).
    const extraPages=(Array.isArray(req.body?.extraPages)?req.body.extraPages:[]).slice(0,MAX_LINKS).map(p=>({
      url:String(p.url||''),host:String(p.platform||'sursă'),title:decode(String(p.title||'')).slice(0,240),
      description:decode(String(p.description||'')).slice(0,900),text:decode(String(p.description||'')).slice(0,900),
      images:[],price:Number(p.price)||0,currency:String(p.currency||'RON')
    })).filter(p=>p.title);
    if(!urls.length&&!extraPages.length&&!product.name)return res.status(400).json({error:'Lipsesc linkurile sau produsul'});

    const pages=[...await Promise.all(urls.map(u=>fetchPage(u).catch(()=>({url:u,title:'',description:'',images:[],text:'',error:'fetch failed'})))),...extraPages];

    // Colectăm TOATE imaginile din toate paginile, deduplicate
    const pageImages=[...new Set(pages.flatMap(p=>p.images||[]).filter(x=>x&&isLikelyProductImage(x)))];

    // DDG Images ca supliment dacă avem mai puțin de 10 imagini de calitate
    let ddgImages=[];
    const productName=product.name||(pages.find(p=>p.title)?.title)||'';
    const qualityCount=pageImages.filter(u=>scoreImageUrl(u)>=50).length;
    if(productName&&qualityCount<8){
      ddgImages=await searchDDGImages(productName+' produs');
    }

    // Combină: imaginile din pagini primele (mai de încredere), DDG suplimentar
    const allImages=[...new Set([...pageImages,...ddgImages])].filter(x=>!isJunkImage(x)).slice(0,35);

    const prompt=mode==='synthesize'
      ?buildSynthesizePrompt(pages,allImages)
      :mode==='analyze'
        ?buildAnalyzePrompt(product,pages,allImages)
        :buildBuildPrompt(product,pages,allImages);

    // Atașăm și câteva poze REALE ca input vizual — înainte, prompt-ul trimitea doar o LISTĂ TEXTUALĂ
    // de URL-uri, AI-ul nu "vedea" niciodată conținutul; risca să inventeze detalii "evidente din poze"
    // fără să le fi văzut. Limităm la 4, doar cele cu scor ≥55, ca să nu umflăm costul/latența.
    const visionImages=prepareImageListForAI(allImages).filter(x=>x.score>=55).slice(0,4);
    const content=[{type:'input_text',text:prompt},...visionImages.map(img=>({type:'input_image',image_url:img.url}))];

    const ai=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_output_tokens:mode==='synthesize'?4200:2800,input:[{role:'user',content}]})
    });
    const data=await ai.json();
    if(!ai.ok)return res.status(ai.status).json(data);
    const text=outputText(data);
    const json=await parseAiJson(text,mode);

    const listing=mode==='analyze'?json.improved_listing:json;
    if(listing&&typeof listing==='object'){
      listing.specs={Brand:'AB HOMES',...(listing.specs||{})};
      ['title','title_trendyol','short_title','description'].forEach(k=>{if(listing[k])listing[k]=fixPlainTextSpacing(listing[k]);});
      if(Array.isArray(listing.bullets))listing.bullets=listing.bullets.map(fixPlainTextSpacing);
      if(listing.specs)for(const k of Object.keys(listing.specs))listing.specs[k]=fixPlainTextSpacing(listing.specs[k]);
      if(listing.description_html)listing.description_html=fixHtmlTagSpacing(listing.description_html);
      if(!listing.description&&listing.description_html){
        listing.description=listing.description_html.replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,1800);
      }
      if(!listing.images?.length&&allImages.length){
        // Dacă AI nu a returnat imagini, construim lista sortată după score
        listing.images=prepareImageListForAI(allImages).map(x=>x.url).slice(0,10);
      }
      if(!listing.main_image&&listing.images?.length){
        listing.main_image=listing.images[0];
      }
      // Adaugă scored images în răspuns pentru UI
      listing._scoredImages=prepareImageListForAI(allImages).slice(0,20);
    }

    return res.status(200).json(mode==='analyze'?{analysis:json,pages,allImages}:{listing:json,pages,allImages});
  }catch(err){
    return res.status(500).json({error:'Eroare generator anunț: '+(err.message||err)});
  }
};
