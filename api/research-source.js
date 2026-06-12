const MAX_HTML=2*1024*1024;

const FETCH_HEADERS={
  'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language':'ro-RO,ro;q=0.9,en;q=0.8',
  'sec-fetch-dest':'document',
  'sec-fetch-mode':'navigate',
  'sec-fetch-site':'none',
  'sec-fetch-user':'?1',
  'upgrade-insecure-requests':'1'
};

function decode(s=''){return String(s).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function metaTag(html,key){
  const safe=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pats=[
    new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']'+safe+'["\'][^>]+content=["\']([^"\']+)["\']','i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\']'+safe+'["\']','i')
  ];
  for(const p of pats){const m=html.match(p);if(m)return decode(m[1]);}
  return '';
}
function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}
function findJsonLd(html){
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const find=o=>{
        if(!o||typeof o!=='object')return null;
        if(Array.isArray(o)){for(const x of o){const r=find(x);if(r)return r;}return null;}
        if(o['@type']==='Product'||(Array.isArray(o['@type'])&&o['@type'].includes('Product')))return o;
        if(o['@graph'])return find(o['@graph']);
        return null;
      };
      const p=find(JSON.parse(m[1]));if(p)return p;
    }catch(e){}
  }
  return null;
}
function extractFromHtml(html,url){
  const product=findJsonLd(html);
  const offer=Array.isArray(product?.offers)?product.offers[0]:product?.offers||{};
  const abs=v=>{try{return new URL(v,url).href;}catch(e){return'';}};
  const imgArr=Array.isArray(product?.image)?product.image[0]:product?.image;
  const priceRaw=offer.price||metaTag(html,'product:price:amount')||metaTag(html,'og:price:amount')||'';
  const currency=offer.priceCurrency||metaTag(html,'product:price:currency')||metaTag(html,'og:price:currency')||'';
  const eanCands=[
    String(product?.gtin13||product?.gtin8||product?.gtin||product?.mpn||offer.gtin13||offer.gtin||''),
    ...[...html.matchAll(/["']ean[13]?["']\s*:\s*["']?(\d{8,14})["']?/gi)].map(m=>m[1])
  ].filter(v=>v&&/^\d{8,14}$/.test(v));
  const jumboSku=(html.match(/Cod\s+Jumbo[:\s]*(\d{4,})/i)||[])[1]||'';
  const name=product?.name||metaTag(html,'og:title')||metaTag(html,'twitter:title')||decode((html.match(/<title>([^<]+)<\/title>/i)||[])[1]||'');
  return{
    name,
    img:abs(imgArr||'')||abs(metaTag(html,'og:image'))||abs(metaTag(html,'twitter:image'))||'',
    price:parsePrice(priceRaw),
    currency:currency.toUpperCase()||'',
    ean:eanCands[0]||jumboSku||''
  };
}

async function fetchHtml(url){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(url,{headers:FETCH_HEADERS,redirect:'follow',signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return '';
    const buf=await r.arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,MAX_HTML)));
  }catch(e){
    clearTimeout(t);
    return '';
  }
}

async function aiExtract(url,htmlSnippet){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),5000);
  try{
    const prompt=`Extrage din URL-ul și textul de mai jos: numele produsului, prețul (număr), moneda (RON/EUR/PLN etc.), EAN/SKU dacă există.\nURL: ${url}\n${htmlSnippet?'Text:\n'+htmlSnippet:''}\nRăspunde DOAR cu JSON: {"name":"...","price":0,"currency":"RON","ean":""}`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:200,messages:[{role:'user',content:prompt}]}),
      signal:ctrl.signal
    });
    clearTimeout(t);
    const data=await r.json();
    const text=data.choices?.[0]?.message?.content||'{}';
    return JSON.parse(text.replace(/```json|```/g,'').trim());
  }catch(e){
    clearTimeout(t);
    return null;
  }
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY lipsă'});
  const {url}=req.body||{};
  if(!url||typeof url!=='string')return res.status(400).json({error:'URL lipsă'});

  // Always return 200 — client decides if data is useful
  const empty={name:'',img:'',price:null,currency:'RON',ean:''};

  const html=await fetchHtml(url);
  const extracted=html?extractFromHtml(html,url):empty;

  if(extracted.name){
    return res.json(extracted);
  }

  // No name from HTML — try AI with URL + partial text
  const snippet=html
    ?html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,3000)
    :'';
  const ai=await aiExtract(url,snippet);
  if(ai&&ai.name){
    return res.json({
      name:ai.name||'',
      img:extracted.img||'',
      price:ai.price>0?ai.price:(extracted.price||null),
      currency:ai.currency||extracted.currency||'RON',
      ean:ai.ean||extracted.ean||''
    });
  }

  return res.json(empty);
};
