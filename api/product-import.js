const MAX_HTML_BYTES=3*1024*1024;

function decode(s=''){
  return String(s).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}
function meta(html,key){
  const safe=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp(`<meta[^>]+(?:property|name|itemprop)=["']${safe}["'][^>]+content=["']([^"']+)["'][^>]*>`,'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name|itemprop)=["']${safe}["'][^>]*>`,'i')
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
  return{
    title:product?.name||meta(html,'og:title')||meta(html,'twitter:title')||'',
    image:absolute(image||meta(html,'og:image')||meta(html,'twitter:image')||meta(html,'image')),
    sku:String(product?.sku||product?.mpn||meta(html,'product:retailer_item_id')||'').trim(),
    price:parsePrice(offer?.price||offer?.lowPrice||meta(html,'product:price:amount')||meta(html,'og:price:amount')),
    currency:String(offer?.priceCurrency||meta(html,'product:price:currency')||meta(html,'og:price:currency')||'').toUpperCase()
  };
}
function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||
    /^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||
    /^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:{message:'Metodă nepermisă'}});
  try{
    const url=String(req.body?.url||'').trim(),parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol))throw new Error('URL invalid');
    if(isPrivateHost(parsed.hostname.toLowerCase()))throw new Error('Adresa nu este permisă');
    const response=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 (compatible; StocManager/1.0)','accept':'text/html,application/xhtml+xml'}});
    if(!response.ok)throw new Error(`Pagina a răspuns cu status ${response.status}`);
    const html=(await response.text()).slice(0,MAX_HTML_BYTES);
    return res.status(200).json(parseProduct(html,url));
  }catch(err){
    return res.status(422).json({error:{message:err.message||'Pagina nu a putut fi citită'}});
  }
};
