const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HDRS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'ro-RO,ro;q=0.9,en;q=0.8','Accept-Encoding':'gzip, deflate, br'};

function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}
function decode(s=''){return String(s).replace(/&quot;/g,'"').replace(/&#34;/g,'"').replace(/&#39;|&apos;|&#039;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function stripTags(s=''){return decode(String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' '));}
function absUrl(v,base){
  if(!v)return '';
  try{return new URL(decode(v),base).href;}catch(e){return '';}
}
function uniqCandidates(items,limit=5){
  const seen=new Set(),out=[];
  for(const it of items){
    const title=stripTags(it.title||'');
    const price=parsePrice(it.price);
    const link=it.link||'';
    if(!title||!price)continue;
    const key=(link||title).toLowerCase();
    if(seen.has(key))continue;
    seen.add(key);
    out.push({title,price,img:it.img||'',link,source:it.source||'scrape'});
    if(out.length>=limit)break;
  }
  return out;
}
function parseEmagPriceHtml(html=''){
  const raw=String(html||'');
  const entity=decode(raw);
  const m=entity.match(/(\d{1,5})\s*<sup>\s*(?:<small[^>]*>\s*[,\.]\s*<\/small>)?\s*(\d{2})\s*<\/sup>/i);
  if(m)return Number(m[1].replace(/\./g,'')+'.'+m[2]);
  const txt=stripTags(raw).replace(/\s+/g,' ');
  const dec=txt.match(/(\d{1,5})\s*[,\.]\s*(\d{2})/);
  if(dec)return Number(dec[1].replace(/\./g,'')+'.'+dec[2]);
  return parsePrice(txt);
}

async function fetchText(url,ms=6000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),ms);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return'';
    return (await r.text()).slice(0,1500000);
  }catch(e){clearTimeout(t);return'';}
}

// AI generează query-uri optimizate cu traducere explicită
async function generateAIQueries(name,description,characteristics,ean,apiKey){
  if(!apiKey)return null;
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),10000);
  try{
    const charsText=Array.isArray(characteristics)&&characteristics.length
      ?characteristics.slice(0,5).join(' | ')
      :'—';
    const prompt=`Ești expert în marketplace-uri românești. Generează interogări de căutare SPECIFICE în ROMÂNĂ pentru un produs de vânzare.

PRODUS (din catalog furnizor european — poate fi în olandeză, poloneză, franceză, germană sau engleză):
Denumire originală: "${name}"
Caracteristici: ${charsText}
EAN/Cod: ${ean||'—'}
Descriere: "${(description||'').slice(0,200)}"

PAS 1 — Traduce și identifică produsul:
Ce tip de produs e? Traduce în română dacă e în altă limbă.
Exemple: "Decoratieve Fontein 3 lagen LED bruin" → fantana arteziana 3 niveluri led maro
         "Kosz wiklinowy z pokrywą naturalny" → cos rachita cu capac natural
         "Tapis shaggy rond beige 120cm" → covor rotund shaggy bej 120cm
         "Laterne Windlicht Bambus groß" → felinar bambus mare

PAS 2 — Generează 4 query-uri pentru eMAG.ro, PROGRESIV de la specific la general:

QUERY 1 (CEL MAI SPECIFIC): include TOATE caracteristicile distinctive ale produsului.
  Exemple BUNE: "fantana arteziana led 3 niveluri interior maro", "covor living rotund pufos bej 120", "felinar bambus decorativ mare"
  Exemple RELE (prea vagi): "fantana decorativa", "covor living", "felinar"
  → Pot fi 5-7 cuvinte dacă produsul are mai multe caracteristici distinctive
  → Include culoarea, materialul, numărul de niveluri/piese, destinația (interior/exterior) dacă sunt relevante
  → Include dimensiunea DOAR dacă e o caracteristică definitorie (ex: "covor 120cm rotund")

QUERY 2 (SPECIFIC): tip produs + 2 caracteristici cheie (material/culoare/funcție)
QUERY 3 (MEDIU): tip produs + cea mai vizibilă caracteristică
QUERY 4 (GENERAL): 2-3 cuvinte, tip produs simplu în română

Reguli pentru TOATE: FĂRĂ termeni din altă limbă, FĂRĂ mărci necunoscute

PAS 3 — 2 query-uri Trendyol (în română, simple, 3-4 cuvinte):

Răspunde DOAR cu JSON valid:
{"emag":["query1","query2","query3","query4"],"trendyol":["query1","query2"]}`;

    const r=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:300,temperature:0.2,messages:[{role:'user',content:prompt}]}),
      signal:ctrl.signal
    });
    clearTimeout(t);
    const data=await r.json();
    const text=data.choices?.[0]?.message?.content||'{}';
    const parsed=JSON.parse(text.replace(/```json|```/g,'').trim());
    if(Array.isArray(parsed.emag)&&parsed.emag.length)return parsed;
    return null;
  }catch(e){clearTimeout(t);return null;}
}

function parseEmagJsonCandidates(data){
  const items=(data?.data?.items||data?.items||[]).slice(0,30);
  return uniqCandidates(items.map(i=>{
    const price=i.prices?.sale_price||i.price||i.lowest_price||i.prices?.price||'';
    const img=i.image||i.image_url||i.thumbnail||i.photo||i.images?.[0]?.url||i.images?.[0]||'';
    return{title:i.name||i.title||i.product_name,price,img,link:i.url||i.link,source:'emag-json'};
  }));
}

function parseEmagHtmlCandidates(html){
  const items=[];

  // Metodă 1: data-product JSON pe carduri
  const cardMatches=[...html.matchAll(/data-product="([^"]+)"/gi)];
  for(const m of cardMatches){
    try{
      const prod=JSON.parse(decode(m[1]));
      if(prod.prices?.sale_price||prod.price){
        items.push({
          title:prod.product_name||prod.name||'',
          price:prod.prices?.sale_price||prod.price||'',
          img:prod.image||prod.image_url||prod.thumbnail||'',
          link:prod.url||prod.page_url||'',
          source:'emag-data'
        });
      }
    }catch(e){}
  }
  if(items.length>=3)return uniqCandidates(items);

  // Metodă 2: JSON în __NEXT_DATA__ sau variabile JS
  const nextData=html.match(/"products"\s*:\s*(\[[\s\S]{0,20000}?\])/);
  if(nextData){
    try{
      const prods=JSON.parse(nextData[1]);
      for(const p of prods.slice(0,20)){
        items.push({title:p.name||p.title||'',price:p.prices?.sale_price||p.price||'',img:p.image||'',link:p.url||'',source:'emag-next'});
      }
      if(items.length)return uniqCandidates(items);
    }catch(e){}
  }

  // Metodă 3: HTML clasic cu carduri
  const separators=[
    /<div[^>]+class="[^"]*card-v2[^"]*"[^>]*>/gi,
    /<div[^>]+class="[^"]*product-card[^"]*"[^>]*>/gi,
    /<article[^>]+class="[^"]*product[^"]*"[^>]*>/gi
  ];
  for(const sep of separators){
    const parts=html.split(sep).slice(1,25);
    if(!parts.length)continue;
    for(const part of parts){
      const block=part.split(/<div[^>]+class="[^"]*(?:card-v2|product-card)[^"]*"/i)[0];
      const a=(block.match(/<a[^>]*class="[^"]*js-product-url[^"]*"[^>]*>/i)||block.match(/<a[^>]*href="([^"]*\/pd\/[^"]+)"[^>]*>/i)||[])[0]||'';
      const href=(a.match(/\shref="([^"]+)"/i)||[])[1]||'';
      const aria=(a.match(/\saria-label="([^"]+)"/i)||[])[1]||'';
      const img=(block.match(/<img[^>]+src="(https?:[^"]+)"/i)||[])[1]||'';
      const priceHtml=(block.match(/<p[^>]+class="[^"]*product-new-price[^"]*"[^>]*>([\s\S]*?)<\/p>/i)||[])[1]||'';
      const price=priceHtml?parseEmagPriceHtml(priceHtml):null;
      const titleTag=(block.match(/<(?:h2|h3)[^>]*class="[^"]*product(?:-card)?-title[^"]*"[^>]*>([\s\S]*?)<\/(?:h2|h3)>/i)||[])[1]||'';
      const title=titleTag?stripTags(titleTag):aria;
      if(title&&price)items.push({title,price,img:absUrl(img,'https://www.emag.ro'),link:absUrl(href,'https://www.emag.ro'),source:'emag-html'});
    }
    if(items.length>=3)break;
  }
  return uniqCandidates(items);
}

async function fetchEmagCandidates(query){
  const url=`https://www.emag.ro/search/${encodeURIComponent(query)}`;
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),7000);
  try{
    // Încearcă mai întâi JSON API
    const rj=await fetch(`https://www.emag.ro/search/${encodeURIComponent(query)}/p1/json`,
      {headers:{...HDRS,'Accept':'application/json'},signal:ctrl.signal}).catch(()=>null);
    if(rj?.ok){
      const data=await rj.json().catch(()=>null);
      if(data){
        const cands=parseEmagJsonCandidates(data);
        const totalCount=data?.data?.count||data?.count||data?.total||0;
        if(cands.length){clearTimeout(t);return{candidates:cands,blocked:false,status:200,totalCount};}
      }
    }
    // Fallback HTML
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    const html=await r.text();
    // Detectare blocare: status greșit SAU lipsă completă de carduri de produs
    const blocked=r.status===403||r.status===429||r.status===511
      ||/captcha|awswaf|cf-browser-verification|robot|verificare.*securitate/i.test(html)
      ||(!html.includes('product-title')&&!html.includes('card-v2')&&!html.includes('data-product')&&html.length>10000);
    if(!r.ok||blocked)return{candidates:[],blocked:true,status:r.status};
    // Extrage totalCount din HTML
    const tcM=html.match(/"count"\s*:\s*(\d+)/)||html.match(/(\d+)\s*(?:produse|rezultate)\s*găsite/i)||html.match(/data-total-count="(\d+)"/i);
    const totalCount=tcM?parseInt(tcM[1]):0;
    return{candidates:parseEmagHtmlCandidates(html),blocked:false,status:r.status,totalCount};
  }catch(e){
    clearTimeout(t);
    return{candidates:[],blocked:true,status:0,error:e.message};
  }
}

// Extrage prețul dintr-o pagină de produs eMAG individuală (/pd/ URL)
// Paginile de produs sunt mult mai puțin blocate decât search-ul
async function fetchEmagProductPage(url){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return null;
    const html=(await r.text()).slice(0,800000);

    let title='',price=null,img='';

    // Strategie 1: data-product JSON (cel mai fiabil)
    const dp=html.match(/data-product="([^"]+)"/i);
    if(dp){
      try{
        const p=JSON.parse(decode(dp[1]));
        title=p.product_name||p.name||'';
        price=parsePrice(p.prices?.sale_price||p.price||'');
        img=p.image||'';
      }catch(e){}
    }

    // Strategie 2: JSON-LD Product
    if(!title||!price){
      const ldMatch=html.match(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)||[];
      for(const m of ldMatch){
        try{
          const data=JSON.parse(m.replace(/<script[^>]*>|<\/script>/gi,'').trim());
          const prod=data['@type']==='Product'?data:(data['@graph']||[]).find(x=>x['@type']==='Product');
          if(prod){
            if(!title)title=prod.name||'';
            if(!price){const of=Array.isArray(prod.offers)?prod.offers[0]:prod.offers||{};price=parsePrice(of.price||'');}
            if(!img){const im=Array.isArray(prod.image)?prod.image[0]:prod.image;if(im)img=im;}
            if(title&&price)break;
          }
        }catch(e){}
      }
    }

    // Strategie 3: selectors HTML
    if(!title){
      const h1=html.match(/<h1[^>]*class="[^"]*page-header[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
      title=h1?stripTags(h1[1]):'';
    }
    if(!price){
      const ph=html.match(/<p[^>]*class="[^"]*product-new-price[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
      if(ph)price=parseEmagPriceHtml(ph[1]);
    }
    if(!price){
      // Caută prețul în JSON-uri embed
      const priceJson=html.match(/"sale_price"\s*:\s*"?(\d[\d.,]+)"?/i)||html.match(/"current_price"\s*:\s*"?(\d[\d.,]+)"?/i);
      if(priceJson)price=parsePrice(priceJson[1]);
    }
    if(!img){
      img=(html.match(/<img[^>]+class="[^"]*product-gallery-image[^"]*"[^>]+src="([^"]+)"/i)||[])[1]||'';
    }

    if(title&&price)return{title:stripTags(title),price,img:absUrl(img,url),link:url,source:'emag-page'};
    return null;
  }catch(e){clearTimeout(t);return null;}
}

// DuckDuckGo site:emag.ro — găsim URL-uri de produse reale
// Paginile individuale (/pd/) vor fi apoi fetch-uite pentru prețuri
async function searchDDGEmag(query){
  const ddgUrl=`https://html.duckduckgo.com/html/?q=${encodeURIComponent('site:emag.ro '+query)}&kl=wt-wt`;
  const html=await fetchText(ddgUrl,8000);
  if(!html||html.length<300)return null;

  const results=[];
  const seen=new Set();

  // Parsăm blocurile de rezultate
  const blocks=html.split(/<div[^>]+class="[^"]*result(?:s_links)?[^"]*"[^>]*>/i).slice(1,10);
  for(const block of blocks){
    // URL real din result__url (nu redirect DDG)
    const urlM=block.match(/class="result__url"\s[^>]*href="(https?:\/\/(?:www\.)?emag\.ro\/[^"#?]+)"/i)
      ||block.match(/href="(https?:\/\/(?:www\.)?emag\.ro\/[^"#?]{10,})"/i);
    if(!urlM)continue;
    const link=urlM[1].split('?')[0];
    // Preferăm paginile de produs (/pd/) față de search/categorie
    const isPd=link.includes('/pd/');
    if(seen.has(link))continue;
    seen.add(link);

    const titleM=block.match(/class="result__a"[^>]*>([\s\S]*?)<\/a>/i);
    const title=titleM?stripTags(titleM[1]).trim():'';

    const snipM=block.match(/class="result__snippet"[^>]*>([\s\S]{0,400}?)<\/a>/i);
    const snippet=snipM?stripTags(snipM[1]):'';

    // Extrage prețul din snippet dacă există
    const priceM=snippet.match(/(\d{1,4}(?:\.\d{3})?)[,.](\d{2})\s*(?:RON|Lei|lei)/i)
      ||snippet.match(/(\d{2,5})\s*(?:RON|Lei)/i);
    let price=null;
    if(priceM&&priceM[2])price=parseFloat(priceM[1].replace(/\./g,'')+'.'+priceM[2]);
    else if(priceM)price=parseFloat(priceM[1]);
    if(price&&(price<5||price>99999))price=null;

    results.push({title:title||link,link,price,isPd,source:'ddg-emag'});
    if(results.length>=6)break;
  }

  // Fallback — orice href emag.ro
  if(!results.length){
    for(const m of html.matchAll(/href="(https?:\/\/(?:www\.)?emag\.ro\/[^"?#]{15,})"[^>]*>([^<]{5,80})<\/a>/gi)){
      const link=m[1].split('?')[0];
      const title=stripTags(m[2]).trim();
      if(!link.includes('/search/')&&!link.includes('/c/')&&title&&!seen.has(link)){
        seen.add(link);
        results.push({title,link,price:null,isPd:link.includes('/pd/'),source:'ddg-emag'});
        if(results.length>=3)break;
      }
    }
  }

  return results.length?results:null;
}

async function scrapeEmag(queries,ean){
  const searchLink=`https://www.emag.ro/search/${encodeURIComponent(queries[0]||'')}`;

  // EAN valid → cel mai precis, îl încercăm primul
  if(ean&&/^\d{8,14}$/.test(ean)){
    const er=await fetchEmagCandidates(ean);
    if(!er.blocked&&er.candidates.length){
      const prices=er.candidates.map(c=>c.price).filter(v=>v>0);
      const minPrice=prices.length?Math.min(...prices):null;
      const top=er.candidates.find(c=>c.price===minPrice)||er.candidates[0];
      return{minPrice,offerCount:er.candidates.length,totalCount:er.totalCount||0,link:top?.link||searchLink,candidates:er.candidates,query:ean,usedEan:true};
    }
  }

  for(const q of queries){
    const er=await fetchEmagCandidates(q);
    const candidates=er.candidates||[];

    if(er.blocked){
      // eMAG blochează search-ul din Vercel
      // Strategie: DDG găsește URL-urile de produs → fetch pagini individuale pentru prețuri
      const ddgResults=await searchDDGEmag(q);
      if(ddgResults&&ddgResults.length){
        const bestLink=ddgResults[0].link||searchLink;

        // Fetch paginile individuale de produs (/pd/) în paralel
        // Paginile de produs sunt mai puțin agresiv blocate decât search
        const pdUrls=ddgResults.filter(r=>r.isPd).slice(0,3);
        const fetched=pdUrls.length
          ?await Promise.all(pdUrls.map(r=>fetchEmagProductPage(r.link).catch(()=>null)))
          :[];
        const fetchedValid=fetched.filter(p=>p&&p.price>0);

        // Combină: pagini fetch-uite (mai fiabile) + prețuri din snippets DDG
        const allResults=[
          ...fetchedValid,
          ...ddgResults.filter(r=>r.price>0)
        ];
        const cands=uniqCandidates(allResults);

        const prices=cands.map(c=>c.price).filter(v=>v>0);
        const minPrice=prices.length?Math.min(...prices):null;

        return{
          minPrice,
          offerCount:Math.max(cands.length,ddgResults.length),
          link:cands[0]?.link||bestLink,
          candidates:cands,
          ddgLinks:ddgResults.map(r=>({title:r.title,link:r.link,price:r.price,isPd:r.isPd})),
          query:q,
          blocked:!cands.length&&!minPrice,
          viaDDG:true,
          status:er.status
        };
      }
      return{minPrice:null,offerCount:0,link:`https://www.emag.ro/search/${encodeURIComponent(q)}`,candidates:[],query:q,blocked:true,status:er.status};
    }

    if(candidates.length){
      const prices=candidates.map(c=>c.price).filter(v=>v>0);
      const minPrice=prices.length?Math.min(...prices):null;
      const top=candidates.find(c=>c.price===minPrice)||candidates[0];
      return{minPrice,offerCount:candidates.length,totalCount:er.totalCount||0,link:top?.link||searchLink,candidates,query:q};
    }
  }
  return{minPrice:null,offerCount:0,link:searchLink,candidates:[],query:queries[0]||''};
}

// Extrage produs dintr-un link direct lipid de utilizator
async function fetchDirectProduct(url){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return null;
    const html=await r.text();

    if(url.includes('emag.ro')){
      const result=await fetchEmagProductPage(url);
      if(result)return{...result,source:'direct'};
    }
    return null;
  }catch(e){clearTimeout(t);return null;}
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});

  if(req.body?.directUrl){
    const prod=await fetchDirectProduct(req.body.directUrl);
    if(prod)return res.json({direct:prod});
    return res.status(404).json({error:'Nu s-a putut extrage prețul din linkul direct'});
  }

  const {query,rawQuery,platform:targetPlatform,description,slug,ean,characteristics}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});

  const apiKey=process.env.OPENAI_API_KEY;
  const chars=Array.isArray(characteristics)?characteristics:[];

  // rawQuery = retry manual cu query specific, fără regenerare AI
  let emagQueries,trendyolQueries;
  if(rawQuery&&typeof rawQuery==='string'&&rawQuery.length>1){
    emagQueries=[rawQuery];
    trendyolQueries=[rawQuery];
  } else {
    // Generare query-uri AI cu context complet
    const aiQueries=await generateAIQueries(query,description||'',chars,ean||'',apiKey);
    emagQueries=aiQueries?.emag?.length
      ?aiQueries.emag
      :[query,...(()=>{
          const kw=query.replace(/\b[Oo]?\d+[xX×]\d+[^,]*/gi,'').replace(/[^\p{L}\p{N}\s]/giu,' ').split(/\s+/).filter(w=>w.length>2).slice(0,5);
          return[kw.slice(0,4).join(' '),kw.slice(0,3).join(' ')];
        })()].filter((q,i,a)=>q.length>2&&a.indexOf(q)===i);
    trendyolQueries=aiQueries?.trendyol||[query.split(' ').slice(0,3).join(' ')];
  }

  // Trendyol: blocat complet — returnăm query-urile AI pentru link-ul manual
  const trendyolFallbackUrl=`https://www.trendyol.com/sr?q=${encodeURIComponent(trendyolQueries[0])}&culture=ro-RO&currency=RON`;
  const trendyol={minPrice:null,offerCount:0,link:trendyolFallbackUrl,candidates:[],query:trendyolQueries[0],blocked:true,queries:trendyolQueries};

  const emag=await scrapeEmag(emagQueries,ean||'');

  res.json({emag,trendyol,queriesUsed:emagQueries.slice(0,4),aiQueriesGenerated:!rawQuery});
};
