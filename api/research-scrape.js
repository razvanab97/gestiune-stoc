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

// AI generează query-uri optimizate pentru eMAG (română) separat de Trendyol
async function generateAIQueries(name,description,img,apiKey){
  if(!apiKey)return null;
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),8000);
  try{
    const prompt=`Ești un expert în marketplace-uri românești. Primești un produs de la un furnizor european și trebuie să generezi termeni de căutare optimizați pentru a-l găsi pe eMAG.ro.

Produs: "${name}"
Descriere: "${(description||'').slice(0,200)}"

Generează:
- 4 variante de căutare pentru eMAG.ro (în română, cu diacritice, cum ar căuta un cumpărător român; termeni specifici categoriei, fără dimensiuni exacte în primul query)
- 2 variante de căutare pentru Trendyol.com (mai scurte, pot fi în engleză sau română, max 4 cuvinte fiecare)

Răspunde DOAR cu JSON:
{"emag":["query1","query2","query3","query4"],"trendyol":["query1","query2"]}`;

    const r=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+apiKey},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:200,temperature:0.3,messages:[{role:'user',content:prompt}]}),
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

  // Metodă 3: HTML clasic cu carduri (multiple variante de selector)
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
        if(cands.length){clearTimeout(t);return{candidates:cands,blocked:false,status:200};}
      }
    }
    // Fallback HTML
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    const html=await r.text();
    const blocked=r.status===403||r.status===429||r.status===511||/captcha|awswaf|cf-browser-verification/i.test(html);
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
  return{minPrice:null,offerCount:0,link:searchLink,candidates:[],query:queries[0]||''};
}

// Extrage produs dintr-un link direct (folosit când utilizatorul lipește link manual)
async function fetchDirectProduct(url){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(url,{headers:HDRS,signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return null;
    const html=await r.text();

    // eMAG product page
    if(url.includes('emag.ro')){
      const dataProduct=html.match(/data-product="([^"]+)"/i);
      let title='',price=null,img='';
      if(dataProduct){
        try{const p=JSON.parse(decode(dataProduct[1]));title=p.product_name||p.name||'';price=parsePrice(p.prices?.sale_price||p.price||'');img=p.image||'';}catch(e){}
      }
      if(!title){
        const h1=html.match(/<h1[^>]*class="[^"]*page-header[^"]*"[^>]*>([\s\S]*?)<\/h1>/i);
        title=h1?stripTags(h1[1]):'';
      }
      if(!price){
        const ph=html.match(/<p[^>]*class="[^"]*product-new-price[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
        price=ph?parseEmagPriceHtml(ph[1]):null;
      }
      if(!img){img=(html.match(/<img[^>]+class="[^"]*product-gallery-image[^"]*"[^>]+src="([^"]+)"/i)||[])[1]||'';}
      if(title&&price)return{title,price,img:absUrl(img,url),link:url,source:'direct'};
    }
    return null;
  }catch(e){clearTimeout(t);return null;}
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});

  // Suport pentru apel cu link direct (utilizatorul lipește link eMAG)
  if(req.body?.directUrl){
    const prod=await fetchDirectProduct(req.body.directUrl);
    if(prod)return res.json({direct:prod});
    return res.status(404).json({error:'Nu s-a putut extrage prețul din linkul direct'});
  }

  const {query,description,slug}=req.body||{};
  if(!query||typeof query!=='string')return res.status(400).json({error:'Query lipsă'});

  const apiKey=process.env.OPENAI_API_KEY;

  // Generare query-uri AI (mereu, pentru eMAG și Trendyol separat)
  const aiQueries=await generateAIQueries(query,description||'',null,apiKey);

  const emagQueries=aiQueries?.emag?.length
    ?aiQueries.emag
    :[query,...(()=>{
        const kw=query.replace(/\b[Oo]?\d+[xX×]\d+[^,]*/gi,'').replace(/[^\p{L}\p{N}\s]/giu,' ').split(/\s+/).filter(w=>w.length>2).slice(0,5);
        return[kw.slice(0,4).join(' '),kw.slice(0,3).join(' ')];
      })()].filter((q,i,a)=>q.length>2&&a.indexOf(q)===i);

  // Trendyol: blocat server-side — returnăm imediat cu query-urile AI pentru UI
  const trendyolQueries=aiQueries?.trendyol||[query.split(' ').slice(0,3).join(' ')];
  const trendyolFallbackUrl=`https://www.trendyol.com/sr?q=${encodeURIComponent(trendyolQueries[0])}&culture=ro-RO&currency=RON`;
  const trendyol={minPrice:null,offerCount:0,link:trendyolFallbackUrl,candidates:[],query:trendyolQueries[0],blocked:true,queries:trendyolQueries};

  const emag=await scrapeEmag(emagQueries);

  res.json({emag,trendyol,queriesUsed:emagQueries.slice(0,3),aiQueriesGenerated:!!aiQueries});
};
