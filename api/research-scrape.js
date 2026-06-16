const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const HDRS={'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.8','Accept-Language':'ro-RO,ro;q=0.9,en;q=0.8'};

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

const STOP=new Set('de cu si și pentru în in din la pe că ca un o cel cea ale al a the a an of for with and or'.split(' '));

function keywords(text,maxWords=5){
  return (text||'')
    .replace(/\b[Oo]?\d+[xX×]\d+([xX×]\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v)?\b/gi,'')
    .replace(/\b\d+(\.\d+)?\s*(cm|mm|m|l|ml|kg|g|w|v|buc|pcs|set|inch)\b/gi,'')
    .replace(/[^\p{L}\p{N}\s-]/giu,' ')
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

function parseEmagJsonCandidates(data){
  const items=(data?.data?.items||data?.items||[]).slice(0,30);
  return uniqCandidates(items.map(i=>{
    const price=i.prices?.sale_price||i.price||i.lowest_price||i.prices?.price||'';
    const img=i.image||i.image_url||i.thumbnail||i.photo||i.images?.[0]?.url||i.images?.[0]||'';
    return{title:i.name||i.title||i.product_name,price,img,link:i.url||i.link,source:'emag-json'};
  }));
}

function parseEmagHtmlCandidates(html){
  const parts=html.split(/<div class="card-v2">/i).slice(1,35);
  const items=[];
  for(const part of parts){
    const block='<div class="card-v2">'+part.split(/<div class="card-v2">/i)[0];
    const prodRaw=(block.match(/data-product="([^"]+)"/i)||[])[1]||'';
    let prod={};
    if(prodRaw){
      try{prod=JSON.parse(decode(prodRaw));}catch(e){}
    }
    const a=(block.match(/<a[^>]*class="[^"]*js-product-url[^"]*"[^>]*>/i)||block.match(/<a[^>]*js-product-url[^>]*>/i)||[])[0]||'';
    const href=(a.match(/\shref="([^"]+)"/i)||[])[1]||'';
    const aria=(a.match(/\saria-label="([^"]+)"/i)||[])[1]||'';
    const img=(block.match(/<img[^>]+src="([^"]+)"/i)||[])[1]||'';
    const priceHtml=(block.match(/<p class="product-new-price"[^>]*>([\s\S]*?)<\/p>/i)||[])[1]||'';
    const price=priceHtml
      ?parseEmagPriceHtml(priceHtml)
      :parsePrice((block.match(/(\d{1,5})<sup><small[^>]*>[^<]*<\/small>(\d{2})<\/sup>\s*<span>Lei<\/span>/i)||[]).slice(1).join(','));
    items.push({
      title:prod.product_name||aria,
      price,
      img:absUrl(img,'https://www.emag.ro'),
      link:absUrl(href,'https://www.emag.ro'),
      source:'emag-html'
    });
  }
  return uniqCandidates(items);
}

async function fetchEmagCandidates(query){
  const url=`https://www.emag.ro/search/${encodeURIComponent(query)}`;
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    const html=await r.text();
    const blocked=r.status===403||r.status===429||r.status===511||/eMAG Captcha|captcha-sdk|awswaf/i.test(html);
    if(!r.ok||blocked)return{candidates:[],blocked,status:r.status};
    return{candidates:parseEmagHtmlCandidates(html),blocked:false,status:r.status};
  }catch(e){
    clearTimeout(t);
    return{candidates:[],blocked:true,status:0,error:e.message};
  }
}

async function scrapeEmag(queries){
  const searchLink=`https://www.emag.ro/search/${encodeURIComponent(queries[0]||'')}`;
  for(const q of queries){
    const er=await fetchEmagCandidates(q);
    const candidates=er.candidates||[];
    if(er.blocked)return{minPrice:null,offerCount:0,link:`https://www.emag.ro/search/${encodeURIComponent(q)}`,candidates:[],query:q,blocked:true,status:er.status};
    if(candidates.length){
      const prices=candidates.map(c=>c.price).filter(v=>v>0);
      const minPrice=prices.length?Math.min(...prices):null;
      const top=candidates.find(c=>c.price===minPrice)||candidates[0];
      return{minPrice,offerCount:candidates.length,link:top?.link||searchLink,candidates,query:q};
    }
  }
  for(const q of queries){
    const r=await tryEmagPrices(q);
    if(r) return{minPrice:r.minPrice,offerCount:r.offerCount,
      link:r.topLink||`https://www.emag.ro/search/${encodeURIComponent(q)}`,candidates:[],query:q};
  }
  return{minPrice:null,offerCount:0,link:searchLink,candidates:[],query:queries[0]||''};
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
        const candidates=uniqCandidates(products.slice(0,30).map(p=>({
          title:p.name||p.title||p.productName,
          price:p.price?.sellingPrice||p.priceInfo?.price||p.price,
          img:absUrl(p.image||p.imageUrl||p.images?.[0],url),
          link:absUrl(p.url||p.link,url),
          source:'trendyol-next'
        })));
        if(candidates.length){
          const prices=candidates.map(c=>c.price).filter(v=>v>0);
          const minPrice=prices.length?Math.min(...prices):null;
          return{minPrice,offerCount:candidates.length,link:url,candidates,query:q};
        }
      }
    }catch(e){}
    const pm=[...html.matchAll(/["']sellingPrice["']\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)].map(m=>parseFloat(m[1])).filter(v=>v>0);
    if(pm.length)return{minPrice:Math.min(...pm),offerCount:pm.length,link:url,candidates:[],query:q};
  }
  const fallbackUrl=`https://www.trendyol.com/sr?q=${encodeURIComponent(queries[0])}&culture=ro-RO&currency=RON`;
  return{minPrice:null,offerCount:0,link:fallbackUrl,candidates:[],query:queries[0]||'',blocked:true};
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  const {query,description,slug}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});
  const queries=buildQueries(query,description||'',slug||'');
  const [emag,trendyol]=await Promise.all([scrapeEmag(queries),scrapeTrendyol(queries)]);
  res.json({emag,trendyol,queriesUsed:queries.slice(0,3)});
};
