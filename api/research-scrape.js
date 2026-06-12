const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HDRS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'ro-RO,ro;q=0.9,en;q=0.8'};

function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}

function shortenQuery(name,maxWords=5){
  return name
    .replace(/\b[Oo]?\d+[xX×]\d+([xX×]\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v)?\b/gi,'')
    .replace(/\b\d+(\.\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v|buc|pcs|set)\b/gi,'')
    .replace(/\b(de|cu|si|și|pentru|în|in|din|la|pe|că|ca|un|o|cel|cea|ale|al|a)\b/gi,'')
    .replace(/\s+/g,' ').trim()
    .split(' ').filter(Boolean).slice(0,maxWords).join(' ');
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
  // 1. JSON API
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
        const top=items.find(i=>{const p=parsePrice(i.prices?.sale_price||i.price||'');return p===minPrice;})||items[0];
        return{minPrice,offerCount:prices.length,topLink:top?.url||null};
      }
    }
  }catch(e){}

  // 2. HTML scraping
  const html=await fetchText(`https://www.emag.ro/search/${encodeURIComponent(query)}`,5000);
  if(!html)return null;
  const dp=[...html.matchAll(/data-price="([0-9]+(?:\.[0-9]+)?)"/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
  if(dp.length)return{minPrice:Math.min(...dp),offerCount:dp.length,topLink:null};
  const lei=[...html.matchAll(/"(\d{1,5}),(\d{2})\s*(?:Lei|RON)"/gi)].map(m=>parseFloat(m[1]+'.'+m[2])).filter(v=>v>0);
  if(lei.length)return{minPrice:Math.min(...lei),offerCount:lei.length,topLink:null};
  return null;
}

async function scrapeEmag(query){
  const searchLink=`https://www.emag.ro/search/${encodeURIComponent(shortenQuery(query,5))}`;
  // Încearcă mai multe variante de query
  const queries=[shortenQuery(query,5),shortenQuery(query,4),query.split(' ').slice(0,3).join(' ')].filter((v,i,a)=>v&&a.indexOf(v)===i);
  for(const q of queries){
    const r=await tryEmagPrices(q);
    if(r){
      return{minPrice:r.minPrice,offerCount:r.offerCount,link:r.topLink||`https://www.emag.ro/search/${encodeURIComponent(q)}`};
    }
  }
  // Chiar dacă nu avem preț, returnăm link-ul de căutare
  return{minPrice:null,offerCount:0,link:searchLink};
}

async function scrapeTrendyol(query){
  const q=shortenQuery(query,5);
  const searchLink=`https://www.trendyol.com/sr?q=${encodeURIComponent(q)}&culture=ro-RO&currency=RON`;
  const html=await fetchText(searchLink,5000);
  if(html){
    try{
      const nd=html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
      if(nd){
        const products=JSON.parse(nd[1])?.props?.pageProps?.products||[];
        const prices=products.map(p=>parsePrice(p.price?.sellingPrice||p.priceInfo?.price||p.price||'')).filter(v=>v>0);
        if(prices.length)return{minPrice:Math.min(...prices),offerCount:prices.length,link:searchLink};
      }
    }catch(e){}
    const pm=[...html.matchAll(/["']sellingPrice["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
    if(pm.length)return{minPrice:Math.min(...pm),offerCount:pm.length,link:searchLink};
  }
  // Returnăm link-ul indiferent
  return{minPrice:null,offerCount:0,link:searchLink};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  const {query}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});
  const [emag,trendyol]=await Promise.all([scrapeEmag(query),scrapeTrendyol(query)]);
  res.json({emag,trendyol,shortQuery:shortenQuery(query,5)});
};
