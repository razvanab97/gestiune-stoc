const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';
const MAX_HTML=2*1024*1024;
const VAT=.21,COMMISSION=.20,FIXED_COSTS=23,MIN_PROFIT=10,MIN_MARGIN=20,MAX_LINKS=20;
// Curs aproximativ de conversie în RON — la fel ca EUR_RON hardcodat în index.html pentru prețurile din Inventar.
// Fără asta, un link de furnizor în PLN/EUR era tratat ca RON direct, denaturând profitul/marja calculate.
const FX_TO_RON={RON:1,LEI:1,EUR:5.07,PLN:1.15,USD:4.65,GBP:5.9};
function toRon(price,currency){
  const p=Number(price)||0;if(!p)return 0;
  const rate=FX_TO_RON[String(currency||'RON').toUpperCase()]||1;
  return Math.round(p*rate*100)/100;
}

async function supa(method,path,body){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{method,headers:{'content-type':'application/json','apikey':SUPA_KEY,'authorization':'Bearer '+SUPA_KEY,'prefer':'return=representation,resolution=merge-duplicates'},body:body?JSON.stringify(body):undefined});
  const text=await r.text();let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data={message:text};}
  if(!r.ok){const err=new Error(data?.message||data?.error||`Supabase ${r.status}`);err.status=r.status;err.details=data;throw err;}
  return data;
}
const clean=s=>String(s||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim();
function platformOf(url){
  const h=new URL(url).hostname.replace(/^www\./,'').toLowerCase();
  if(h.includes('emag.'))return'emag';
  if(h.includes('trendyol.'))return'trendyol';
  if(h.includes('jumbo.'))return'furnizor';
  if(h.includes('maxy.'))return'furnizor';
  if(h.includes('verk.'))return'furnizor';
  if(h.includes('i-want.'))return'furnizor';
  return'altul';
}
function pnkOf(url){const m=String(url||'').match(/\/pd\/([A-Z0-9]+)\/?/i);return m?m[1].toUpperCase():'';}
// Jumbo (403 la nivel de server) și Maxy (SPA, HTML gol) nu pot fi citite prin fetch automat —
// confirmat prin testare directă repetată (vezi research-produse-emag-trendyol.md). Pentru ele,
// linkul se salvează ca referință, dar datele vin dintr-un screenshot citit de AI (client-side).
function needsScreenshot(url){
  try{const h=new URL(url).hostname.replace(/^www\./,'').toLowerCase();return h.includes('jumbo.')||h.includes('maxy.');}
  catch(e){return false;}
}
function normalizeUrl(raw){
  const u=new URL(String(raw||'').trim().startsWith('http')?String(raw).trim():'https://'+String(raw||'').trim());
  u.hash='';
  ['utm_source','utm_medium','utm_campaign','utm_content','utm_term','ref','recid','aid','oid','scenario_ID'].forEach(k=>u.searchParams.delete(k));
  return u.toString().replace(/[?#]$/,'').replace(/\/$/,'');
}
function priceFrom(s){
  if(!s)return 0;
  const v=String(s).replace(/\s/g,'').replace(/\.(?=\d{3})/g,'').replace(',','.');
  return Math.round((parseFloat(v)||0)*100)/100;
}
function uniq(arr){return[...new Set(arr.filter(Boolean))];}
// Caută primul bloc JSON-LD de tip schema.org Product din pagină — Verk și i-want.pl (WooCommerce) îl au
// standard, cu date mult mai de încredere decât regex pe HTML brut (nume/preț/descriere completă/EAN real).
function extractJsonLdProduct(html){
  for(const m of html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    let parsed;
    try{parsed=JSON.parse(m[1]);}catch(e){continue;}
    const candidates=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.['@graph'])?parsed['@graph']:[parsed]);
    for(const node of candidates){
      const type=node?.['@type'];
      const isProduct=type==='Product'||(Array.isArray(type)&&type.includes('Product'));
      if(!isProduct)continue;
      let offers=node.offers;
      if(Array.isArray(offers))offers=offers.flat().find(o=>o&&typeof o==='object')||null;
      const rating=node.aggregateRating||{};
      const images=[].concat(node.image||[]).filter(x=>typeof x==='string');
      // brand = producătorul produsului; seller = cine vinde efectiv (offers.seller pe marketplace-uri ca
      // eMAG poate fi diferit de brand — un magazin marketplace poate vinde produse de orice brand).
      const brandName=typeof node.brand==='string'?node.brand:node.brand?.name;
      const sellerName=offers?.seller?.name||(typeof offers?.seller==='string'?offers.seller:'')||node.manufacturer?.name;
      return{
        title:clean(node.name||'').slice(0,240),
        description:clean(node.description||'').slice(0,2000),
        price:offers?.price!=null?priceFrom(offers.price):0,
        currency:offers?.priceCurrency||'',
        rating:parseFloat(rating.ratingValue)||0,
        review_count:parseInt(rating.reviewCount||rating.ratingCount)||0,
        ean:node.gtin13||node.gtin||node.gtin12||node.gtin8||node.mpn||(typeof node.productID==='string'?node.productID.replace(/^mpn:/,''):'')||'',
        brand:clean(brandName||'').slice(0,120),
        seller:clean(sellerName||'').slice(0,120),
        images
      };
    }
  }
  return null;
}
function extract(html,url){
  const data={url,normalized_url:normalizeUrl(url),platform:platformOf(url),pnk:pnkOf(url),title:'',price:0,currency:'RON',rating:0,review_count:0,images:[],specs:{},description:'',ean:'',brand:'',seller:''};
  const ld=extractJsonLdProduct(html);
  if(ld?.title)data.title=ld.title;
  else{
    const tm=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||html.match(/<title>([^<]+)/i);
    if(tm)data.title=clean(tm[1]).slice(0,240);
  }
  if(ld?.description)data.description=ld.description.slice(0,900);
  else{
    const dm=html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
    if(dm)data.description=clean(dm[1]).slice(0,900);
  }
  if(ld?.price){data.price=ld.price;}
  else{
    const pm=html.match(/"price"\s*:\s*"?([\d.,]+)"?/i)||html.match(/data-price-product=["']([\d.,]+)["']/i)||html.match(/([\d.,]+)\s*(?:RON|lei|zł|PLN|EUR)/i);
    if(pm)data.price=priceFrom(pm[1]);
  }
  if(ld?.currency)data.currency=ld.currency;
  else{
    const cur=html.match(/"priceCurrency"\s*:\s*"([^"]+)"/i);
    if(cur)data.currency=cur[1]||'RON';
  }
  if(ld?.rating)data.rating=ld.rating;
  else{
    const rm=html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i);
    if(rm)data.rating=parseFloat(rm[1])||0;
  }
  if(ld?.review_count)data.review_count=ld.review_count;
  else{
    const rev=html.match(/"reviewCount"\s*:\s*"?(\d+)"?/i)||html.match(/(\d[\d., ]*)\s*(?:recenzii|recenzie|review|reviews)/i);
    if(rev)data.review_count=parseInt(String(rev[1]).replace(/[^\d]/g,''))||0;
  }
  if(ld?.ean)data.ean=String(ld.ean).trim();
  if(ld?.brand)data.brand=ld.brand;
  if(ld?.seller)data.seller=ld.seller;
  else{
    // Fallback pentru pagini fără JSON-LD Product complet — pattern generic "seller":"..." / "vânzător".
    const sm=html.match(/"seller"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)||html.match(/[Vv][âa]ndut de[:\s]+<[^>]*>([^<]{2,80})</i);
    if(sm)data.seller=clean(sm[1]).slice(0,120);
  }
  const imgs=(ld?.images||[]).slice();
  for(const m of html.matchAll(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/gi))imgs.push(m[1]);
  for(const m of html.matchAll(/"(?:image|imageUrl|bigImage)"\s*:\s*"([^"]+)"/gi))imgs.push(m[1]);
  for(const m of html.matchAll(/<(?:img|source)[^>]+(?:src|data-src|data-zoom-image)=["']([^"']+)["']/gi))imgs.push(m[1]);
  data.images=uniq(imgs.map(x=>{try{return new URL(x,url).toString()}catch(e){return''}})).slice(0,16);
  return data;
}
function similarity(a,b){
  const aw=new Set(clean(a).toLowerCase().split(/\W+/).filter(x=>x.length>2)),bw=new Set(clean(b).toLowerCase().split(/\W+/).filter(x=>x.length>2));
  if(!aw.size||!bw.size)return 0;
  let hit=0;aw.forEach(x=>{if(bw.has(x))hit++;});
  return hit/Math.max(aw.size,bw.size);
}
function calcProfit(acqGross,saleGross){
  const buy=Number(acqGross)||0,sale=Number(saleGross)||0;
  if(!buy||!sale)return{profit:0,margin:0};
  const revenue=sale/(1+VAT),buyNet=buy/(1+VAT),commissionNet=sale*COMMISSION/(1+VAT);
  const gross=revenue-buyNet-commissionNet-FIXED_COSTS,tax=Math.max(0,gross)*.16,profit=gross-tax;
  return{profit:Math.round(profit*100)/100,margin:revenue>0?Math.round((profit/revenue*100)*100)/100:0};
}
function minSaleForBuy(acqGross,targetProfit=0,targetMargin=0){
  const buy=Number(acqGross)||0;if(!buy)return 0;
  let lo=0,hi=Math.max(100,buy*4);
  const ok=sale=>{const r=calcProfit(buy,sale);return r.profit>=targetProfit&&r.margin>=targetMargin;};
  while(!ok(hi)&&hi<1e6)hi*=1.6;
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;ok(mid)?hi=mid:lo=mid;}
  return Math.round(hi*100)/100;
}
function maxBuyForSale(saleGross){
  const sale=Number(saleGross)||0;if(!sale)return 0;
  let lo=0,hi=Math.max(1,sale);
  const ok=buy=>{const r=calcProfit(buy,sale);return r.profit>=MIN_PROFIT&&r.margin>=MIN_MARGIN;};
  for(let i=0;i<70;i++){const mid=(lo+hi)/2;ok(mid)?lo=mid:hi=mid;}
  return Math.round(lo*100)/100;
}
function median(nums){
  const a=nums.filter(x=>x>0).sort((x,y)=>x-y);
  return a.length?a[Math.floor(a.length/2)]:0;
}
function riskFlags(project,links,marketMin,minZero){
  const text=clean([project.title,project.notes,...links.map(l=>`${l.title||''} ${l.description||''}`)].join(' ')).toLowerCase();
  const flags=[];
  if(/voluminos|greu|fragil|sticla|ceramic|oglinda|mobilier|scaun|masa|covor|pat|geant[aă]\s+mare|rucsac\s+mare/.test(text))flags.push('produs voluminos/fragil sau transport posibil scump');
  if(/m[aă]rim|compatibil|electronic|bater|acumulator|telefon|usb|led|incarcator|garan[tț]ie|retur/.test(text))flags.push('risc retur/reclamații peste medie');
  if(marketMin&&minZero&&marketMin<minZero*1.1)flags.push('prețul pieței este la sub 10% peste pragul minim AB HOMES');
  return flags;
}
function projectVerdict(project,links){
  // Prețul de piață se calculează DOAR din linkuri competitor (eMAG/Trendyol/altul) — linkurile
  // de furnizor (Jumbo/Maxy/Verk etc., adăugate ca sursă de cost) nu trebuie să se amestece în
  // referința de preț de vânzare, altfel prețul de achiziție al furnizorului corupe verdictul.
  // include_in_listing===false = candidat cu scor 50-79, neconfirmat încă manual — nu contează ca preț de piață.
  const valid=links.filter(l=>l.platform!=='furnizor'&&Number(l.price)>0&&l.status!=='eroare'&&l.include_in_listing!==false);
  const prices=valid.map(l=>toRon(l.price,l.currency)).filter(Boolean);
  const convertedCount=valid.filter(l=>String(l.currency||'RON').toUpperCase()!=='RON'&&String(l.currency||'RON').toUpperCase()!=='LEI').length;
  const buy=Number(project.acquisition_price)||0,marketMin=prices.length?Math.min(...prices):0,marketMedian=median(prices);
  const reviewMax=Math.max(0,...valid.map(l=>Number(l.review_count)||0));
  if(!buy)return{verdict:'Date insuficiente',profit_estimated:0,margin_estimated:0,max_buy_price:0,notes:'Lipsește prețul de achiziție.'};
  if(!marketMin)return{verdict:'Date insuficiente',profit_estimated:0,margin_estimated:0,max_buy_price:0,notes:'Lipsește un preț competitor valid (linkurile de furnizor nu contează ca preț de piață).'};
  const ref=marketMin,profit=calcProfit(buy,ref),maxBuy=maxBuyForSale(ref),minZero=minSaleForBuy(buy,0,0),flags=riskFlags(project,valid,marketMin,minZero);
  const profitable=profit.profit>=MIN_PROFIT&&profit.margin>=MIN_MARGIN;
  let verdict='Date insuficiente',notes=[];
  if(!profitable){
    verdict=maxBuy>0?`Cumpără doar sub ${maxBuy.toFixed(2)} lei`:'Evită';
    notes.push(`La prețul pieței ${ref.toFixed(2)} RON, profitul estimat este ${profit.profit.toFixed(2)} RON și marja ${profit.margin.toFixed(2)}%.`);
  }else if(flags.length){
    verdict='Testează 3-5 bucăți';
    notes.push('Profitabil, dar blocat de risc: '+flags.join('; ')+'.');
  }else if(valid.length>=2&&reviewMax>=10){
    verdict='Cumpără';
    notes.push('Trece pragurile de profit și are cerere minimă confirmată: 2+ competitori și 10+ review-uri.');
  }else{
    verdict='Testează 3-5 bucăți';
    notes.push(reviewMax<10?'Profitabil, dar fără suficiente review-uri; se testează, nu se blochează.':'Profitabil, dar datele de piață sunt încă limitate.');
  }
  notes.push(`Referință piață: minim ${marketMin.toFixed(2)} RON, mediană ${marketMedian?marketMedian.toFixed(2):'—'} RON. Prag zero profit estimat: ${minZero.toFixed(2)} RON.`);
  if(convertedCount)notes.push(`${convertedCount} preț(uri) convertite automat în RON (curs aproximativ) — verifică manual dacă decizia e la limită.`);
  return{verdict,profit_estimated:profit.profit,margin_estimated:profit.margin,max_buy_price:maxBuy,notes:notes.join(' ')};
}
async function recalcProject(projectId){
  const pr=(await supa('GET',`research_projects?id=eq.${projectId}&select=*`))?.[0];
  if(!pr)throw new Error('Dosarul nu există');
  const links=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
  const v=projectVerdict(pr,links);
  const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,{...v,updated_at:new Date().toISOString()});
  return{project:rows?.[0],links};
}
async function analyzeUrl(url){
  const headers={'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36','accept':'text/html,application/xhtml+xml,*/*','accept-language':'ro-RO,ro;q=0.9,en;q=0.8'};
  const ctrl=new AbortController(),t=setTimeout(()=>ctrl.abort(),12000);
  try{
    const r=await fetch(url,{headers,signal:ctrl.signal,redirect:'follow'});clearTimeout(t);
    if(!r.ok)throw new Error(`HTTP ${r.status}`);
    return extract((await r.text()).slice(0,MAX_HTML),url);
  }catch(e){
    clearTimeout(t);
    return{url,normalized_url:normalizeUrl(url),platform:platformOf(url),pnk:pnkOf(url),title:'',price:0,currency:'RON',rating:0,review_count:0,images:[],specs:{},description:'',status:'eroare',error:e.message};
  }
}

module.exports=async function handler(req,res){
  try{
    if(req.method==='GET'){
      const projects=await supa('GET','research_projects?select=*&order=updated_at.desc&limit=80');
      const ids=projects.map(p=>p.id);
      const links=ids.length?await supa('GET',`research_links?project_id=in.(${ids.join(',')})&select=*&order=created_at.desc`):[];
      return res.status(200).json({projects:projects.map(p=>({...p,links:links.filter(l=>l.project_id===p.id)}))});
    }
    if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
    const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
    if(body.action==='create_project'){
      const title=clean(body.title);
      if(!title)return res.status(400).json({error:'Titlul dosarului este obligatoriu'});
      const rows=await supa('POST','research_projects',{title,acquisition_price:Number(body.acquisition_price)||0,supplier:clean(body.supplier),verdict:'Date insuficiente',listing_status:'negenerat'});
      return res.status(200).json({project:rows?.[0]});
    }
    if(body.action==='add_links'){
      const projectId=Number(body.project_id),urls=Array.isArray(body.urls)?body.urls.slice(0,MAX_LINKS):[];
      if(!projectId||!urls.length)return res.status(400).json({error:'Lipsesc dosarul sau linkurile'});
      const existing=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
      const added=[],skipped=[],flagged=[];
      const queue=[];
      for(const raw of urls){
        let norm='',pnk='';
        try{norm=normalizeUrl(raw);pnk=pnkOf(norm);}catch(e){skipped.push({url:raw,reason:'URL invalid'});continue;}
        const dupe=existing.find(l=>l.normalized_url===norm)||(pnk?existing.find(l=>l.pnk===pnk):null);
        if(dupe){skipped.push({url:raw,reason:'duplicat sigur',duplicate_of:dupe.id});continue;}
        if(queue.find(x=>x.norm===norm||(pnk&&x.pnk===pnk))){skipped.push({url:raw,reason:'duplicat în lista curentă'});continue;}
        queue.push({raw,norm,pnk});
      }
      const analyzed=await Promise.all(queue.map(async x=>({...x,data:needsScreenshot(x.norm)?{url:x.norm,normalized_url:x.norm,platform:platformOf(x.norm),pnk:x.pnk,title:'',price:0,currency:'RON',rating:0,review_count:0,images:[],specs:{},description:'',status:'aștept screenshot',error:null}:await analyzeUrl(x.norm)})));
      for(const item of analyzed){
        const{raw,norm,pnk,data}=item;
        const probable=existing.find(l=>data.title&&l.title&&similarity(data.title,l.title)>.72&&(!data.price||!l.price||Math.abs(Number(data.price)-Number(l.price))/Math.max(Number(l.price),1)<.12));
        const row={project_id:projectId,url:String(raw).trim(),normalized_url:norm,platform:data.platform,pnk:data.pnk||pnk,title:data.title,price:data.price||0,currency:data.currency||'RON',rating:data.rating||0,review_count:data.review_count||0,images:data.images||[],specs:data.specs||{},description:data.description||'',brand:data.brand||'',seller:data.seller||'',duplicate_of:probable?.id||null,duplicate_type:probable?'probabil':'none',include_in_listing:true,source:needsScreenshot(norm)?'screenshot':'web',status:data.status||(data.error?'eroare':'analizat'),error:data.error||null};
        const ins=await supa('POST','research_links',row);
        const saved=ins?.[0]||row;existing.push(saved);added.push(saved);if(probable)flagged.push(saved);
      }
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      const verdict=await recalcProject(projectId);
      return res.status(200).json({added,skipped,flagged,verdict:verdict.project});
    }
    if(body.action==='set_link_data'){
      // Completează un link 'aștept screenshot' (Jumbo/Maxy) cu datele deja extrase de AI, client-side,
      // dintr-o poză încărcată — serverul nu face fetch și nu apelează AI aici, doar salvează rezultatul.
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const title=clean(body.title).slice(0,240);
      if(!title)return res.status(400).json({error:'Titlul extras din screenshot este gol'});
      // Poza din screenshot rămâne salvată — folosită ulterior ca "poză principală" la generarea AI
      // a căutării eMAG/Trendyol (produsul e vizibil în captură chiar dacă nu are o poză separată de site).
      const patch={title,price:Number(body.price)||0,currency:clean(body.currency)||'RON',description:clean(body.description||'').slice(0,900),source:'screenshot',status:'analizat',error:null,updated_at:new Date().toISOString()};
      if(Array.isArray(body.images)&&body.images.length)patch.images=body.images.slice(0,1);
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,patch);
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      const verdict=await recalcProject(link.project_id);
      return res.status(200).json({link,verdict:verdict.project});
    }
    if(body.action==='add_pdf_listings'){
      // eMAG/Trendyol nu pot fi deschise/citite automat linkuri-cu-linkuri — utilizatorul strânge
      // screenshot-uri ale rezultatelor căutării într-un PDF, AI-ul (client-side) citește fiecare
      // anunț din pagini, iar aici doar salvăm rezultatele deja scorate (fără poze din PDF, Q72).
      const projectId=Number(body.project_id),platform=body.platform==='trendyol'?'trendyol':'emag';
      const listings=Array.isArray(body.listings)?body.listings.slice(0,30):[];
      if(!projectId||!listings.length)return res.status(400).json({error:'Lipsesc dosarul sau anunțurile din PDF'});
      const stamp=Date.now();
      const rows=listings.map((l,i)=>{
        const title=clean(l.title).slice(0,240),score=Math.max(0,Math.min(100,Number(l.score)||0));
        const zone=score>=80?'ok':score>=50?'mid':'low';
        return{project_id:projectId,url:`pdf-import://${platform}/${stamp}-${i}`,normalized_url:`pdf-import://${platform}/${stamp}-${i}`,platform,pnk:null,title,price:Number(l.price)||0,currency:clean(l.currency)||'RON',rating:0,review_count:0,images:[],specs:{},description:clean(l.description||'').slice(0,900),duplicate_of:null,duplicate_type:'none',include_in_listing:score>=80,source:'pdf',score,score_zone:zone,status:'analizat',error:null};
      }).filter(r=>r.title);
      if(!rows.length)return res.status(400).json({error:'Niciun anunț valid găsit în PDF'});
      const ins=await supa('POST','research_links',rows);
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      const verdict=await recalcProject(projectId);
      return res.status(200).json({added:ins||rows,verdict:verdict.project});
    }
    if(body.action==='delete_link'){
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const existing=(await supa('GET',`research_links?id=eq.${linkId}&select=project_id`))?.[0];
      if(!existing)return res.status(404).json({error:'Linkul nu a fost găsit'});
      await supa('DELETE',`research_links?id=eq.${linkId}`);
      const verdict=await recalcProject(existing.project_id);
      return res.status(200).json({deleted:linkId,verdict:verdict.project});
    }
    if(body.action==='toggle_link_include'){
      const linkId=Number(body.link_id);
      if(!linkId)return res.status(400).json({error:'Lipsește linkul'});
      const rows=await supa('PATCH',`research_links?id=eq.${linkId}`,{include_in_listing:!!body.include,updated_at:new Date().toISOString()});
      const link=rows?.[0];
      if(!link)return res.status(404).json({error:'Linkul nu a fost găsit'});
      const verdict=await recalcProject(link.project_id);
      return res.status(200).json({link,verdict:verdict.project});
    }
    if(body.action==='recheck_links'){
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const all=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
      // Linkurile cu date din screenshot (Jumbo/Maxy) nu pot fi re-verificate prin fetch — s-ar suprascrie cu eroare 403/gol.
      const existing=all.filter(l=>l.source!=='screenshot');
      if(!existing.length)return res.status(200).json({checked:0,changed:0});
      const reanalyzed=await Promise.all(existing.map(async l=>({link:l,data:await analyzeUrl(l.url)})));
      let changed=0;
      const history=[];
      for(const{link,data}of reanalyzed){
        const oldPrice=Number(link.price)||0,newPrice=Number(data.price)||0;
        const priceChanged=Math.abs(oldPrice-newPrice)>=0.01;
        if(priceChanged){
          changed++;
          history.push({link_id:link.id,project_id:projectId,url:link.url,old_price:oldPrice,new_price:newPrice,currency:data.currency||link.currency||'RON'});
        }
        await supa('PATCH',`research_links?id=eq.${link.id}`,{title:data.title||link.title,price:data.price||0,currency:data.currency||link.currency||'RON',rating:data.rating||link.rating||0,review_count:data.review_count||link.review_count||0,images:data.images||link.images||[],description:data.description||link.description||'',brand:data.brand||link.brand||'',seller:data.seller||link.seller||'',status:data.error?'eroare':'analizat',error:data.error||null,updated_at:new Date().toISOString()});
      }
      if(history.length){try{await supa('POST','research_price_history',history);}catch(e){/* tabela poate lipsi dacă migrarea nu a fost rulată — reverificarea tot funcționează, doar fără istoric */}}
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      const verdict=await recalcProject(projectId);
      return res.status(200).json({checked:existing.length,changed,verdict:verdict.project});
    }
    if(body.action==='recalc_project'){
      const projectId=Number(body.project_id);
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const verdict=await recalcProject(projectId);
      return res.status(200).json(verdict);
    }
    if(body.action==='set_listing_status'||body.action==='save_listing'){
      const projectId=Number(body.project_id),status=clean(body.status)||'generat';
      if(!projectId)return res.status(400).json({error:'Lipsește dosarul'});
      const patch={listing_status:status,updated_at:new Date().toISOString()};
      if(body.listing&&typeof body.listing==='object')patch.listing=body.listing;
      const rows=await supa('PATCH',`research_projects?id=eq.${projectId}`,patch);
      return res.status(200).json({project:rows?.[0]});
    }
    return res.status(400).json({error:'Acțiune necunoscută'});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Eroare research projects',details:e.details||null});
  }
};
