const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}

async function scrapeEmag(query){
  try{
    const url=`https://www.emag.ro/search/${encodeURIComponent(query)}/p1/json`;
    const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'application/json'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const data=await r.json();
    const items=(data?.data?.items||data?.items||[]).slice(0,20);
    if(!items.length)return null;
    const prices=items.map(i=>parsePrice(i.prices?.sale_price||i.price||i.lowest_price||'')).filter(v=>v&&v>0);
    if(!prices.length)return null;
    const minPrice=Math.min(...prices);
    const topItem=items.find(i=>{const p=parsePrice(i.prices?.sale_price||i.price||'');return p===minPrice;})||items[0];
    const link=topItem?.url||`https://www.emag.ro/search/${encodeURIComponent(query)}`;
    return{minPrice,offerCount:items.length,link};
  }catch(e){
    // fallback: parse HTML search page
    try{
      const url=`https://www.emag.ro/search/${encodeURIComponent(query)}`;
      const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(10000)});
      if(!r.ok)return null;
      const html=await r.text();
      const priceMatches=[...html.matchAll(/data-price="([0-9]+(?:\.[0-9]+)?)"/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
      if(!priceMatches.length)return null;
      const minPrice=Math.min(...priceMatches);
      return{minPrice,offerCount:priceMatches.length,link:url};
    }catch(e2){return null;}
  }
}

async function scrapeTrendyol(query){
  try{
    // Trendyol Romania search
    const url=`https://www.trendyol.com/sr?q=${encodeURIComponent(query)}&culture=ro-RO&currency=RON`;
    const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html','Accept-Language':'ro-RO,ro;q=0.9'},signal:AbortSignal.timeout(10000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const html=await r.text();
    // Extract __NEXT_DATA__ or prices from HTML
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
    // Fallback: regex on page
    const priceMatches=[...html.matchAll(/["']sellingPrice["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
    if(priceMatches.length){
      const minPrice=Math.min(...priceMatches);
      return{minPrice,offerCount:priceMatches.length,link:url};
    }
    return null;
  }catch(e){return null;}
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  const {query}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});

  const [emag,trendyol]=await Promise.all([scrapeEmag(query),scrapeTrendyol(query)]);
  res.json({emag,trendyol});
}
