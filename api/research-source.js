import OpenAI from 'openai';

const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
const MAX_HTML=4*1024*1024;

function decode(s=''){return String(s).replace(/"/g,'"').replace(/&#39;|'/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
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
      const obj=JSON.parse(m[1]);
      const find=o=>{
        if(!o||typeof o!=='object')return null;
        if(Array.isArray(o)){for(const x of o){const r=find(x);if(r)return r;}return null;}
        if(o['@type']==='Product'||(Array.isArray(o['@type'])&&o['@type'].includes('Product')))return o;
        if(o['@graph'])return find(o['@graph']);
        return null;
      };
      const p=find(obj);if(p)return p;
    }catch(e){}
  }
  return null;
}
function extractFromHtml(html,url){
  const product=findJsonLd(html);
  const offer=Array.isArray(product?.offers)?product.offers[0]:product?.offers||{};
  const abs=v=>{try{return new URL(v,url).href;}catch(e){return'';}};
  const imgArr=Array.isArray(product?.image)?product.image[0]:product?.image;
  const imgMeta=metaTag(html,'og:image')||metaTag(html,'twitter:image');
  const priceRaw=offer.price||metaTag(html,'product:price:amount')||metaTag(html,'og:price:amount')||'';
  const currency=offer.priceCurrency||metaTag(html,'product:price:currency')||metaTag(html,'og:price:currency')||'';
  const eanCands=[
    product?.gtin13||product?.gtin8||product?.gtin||product?.mpn||offer.gtin13||offer.gtin||'',
    ...[...html.matchAll(/["']ean[13]?["']\s*:\s*["']?(\d{8,14})["']?/gi)].map(m=>m[1])
  ].filter(v=>v&&/^\d{8,14}$/.test(String(v)));
  return{
    name:product?.name||metaTag(html,'og:title')||metaTag(html,'twitter:title')||'',
    img:abs(imgArr)||abs(imgMeta)||'',
    price:parsePrice(priceRaw),
    currency:currency.toUpperCase()||'',
    ean:eanCands[0]||''
  };
}

export default async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  const {url}=req.body||{};
  if(!url||typeof url!=='string')return res.status(400).json({error:'URL lipsă'});

  let html='';
  try{
    const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html,application/xhtml+xml,*/*;q=0.9'},redirect:'follow',signal:AbortSignal.timeout(12000)});
    if(!r.ok)throw new Error('HTTP '+r.status);
    const buf=await r.arrayBuffer();
    html=new TextDecoder().decode(buf.slice(0,MAX_HTML));
  }catch(e){
    return res.status(502).json({error:'Nu s-a putut accesa URL-ul: '+e.message});
  }

  const extracted=extractFromHtml(html,url);

  // If name/price missing, use AI to extract
  if(!extracted.name||(extracted.price===null)){
    try{
      const openai=new OpenAI({apiKey:process.env.OPENAI_API_KEY});
      const cleanHtml=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,5000);
      const resp=await openai.chat.completions.create({
        model:'gpt-4o-mini',
        max_tokens:300,
        messages:[{role:'user',content:`Extrage din textul acestei pagini de produs: numele produsului, prețul (număr), moneda (RON/EUR/PLN etc.), codul EAN dacă există.\nRăspunde DOAR cu JSON: {"name":"...","price":0.0,"currency":"RON","ean":""}\n\nText pagină:\n${cleanHtml}`}]
      });
      try{
        const j=JSON.parse(resp.choices[0].message.content.replace(/```json|```/g,'').trim());
        if(!extracted.name&&j.name)extracted.name=j.name;
        if(extracted.price===null&&j.price>0)extracted.price=j.price;
        if(!extracted.currency&&j.currency)extracted.currency=j.currency;
        if(!extracted.ean&&j.ean)extracted.ean=j.ean;
      }catch(e){}
    }catch(e){}
  }

  res.json(extracted);
}
