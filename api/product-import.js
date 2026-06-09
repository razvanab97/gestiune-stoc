const MAX_HTML_BYTES=3*1024*1024;

function decode(s=''){
  return String(s).replace(/"/g,'"').replace(/&#39;|'/g,"'").replace(/&/g,'&').replace(/</g,'<').replace(/>/g,'>').trim();
}
function meta(html,key){
  const safe=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']'+safe+'["\'][^>]+content=["\']([^"\']+)["\'][^>]*>','i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\']'+safe+'["\'][^>]*>','i')
  ];
  for(const p of patterns){const m=html.match(p);if(m)return decode(m[1]);}
  return '';
}
function parsePrice(v){
  const clean=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!clean)return null;
  const normalized=clean.includes(',')?clean.replace(/\./g,'').replace(',','.'):clean;
  const n=Number(normalized);
  return Number.isFinite(n)&&n>0?n:null;
}
function findProductJson(value){
  if(!value||typeof value!=='object')return null;
  if(Array.isArray(value)){for(const item of value){const found=findProductJson(item);if(found)return found;}return null;}
  if(value['@type']==='Product'||(Array.isArray(value['@type'])&&value['@type'].includes('Product')))return value;
  if(value['@graph'])return findProductJson(value['@graph']);
  return null;
}
function parseProduct(html,url){
  let product=null;
  for(const match of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{product=findProductJson(JSON.parse(match[1]));if(product)break;}catch(e){}
  }
  const offer=Array.isArray(product?.offers)?product.offers[0]:product?.offers||{};
  const image=Array.isArray(product?.image)?product.image[0]:product?.image;
  const absolute=v=>{try{return new URL(v,url).href;}catch(e){return '';}};
  const cleanText=html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
  const breadcrumbs=[...html.matchAll(/<(?:a|span)[^>]*(?:breadcrumb|category)[^>]*>([\s\S]*?)<\/(?:a|span)>/gi)].map(m=>decode(m[1].replace(/<[^>]+>/g,' '))).filter(Boolean).slice(0,12);
  return{
    title:product?.name||meta(html,'og:title')||meta(html,'twitter:title')||'',
    image:absolute(image||meta(html,'og:image')||meta(html,'twitter:image')||meta(html,'image')),
    sku:String(product?.sku||product?.mpn||meta(html,'product:retailer_item_id')||'').trim(),
    price:parsePrice(offer?.price||offer?.lowPrice||meta(html,'product:price:amount')||meta(html,'og:price:amount')),
    currency:String(offer?.priceCurrency||meta(html,'product:price:currency')||meta(html,'og:price:currency')||'').toUpperCase(),
    breadcrumbs,
    pageText:cleanText.slice(0,30000)
  };
}
function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||
    /^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||
    /^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

// Extrage date specifice Jumbo din HTML (Context JSON inline)
function extractJumboData(html,url){
  const result={};
  // Caută obiectul Context inline
  const ctxMatch=html.match(/Context:\s*(\{[\s\S]*?\}),\s*Url:/);
  if(ctxMatch){
    try{
      const ctx=JSON.parse(ctxMatch[1]);
      if(ctx.Item?.Id)result.jumbo_item_id=String(ctx.Item.Id);
      if(ctx.Currency?.Code)result.currency=ctx.Currency.Code;
      if(ctx.Currency?.Symbol)result.currency_symbol=ctx.Currency.Symbol;
    }catch(e){}
  }
  // Caută titlul din <title>
  const titleMatch=html.match(/<title>([^<]+)<\/title>/i);
  if(titleMatch)result.page_title=decode(titleMatch[1]);
  // Caută prețul - de obicei într-un span cu clasă specială
  const priceMatch=html.match(/<span[^>]*class="[^"]*productPrice[^"]*"[^>]*>([^<]+)<\/span>/i);
  if(priceMatch)result.price_text=decode(priceMatch[1]);
  // Caută prețul și în alte formate
  const priceMatch2=html.match(/<span[^>]*class="[^"]*price-value[^"]*"[^>]*>([^<]+)<\/span>/i);
  if(priceMatch2)result.price_text=decode(priceMatch2[1]);
  // Caută SKU/Cod Jumbo în textul paginii
  const skuMatch=html.match(/Cod\s+Jumbo[:\s]*(\d{4,})/i);
  if(skuMatch)result.sku=skuMatch[1].trim();
  // Caută imaginea principală
  const imgMatch=html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if(imgMatch)result.image=imgMatch[1];
  // Caută descrierea
  const descMatch=html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["'][^>]*>/i);
  if(descMatch)result.description=decode(descMatch[1]);
  return result;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:{message:'Metodă nepermisă'}});
  try{
    const url=String(req.body?.url||'').trim(),parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol))throw new Error('URL invalid');
    if(isPrivateHost(parsed.hostname.toLowerCase()))throw new Error('Adresa nu este permisă');
    
    // Folosim un User-Agent realist de Chrome pe Mac
    const headers={
      'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
      'accept-language':'ro-RO,ro;q=0.9,en;q=0.8',
      'sec-fetch-dest':'document',
      'sec-fetch-mode':'navigate',
      'sec-fetch-site':'none',
      'sec-fetch-user':'?1',
      'upgrade-insecure-requests':'1'
    };
    
    const response=await fetch(url,{headers});
    if(!response.ok)throw new Error('Pagina a raspuns cu status '+response.status);
    const html=(await response.text()).slice(0,MAX_HTML_BYTES);
    
    // Parsează datele standard (JSON-LD, meta tags)
    const standard=parseProduct(html,url);
    
    // Parsează date specifice Jumbo
    const jumbo=extractJumboData(html,url);
    
    // Combină: preferă datele specifice Jumbo pentru SKU
    const result={
      title:standard.title||jumbo.page_title||'',
      image:standard.image||jumbo.image||'',
      sku:jumbo.sku||standard.sku||'',
      price:standard.price||parsePrice(jumbo.price_text),
      currency:standard.currency||jumbo.currency||''
    };
    
    return res.status(200).json(result);
  }catch(err){
    return res.status(422).json({error:{message:err.message||'Pagina nu a putut fi citita'}});
  }
};
