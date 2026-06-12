const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HDRS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'ro-RO,ro;q=0.9,en;q=0.8'};

function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}

// Scoate dimensiuni, unități, cuvinte de legătură și trunchiază la maxWords cuvinte cheie
function shortenQuery(name,maxWords=5){
  return name
    .replace(/\b[Oo]?\d+[xX×]\d+([xX×]\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v)?\b/gi,'') // dimensiuni
    .replace(/\b\d+(\.\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v|buc|pcs|set)\b/gi,'')        // unități
    .replace(/\b(de|cu|si|și|pentru|în|in|din|la|pe|că|ca|un|o|cel|cea|ale|al|a)\b/gi,'')
    .replace(/\s+/g,' ').trim()
    .split(' ').filter(Boolean).slice(0,maxWords).join(' ');
}

async function fetchText(url,timeoutMs=7000){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),timeoutMs);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return '';
    return (await r.text()).slice(0,1500000);
  }catch(e){clearTimeout(t);return '';}
}

async function scrapeEmag(query){
  // Încearcă cu query scurt mai întâi, apoi cu tot numele
  const queries=[shortenQuery(query,5),shortenQuery(query,4),query].filter((v,i,a)=>v&&a.indexOf(v)===i);
  for(const q of queries){
    const result=await scrapeEmagQuery(q);
    if(result)return result;
  }
  return null;
}

async function scrapeEmagQuery(query){
  // Încearcă endpoint-ul JSON al eMAG
  try{
    const slug=query.toLowerCase().replace(/[^a-z0-9\s-]/g,'').replace(/\s+/g,'-');
    const jsonUrl=`https://www.emag.ro/search/${encodeURIComponent(query)}/p1/json`;
    const ctrl=new AbortController();
    const t=setTimeout(()=>ctrl.abort(),5000);
    const rj=await fetch(jsonUrl,{headers:{...HDRS,'Accept':'application/json'},signal:ctrl.signal}).catch(()=>null);
    clearTimeout(t);
    if(rj&&rj.ok){
      const data=await rj.json().catch(()=>null);
      const items=(data?.data?.items||data?.items||[]).slice(0,20);
      if(items.length){
        const prices=items.map(i=>parsePrice(i.prices?.sale_price||i.price||i.lowest_price||'')).filter(v=>v>0);
        if(prices.length){
          const minPrice=Math.min(...prices);
          const top=items.find(i=>{const p=parsePrice(i.prices?.sale_price||i.price||'');return p===minPrice;})||items[0];
          return{minPrice,offerCount:prices.length,link:top?.url||`https://www.emag.ro/search/${encodeURIComponent(query)}`};
        }
      }
    }
  }catch(e){}

  // Fallback: scraping HTML
  const url=`https://www.emag.ro/search/${encodeURIComponent(query)}`;
  const html=await fetchText(url,6000);
  if(!html)return null;

  // Încearcă să extragă din JSON inline (window.__INITIAL_STATE__ sau data-product)
  const jsonMatch=html.match(/window\.__INITIAL_STATE__\s*=\s*(\{[\s\S]*?\});\s*<\/script>/);
  if(jsonMatch){
    try{
      const state=JSON.parse(jsonMatch[1]);
      const items=state?.listing?.products||state?.products||[];
      const prices=items.slice(0,20).map(i=>parsePrice(i.price?.sale||i.price||'')).filter(v=>v>0);
      if(prices.length){
        const minPrice=Math.min(...prices);
        return{minPrice,offerCount:prices.length,link:url};
      }
    }catch(e){}
  }

  const priceMatches=[...html.matchAll(/data-price="([0-9]+(?:\.[0-9]+)?)"/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
  if(priceMatches.length){
    const minPrice=Math.min(...priceMatches);
    return{minPrice,offerCount:priceMatches.length,link:url};
  }
  // Caută și format "199,99 Lei"
  const leMatches=[...html.matchAll(/"(\d{1,5}),(\d{2})\s*(?:Lei|RON)"/gi)].map(m=>parseFloat(m[1]+'.'+m[2])).filter(v=>v>0);
  if(leMatches.length){
    const minPrice=Math.min(...leMatches);
    return{minPrice,offerCount:leMatches.length,link:url};
  }
  return null;
}

async function scrapeTrendyol(query){
  const q=shortenQuery(query,5);
  const url=`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&culture=ro-RO&currency=RON`;
  const html=await fetchText(url,6000);
  if(!html)return null;

  const nextDataMatch=html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
  if(nextDataMatch){
    try{
      const nd=JSON.parse(nextDataMatch[1]);
      const products=nd?.props?.pageProps?.products||nd?.props?.pageProps?.searchResult?.products||[];
      const prices=products.map(p=>parsePrice(p.price?.sellingPrice||p.priceInfo?.price||p.price||'')).filter(v=>v>0);
      if(prices.length){
        const minPrice=Math.min(...prices);
        return{minPrice,offerCount:prices.length,link:url};
      }
    }catch(e){}
  }
  const priceMatches=[...html.matchAll(/["']sellingPrice["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
  if(priceMatches.length){
    const minPrice=Math.min(...priceMatches);
    return{minPrice,offerCount:priceMatches.length,link:url};
  }
  return null;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  const {query,ean}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});
  const [emag,trendyol]=await Promise.all([scrapeEmag(query),scrapeTrendyol(query)]);
  res.json({emag,trendyol,queryUsed:shortenQuery(query,5)});
};
