const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';
const MAX_HTML=2*1024*1024;

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
function extract(html,url){
  const data={url,normalized_url:normalizeUrl(url),platform:platformOf(url),pnk:pnkOf(url),title:'',price:0,currency:'RON',rating:0,review_count:0,images:[],specs:{},description:''};
  const tm=html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)||html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)||html.match(/<title>([^<]+)/i);
  if(tm)data.title=clean(tm[1]).slice(0,240);
  const dm=html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i)||html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  if(dm)data.description=clean(dm[1]).slice(0,900);
  const pm=html.match(/"price"\s*:\s*"?([\d.,]+)"?/i)||html.match(/data-price-product=["']([\d.,]+)["']/i)||html.match(/([\d.,]+)\s*(?:RON|lei|zł|PLN|EUR)/i);
  if(pm)data.price=priceFrom(pm[1]);
  const cur=html.match(/"priceCurrency"\s*:\s*"([^"]+)"/i);
  if(cur)data.currency=cur[1]||'RON';
  const rm=html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/i);
  if(rm)data.rating=parseFloat(rm[1])||0;
  const rev=html.match(/"reviewCount"\s*:\s*"?(\d+)"?/i)||html.match(/(\d[\d., ]*)\s*(?:recenzii|recenzie|review|reviews)/i);
  if(rev)data.review_count=parseInt(String(rev[1]).replace(/[^\d]/g,''))||0;
  const imgs=[];
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
      const projectId=Number(body.project_id),urls=Array.isArray(body.urls)?body.urls:[];
      if(!projectId||!urls.length)return res.status(400).json({error:'Lipsesc dosarul sau linkurile'});
      const existing=await supa('GET',`research_links?project_id=eq.${projectId}&select=*`);
      const added=[],skipped=[],flagged=[];
      for(const raw of urls){
        let norm='',pnk='';
        try{norm=normalizeUrl(raw);pnk=pnkOf(norm);}catch(e){skipped.push({url:raw,reason:'URL invalid'});continue;}
        const dupe=existing.find(l=>l.normalized_url===norm)||(pnk?existing.find(l=>l.pnk===pnk):null);
        if(dupe){skipped.push({url:raw,reason:'duplicat sigur',duplicate_of:dupe.id});continue;}
        const data=await analyzeUrl(norm);
        const probable=existing.find(l=>data.title&&l.title&&similarity(data.title,l.title)>.72&&(!data.price||!l.price||Math.abs(Number(data.price)-Number(l.price))/Math.max(Number(l.price),1)<.12));
        const row={project_id:projectId,url:String(raw).trim(),normalized_url:norm,platform:data.platform,pnk:data.pnk||pnk,title:data.title,price:data.price||0,currency:data.currency||'RON',rating:data.rating||0,review_count:data.review_count||0,images:data.images||[],specs:data.specs||{},description:data.description||'',duplicate_of:probable?.id||null,duplicate_type:probable?'probabil':'none',include_in_listing:true,status:data.error?'eroare':'analizat',error:data.error||null};
        const ins=await supa('POST','research_links',row);
        const saved=ins?.[0]||row;existing.push(saved);added.push(saved);if(probable)flagged.push(saved);
      }
      await supa('PATCH',`research_projects?id=eq.${projectId}`,{updated_at:new Date().toISOString()});
      return res.status(200).json({added,skipped,flagged});
    }
    return res.status(400).json({error:'Acțiune necunoscută'});
  }catch(e){
    return res.status(e.status||500).json({error:e.message||'Eroare research projects',details:e.details||null});
  }
};
