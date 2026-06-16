const MAX_HTML=900000;

const HDRS={
  'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'accept-language':'ro-RO,ro;q=0.9,en;q=0.8'
};

function decode(s=''){return String(s).replace(/&quot;/g,'"').replace(/&#34;/g,'"').replace(/&#39;|&apos;|&#039;/g,"'").replace(/&#(\d+);/g,(_,n)=>String.fromCharCode(Number(n))).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();}
function cleanText(s=''){return decode(String(s||'').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim());}
function meta(html,key){
  const safe=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const pats=[
    new RegExp('<meta[^>]+(?:property|name|itemprop)=["\']'+safe+'["\'][^>]+content=["\']([^"\']+)["\']','i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name|itemprop)=["\']'+safe+'["\']','i')
  ];
  for(const p of pats){const m=html.match(p);if(m)return decode(m[1]);}
  return '';
}
function absUrl(v,base){try{return new URL(decode(v),base).href;}catch(e){return '';}}
function parsePrice(v){
  const c=String(v||'').replace(/\s/g,'').replace(/[^\d,.-]/g,'');
  if(!c)return null;
  const n=Number(c.includes(',')?c.replace(/\./g,'').replace(',','.'):c);
  return Number.isFinite(n)&&n>0?n:null;
}
function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||/^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||/^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
function findProductJson(html){
  const find=o=>{
    if(!o||typeof o!=='object')return null;
    if(Array.isArray(o)){for(const x of o){const r=find(x);if(r)return r;}return null;}
    if(o['@type']==='Product'||(Array.isArray(o['@type'])&&o['@type'].includes('Product')))return o;
    if(o['@graph'])return find(o['@graph']);
    return null;
  };
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{const p=find(JSON.parse(m[1]));if(p)return p;}catch(e){}
  }
  return null;
}
function parsePage(html,url){
  const product=findProductJson(html)||{};
  const image=Array.isArray(product.image)?product.image[0]:product.image;
  const imgs=[
    image,
    meta(html,'og:image'),
    meta(html,'twitter:image'),
    ...[...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["'][^>]*>/gi)].map(m=>m[1])
  ].map(x=>absUrl(x,url)).filter(Boolean);
  const uniq=[...new Set(imgs)].filter(x=>!/(sprite|logo|icon|placeholder|blank)/i.test(x)).slice(0,8);
  const title=decode(product.name||meta(html,'og:title')||meta(html,'twitter:title')||(html.match(/<title>([^<]+)<\/title>/i)||[])[1]||'');
  const description=decode(product.description||meta(html,'og:description')||meta(html,'description')||'');
  const offer=Array.isArray(product.offers)?product.offers[0]:product.offers||{};
  const price=parsePrice(offer.price||offer.lowPrice||meta(html,'product:price:amount')||meta(html,'og:price:amount')||(html.match(/"fpf_product_price"\s*:\s*"([^"]+)"/i)||[])[1]);
  const currency=String(offer.priceCurrency||meta(html,'product:price:currency')||meta(html,'og:price:currency')||'RON').toUpperCase();
  return{
    url,
    host:new URL(url).hostname.replace(/^www\./,''),
    title,
    description,
    price,
    currency,
    images:uniq,
    text:cleanText(html).slice(0,5000)
  };
}
async function fetchPage(url){
  const parsed=new URL(url);
  if(!['http:','https:'].includes(parsed.protocol)||isPrivateHost(parsed.hostname.toLowerCase()))throw new Error('URL nepermis');
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),7000);
  try{
    const r=await fetch(url,{headers:HDRS,redirect:'follow',signal:ctrl.signal});
    clearTimeout(t);
    if(!r.ok)throw new Error('HTTP '+r.status);
    const buf=await r.arrayBuffer();
    const html=new TextDecoder().decode(new Uint8Array(buf,0,Math.min(buf.byteLength,MAX_HTML)));
    return parsePage(html,url);
  }catch(e){clearTimeout(t);return{url,host:parsed.hostname.replace(/^www\./,''),error:e.message,title:'',description:'',images:[],text:''};}
}
function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  return(data?.output||[]).flatMap(i=>i?.content||[]).filter(x=>x?.type==='output_text').map(x=>x.text||'').join('\n');
}
function jsonBlock(text=''){
  const cleaned=String(text||'').replace(/```json|```/gi,'').trim();
  let start=cleaned.indexOf('{');
  if(start<0)return '{}';
  let depth=0,inStr=false,esc=false,end=-1;
  for(let i=start;i<cleaned.length;i++){
    const ch=cleaned[i];
    if(inStr){
      if(esc)esc=false;
      else if(ch==='\\')esc=true;
      else if(ch==='"')inStr=false;
      continue;
    }
    if(ch==='"')inStr=true;
    else if(ch==='{')depth++;
    else if(ch==='}'){
      depth--;
      if(depth===0){end=i;break;}
    }
  }
  return end>=start?cleaned.slice(start,end+1):cleaned.slice(start,cleaned.lastIndexOf('}')+1);
}
function parseLooseJson(text){
  const raw=jsonBlock(text)
    .replace(/\u0000/g,'')
    .replace(/,\s*([}\]])/g,'$1')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'");
  return JSON.parse(raw);
}
async function repairJsonWithAI(raw,mode){
  const prompt=`Repară textul de mai jos într-un JSON valid. Păstrează exact structura și informațiile, doar corectează virgule, ghilimele, escape-uri și acolade. Răspunde DOAR cu JSON valid, fără explicații.

Mod: ${mode}

TEXT:
${String(raw||'').slice(0,24000)}`;
  const ai=await fetch('https://api.openai.com/v1/responses',{
    method:'POST',
    headers:{'content-type':'application/json','authorization':'Bearer '+process.env.OPENAI_API_KEY},
    body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_output_tokens:2200,input:[{role:'user',content:[{type:'input_text',text:prompt}]}]})
  });
  const data=await ai.json();
  if(!ai.ok)throw new Error('Repararea JSON a eșuat');
  return parseLooseJson(outputText(data));
}
async function parseAiJson(text,mode){
  try{return parseLooseJson(text);}
  catch(err){
    try{return await repairJsonWithAI(text,mode);}
    catch(err2){throw new Error(`JSON AI invalid și nereparabil: ${err.message}`);}
  }
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY lipsă'});
  try{
    const mode=req.body?.mode==='analyze'?'analyze':'build';
    const urls=[...new Set((req.body?.urls||[]).filter(u=>/^https?:\/\//i.test(String(u||''))).slice(0,8))];
    const product=req.body?.product||{};
    if(!urls.length&&!product.name)return res.status(400).json({error:'Lipsesc linkurile sau produsul'});
    const pages=await Promise.all(urls.map(fetchPage));
    const prompt=mode==='analyze'
      ?`Ești specialist în marketplace-uri eMAG/Trendyol și optimizare de anunțuri. Analizează listările externe comparativ cu produsul de bază.

Obiectiv:
- stabilește dacă fiecare link pare același produs cu produsul de bază
- evaluează cât de bine este optimizată listarea
- extrage ce merită folosit: titluri bune, beneficii, specificații, poze, structură
- creează o listare îmbunătățită, mai bună decât cele analizate

Scoruri:
- match_score 0-100: 80-100 același produs probabil, 50-79 necesită confirmare, sub 50 probabil alt produs
- optimization_score 0-100: calitate titlu + descriere + specificații + poze + claritate comercială

Reguli:
- Scrie în română.
- Nu inventa specificații care nu apar în date.
- Dacă o listare e blocată sau incompletă, spune asta.
- Returnează STRICT JSON valid.

Produs de bază:
${JSON.stringify(product).slice(0,6000)}

Pagini analizate:
${JSON.stringify(pages).slice(0,22000)}

Format JSON:
{"listings":[{"url":"...","platform":"eMAG/Trendyol/altul","extracted_title":"...","price":0,"currency":"RON","match_score":0,"is_same_product":"da/probabil/incert/nu","optimization_score":0,"strengths":["..."],"weaknesses":["..."],"reusable_parts":["..."],"specs_found":["..."],"image_notes":"..."}],"price_summary":{"valid_prices":[0],"min":0,"max":0,"average":0,"median":0,"recommended_reference_price":0,"notes":"..."},"best_patterns":["..."],"missing_info":["..."],"improved_listing":{"title":"...","short_title":"...","description":"...","bullets":["..."],"seo_keywords":["..."],"specs":{"Material":"...","Dimensiuni":"...","Culoare":"...","Utilizare":"..."},"main_image":"https://...","images":["https://..."],"source_notes":"..."}}`
      :`Ești specialist în listări pentru marketplace-uri din România. Creează un anunț de vânzare convingător, clar și fără exagerări false, folosind datele din linkuri și produs.

Reguli:
- Scrie în română.
- Nu inventa specificații tehnice care nu apar în date.
- Păstrează dimensiuni/material/culoare dacă apar.
- Titlul trebuie să fie bun pentru eMAG/Trendyol/website, max 130 caractere.
- Descrierea trebuie să fie comercială, ușor de citit, 700-1200 caractere.
- Bullet-urile să fie scurte și utile.
- Returnează STRICT JSON valid.

Produs de bază:
${JSON.stringify(product).slice(0,6000)}

Pagini analizate:
${JSON.stringify(pages).slice(0,18000)}

Format JSON:
{"title":"...","short_title":"...","description":"...","bullets":["..."],"seo_keywords":["..."],"specs":{"Material":"...","Dimensiuni":"...","Culoare":"...","Utilizare":"..."},"main_image":"https://...","images":["https://..."],"source_notes":"ce informații au fost folosite / ce lipsește"}`;
    const ai=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',
      headers:{'content-type':'application/json','authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',max_output_tokens:1800,input:[{role:'user',content:[{type:'input_text',text:prompt}]}]})
    });
    const data=await ai.json();
    if(!ai.ok)return res.status(ai.status).json(data);
    const text=outputText(data);
    const json=await parseAiJson(text,mode);
    return res.status(200).json(mode==='analyze'?{analysis:json,pages}:{listing:json,pages});
  }catch(err){
    return res.status(500).json({error:'Eroare generator anunț: '+(err.message||err)});
  }
};
