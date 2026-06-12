const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HDRS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'ro-RO,ro;q=0.9,en;q=0.8'};

function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}

const STOP=new Set('de cu si și pentru în in din la pe că ca un o cel cea ale al a the a an of for with and or'.split(' '));

function keywords(text,maxWords=5){
  return (text||'')
    .replace(/\b[Oo]?\d+[xX×]\d+([xX×]\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v)?\b/gi,'')
    .replace(/\b\d+(\.\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v|buc|pcs|set|inch)\b/gi,'')
    .replace(/[^\w\sșțăîâ-]/gi,' ')
    .split(/\s+/)
    .filter(w=>w.length>2&&!STOP.has(w.toLowerCase()))
    .slice(0,maxWords);
}

// Construiește mai multe variante de query din name + description + slug
function buildQueries(name,description,slug){
  const nameKw=keywords(name,5);
  const descKw=keywords(description,3).filter(w=>!nameKw.map(k=>k.toLowerCase()).includes(w.toLowerCase()));
  const slugKw=keywords((slug||'').replace(/-/g,' '),5);

  const q1=nameKw.slice(0,5).join(' ');                           // primele 5 cuvinte din nume
  const q2=nameKw.slice(0,4).join(' ');                           // primele 4 cuvinte din nume
  const q3=[...nameKw.slice(0,3),...descKw.slice(0,2)].join(' ');// 3 din nume + 2 din descriere
  const q4=slugKw.slice(0,5).join(' ');                           // din slug URL (adesea cel mai curat)
  const q5=nameKw.slice(0,3).join(' ');                           // primele 3 cuvinte

  return [...new Set([q1,q4,q2,q3,q5].filter(q=>q.length>3))];
}

async function fetchText(url,ms=6000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),ms);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return '';
    return (await r.text()).slice(0,1500000);
  }catch(e){clearTimeout(t);return '';}
}

async function tryEmagPrices(query){
  // JSON API
  try{
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),4000);
    const rj=await fetch(`https://www.emag.ro/search/${encodeURIComponent(query)}/p1/json`,
      {headers:{...HDRS,'Accept':'application/json'},signal:ctrl.signal}).catch(()=>null);
    clearTimeout(t);
    if(rj?.ok){
      const data=await rj.json().catch(()=>null);
      const items=(data?.data?.items||data?.items||[]).slice(0,20);
      const prices=items.map(i=>parsePrice(i.prices?.sale_price||i.price||i.lowest_price||'')).filter(v=>v>0);
      if(prices.length){
        const minPrice=Math.min(...prices);
        const top=items.find(i=>parsePrice(i.prices?.sale_price||i.price||'')===minPrice)||items[0];
        return{minPrice,offerCount:prices.length,topLink:top?.url||null};
      }
    }
  }catch(e){}
  // HTML scraping
  const html=await fetchText(`https://www.emag.ro/search/${encodeURIComponent(query)}`,5000);
  if(!html)return null;
  const dp=[...html.matchAll(/data-price="([0-9]+(?:\.[0-9]+)?)"/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
  if(dp.length)return{minPrice:Math.min(...dp),offerCount:dp.length,topLink:null};
  const lei=[...html.matchAll(/"(\d{1,5}),(\d{2})\s*(?:Lei|RON)"/gi)].map(m=>parseFloat(m[1]+'.'+m[2])).filter(v=>v>0);
  if(lei.length)return{minPrice:Math.min(...lei),offerCount:lei.length,topLink:null};
  return null;
}

async function scrapeEmag(queries){
  for(const q of queries){
    const r=await tryEmagPrices(q);
    if(r) return{minPrice:r.minPrice,offerCount:r.offerCount,
      link:r.topLink||`https://www.emag.ro/search/${encodeURIComponent(q)}`};
  }
  return{minPrice:null,offerCount:0,link:`https://www.emag.ro/search/${encodeURIComponent(queries[0])}`};
}

async function scrapeTrendyol(queries){
  for(const q of queries.slice(0,2)){
    const url=`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&culture=ro-RO&currency=RON`;
    const html=await fetchText(url,5000);
    if(!html)continue;
    try{
      const nd=html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if(nd){
        const products=JSON.parse(nd[1])?.props?.pageProps?.products||[];
        const prices=products.map(p=>parsePrice(p.price?.sellingPrice||p.priceInfo?.price||p.price||'')).filter(v=>v>0);
        if(prices.length)return{minPrice:Math.min(...prices),offerCount:prices.length,link:url};
      }
    }catch(e){}
    const pm=[...html.matchAll(/["']sellingPrice["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
    if(pm.length)return{minPrice:Math.min(...pm),offerCount:pm.length,link:url};
  }
  const fallbackUrl=`https://www.trendyol.com/sr?q=${encodeURIComponent(queries[0])}&culture=ro-RO&currency=RON`;
  return{minPrice:null,offerCount:0,link:fallbackUrl};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  const {query,description,slug}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});
  const queries=buildQueries(query,description||'',slug||'');
  const [emag,trendyol]=await Promise.all([scrapeEmag(queries),scrapeTrendyol(queries)]);
  res.json({emag,trendyol,queriesUsed:queries.slice(0,3)});
};
