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
function absUrl(v,base){
  if(!v||!v.trim())return '';
  try{return new URL(v.trim(),base).href;}catch(e){return '';}
}
function cleanSlug(s=''){
  return String(s||'')
    .replace(/\.(html?|php|aspx?)$/i,'')
    .replace(/[_-]\d{4,}$/,'')
    .replace(/[-_]/g,' ')
    .replace(/\s+/g,' ')
    .trim();
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
    }catch(e){
      try{
        const fixed=m[1]
          .replace(/:\s*""([^"]*?)""/g,': "$1"')
          .replace(/,\s*([}\]])/g,'$1');
        const find=o=>{
          if(!o||typeof o!=='object')return null;
          if(Array.isArray(o)){for(const x of o){const r=find(x);if(r)return r;}return null;}
          if(o['@type']==='Product'||(Array.isArray(o['@type'])&&o['@type'].includes('Product')))return o;
          if(o['@graph'])return find(o['@graph']);
          return null;
        };
        const p=find(JSON.parse(fixed));if(p)return p;
      }catch(e2){}
    }
  }
  return null;
}

// Extrage cuvinte cheie din slug-ul URL (ex: /fantana-arteziana-frunze-aurii/ → "fantana arteziana frunze aurii")
function slugFromUrl(url){
  try{
    const parts=new URL(url).pathname.split('/').filter(Boolean);
    const lastSlug=parts[parts.length-1]||parts[parts.length-2]||'';
    return cleanSlug(lastSlug);
  }catch(e){return '';}
}

function extractFromHtml(html,url){
  const product=findJsonLd(html);
  const offer=Array.isArray(product?.offers)?product.offers[0]:product?.offers||{};
  const imgArr=Array.isArray(product?.image)?product.image[0]:product?.image;
  const priceRaw=
    offer.price||
    metaTag(html,'product:price:amount')||
    metaTag(html,'og:price:amount')||
    (html.match(/"fpf_product_price"\s*:\s*"([^"]+)"/i)||[])[1]||
    '';
  const currency=offer.priceCurrency||metaTag(html,'product:price:currency')||metaTag(html,'og:price:currency')||'';
  const eanCands=[
    String(product?.gtin13||product?.gtin8||product?.gtin||product?.mpn||offer.gtin13||offer.gtin||''),
    ...[...html.matchAll(/["']ean[13]?["']\s*:\s*["']?(\d{8,14})["']?/gi)].map(m=>m[1])
  ].filter(v=>v&&/^\d{8,14}$/.test(v));
  const jumboSku=(html.match(/Cod\s+Jumbo[:\s]*(\d{4,})/i)||[])[1]||'';
  // Imaginea: încearcă JSON-LD, og:image, twitter:image, primul img mare din pagină
  const img=
    absUrl(imgArr,url)||
    absUrl(metaTag(html,'og:image'),url)||
    absUrl(metaTag(html,'twitter:image'),url)||
    absUrl((html.match(/<img[^>]+(?:class="[^"]*(?:main|product|hero|featured|primary)[^"]*"|id="[^"]*(?:main|product|hero)[^"]*")[^>]+src="([^"]+)"/i)||[])[1]||'',url)||
    '';
  const description=
    String(product?.description||'').slice(0,300)||
    metaTag(html,'og:description')||
    metaTag(html,'description')||
    '';
  const name=product?.name||metaTag(html,'og:title')||metaTag(html,'twitter:title')||decode((html.match(/<title>([^<]+)<\/title>/i)||[])[1]||'');
  const characteristics=[];
  if(product?.additionalProperty){
    const ap=Array.isArray(product.additionalProperty)?product.additionalProperty:[product.additionalProperty];
    ap.slice(0,3).forEach(p=>{if(p.name&&p.value)characteristics.push(p.name+': '+p.value);});
  }
  if(!characteristics.length&&description){
    const pts=description.split(/[|·•;]/);
    if(pts.length>=2)pts.slice(0,3).forEach(p=>{const t=p.trim();if(t.length>3&&t.length<80)characteristics.push(t);});
  }
  return{name,img,description,price:parsePrice(priceRaw),currency:currency.toUpperCase()||'',ean:eanCands[0]||jumboSku||'',characteristics};
}

function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||
    /^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||
    /^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

async function fetchHtml(url){
  let parsed;
  try{parsed=new URL(url);}catch(e){return '';}
  if(!['http:','https:'].includes(parsed.protocol)||isPrivateHost(parsed.hostname.toLowerCase()))return '';
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),6000);
  try{
    const r=await fetch(url,{headers:FETCH_HEADERS,redirect:'follow',signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)return '';
    const buf=await r.arrayBuffer();
    return new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,MAX_HTML)));
  }catch(e){clearTimeout(t);return '';}
}

async function aiExtract(url,htmlSnippet,slug){
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),5000);
  try{
    const hint=slug?`Slug URL: "${slug}"\n`:'';
    const prompt=`${hint}URL: ${url}\n${htmlSnippet?'Text pagină:\n'+htmlSnippet+'\n':''}\nExtrage din produsul de mai sus:\n- "name": denumirea produsului în ROMÂNĂ (traduce dacă e în altă limbă)\n- "characteristics": array cu max 3 caracteristici cheie în română, concise (ex: ["Material: aluminiu", "Culoare: auriu", "22×13×28 cm"])\n- "description": max 100 caractere text liber în română cu caracteristicile principale (pentru căutare)\n- "price": prețul ca număr\n- "currency": moneda (RON/EUR/PLN etc.)\n- "ean": EAN sau cod produs dacă există, altfel ""\n- "img": URL imagine dacă e vizibil, altfel ""\nRăspunde DOAR cu JSON: {"name":"...","characteristics":[],"description":"...","price":0,"currency":"RON","ean":"","img":""}`;
    const r=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:250,messages:[{role:'user',content:prompt}]}),
      signal:ctrl.signal
    });
    clearTimeout(t);
    const data=await r.json();
    const text=data.choices?.[0]?.message?.content||'{}';
    return JSON.parse(text.replace(/```json|```/g,'').trim());
  }catch(e){clearTimeout(t);return null;}
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  const {url}=req.body||{};
  if(!url||typeof url!=='string')return res.status(400).json({error:'URL lipsă'});

  const empty={name:'',img:'',description:'',price:null,currency:'RON',ean:''};
  const slug=slugFromUrl(url);

  const html=await fetchHtml(url);
  const extracted=html?extractFromHtml(html,url):empty;

  if(extracted.name&&extracted.img&&extracted.price){
    return res.json({...extracted,slug});
  }

  if(!process.env.OPENAI_API_KEY){
    return res.json({...extracted,slug,warning:extracted.name?'OPENAI_API_KEY lipsă — fallback AI sărit':'OPENAI_API_KEY lipsă și produsul nu a putut fi extras complet'});
  }

  // Fallback AI: dacă lipsesc date importante (fără nume sau fără imagine)
  const snippet=html
    ?html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,3500)
    :'';
  const ai=await aiExtract(url,snippet,slug);
  if(ai){
    return res.json({
      name:ai.name||extracted.name||'',
      img:ai.img||extracted.img||'',
      description:ai.description||extracted.description||'',
      characteristics:Array.isArray(ai.characteristics)&&ai.characteristics.length?ai.characteristics:extracted.characteristics||[],
      price:ai.price>0?ai.price:(extracted.price||null),
      currency:ai.currency||extracted.currency||'RON',
      ean:ai.ean||extracted.ean||'',
      slug
    });
  }

  return res.json({...extracted,slug});
};
