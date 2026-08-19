// Pagină publică de produs — un singur scop: să poată fi lipită în „Adaugă produs cu URL"
// din eMAG Seller Center, ca eMAG să extragă automat nume/imagini/descriere/EAN/brand direct
// de pe pagină (meta og: + JSON-LD schema.org/Product), fără completare manuală câmp cu câmp.
// Sursa de date: research_projects.listing (JSONB), scris deja de save_listing la fiecare
// generare de anunț (vezi index.html) — nicio tabelă/migrare nouă, doar citire.
// NU expunem aici date interne sensibile (furnizor, preț de achiziție, marjă/verdict research) —
// doar ce ar apărea oricum public pe un anunț real (nume, imagini, descriere, caracteristici, EAN, brand).

const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';

async function supa(path){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{headers:{'apikey':SUPA_KEY,'authorization':'Bearer '+SUPA_KEY}});
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data=null;}
  if(!r.ok){const err=new Error((data&&(data.message||data.error))||`Supabase ${r.status}`);err.status=r.status;throw err;}
  return data;
}

function esc(s){
  return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

function gtinField(ean){
  if(ean.length===8)return{gtin8:ean};
  if(ean.length===12)return{gtin12:ean};
  if(ean.length===13)return{gtin13:ean};
  if(ean)return{gtin:ean};
  return{};
}

function errorPage(status,title,msg){
  return{status,html:`<!doctype html><html lang="ro"><head><meta charset="utf-8"><title>${esc(title)}</title><meta name="robots" content="noindex"></head><body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#333"><h1>${esc(title)}</h1><p>${esc(msg)}</p></body></html>`};
}

module.exports=async function handler(req,res){
  res.setHeader('Content-Type','text/html; charset=utf-8');
  try{
    if(req.method!=='GET'){const e=errorPage(405,'Metodă nepermisă','');return res.status(e.status).send(e.html);}

    const id=Number(String(req.query?.id||'').trim());
    if(!id||!Number.isFinite(id)){const e=errorPage(404,'Produs negăsit','Linkul este invalid.');return res.status(e.status).send(e.html);}

    const rows=await supa(`research_projects?id=eq.${id}&select=id,listing`);
    const proj=rows&&rows[0];
    const l=proj&&proj.listing&&typeof proj.listing==='object'?proj.listing:null;
    if(!proj||!l||!l.title){
      const e=errorPage(404,'Produs indisponibil','Anunțul nu a fost încă generat pentru acest produs.');
      return res.status(e.status).send(e.html);
    }

    const proto=req.headers['x-forwarded-proto']||'https';
    const host=req.headers['x-forwarded-host']||req.headers.host||'';
    const origin=`${proto}://${host}`;
    const pageUrl=`${origin}/produs/${id}`;
    const proxyImg=u=>`${origin}/api/img-proxy?url=${encodeURIComponent(u)}`;

    const name=String(l.title||'').slice(0,250);
    const descPlain=String(l.description||String(l.description_html||'').replace(/<[^>]+>/g,' ')).replace(/\s+/g,' ').trim().slice(0,4000);
    const metaDesc=descPlain.slice(0,300);
    const rawImages=[l.main_image,...(Array.isArray(l.images)?l.images:[]),...(Array.isArray(l.best_images)?l.best_images:[]),...(Array.isArray(l.image_urls)?l.image_urls:[])].filter(Boolean);
    const images=[...new Set(rawImages)].slice(0,10).map(proxyImg);
    const specs=l.specs&&typeof l.specs==='object'?l.specs:{};
    const brand=(specs.Brand&&specs.Brand!=='AB HOMES')?String(specs.Brand):'AB HOMES';
    const eanRaw=String(l.ean||'').replace(/\D/g,'');
    const ean=eanRaw.length>=8&&eanRaw.length<=13?eanRaw:'';
    const specRows=Object.entries(specs).filter(([k,v])=>k&&v&&k!=='Brand').slice(0,30);

    const jsonLd={
      '@context':'https://schema.org/',
      '@type':'Product',
      name,
      description:descPlain,
      image:images,
      brand:{'@type':'Brand',name:brand},
      sku:`AB-${id}`,
      ...gtinField(ean)
    };

    const html=`<!doctype html>
<html lang="ro">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(name)}</title>
<meta name="description" content="${esc(metaDesc)}">
<meta name="robots" content="noindex,follow">
<link rel="canonical" href="${esc(pageUrl)}">
<meta property="og:type" content="product">
<meta property="og:title" content="${esc(name)}">
<meta property="og:description" content="${esc(metaDesc)}">
<meta property="og:url" content="${esc(pageUrl)}">
${images.map(u=>`<meta property="og:image" content="${esc(u)}">`).join('\n')}
${brand?`<meta property="product:brand" content="${esc(brand)}">`:''}
${ean?`<meta property="product:retailer_item_id" content="${esc(ean)}">`:''}
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,'\\u003c')}</script>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:880px;margin:0 auto;padding:32px 20px;color:#1a1a1a;line-height:1.5}
h1{font-size:28px;margin:0 0 16px}
.gal{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 20px}
.gal img{height:200px;width:auto;max-width:100%;border-radius:8px;border:1px solid #eee;object-fit:cover}
.meta{color:#666;font-size:15px;margin-bottom:20px}
.specs{margin-top:24px;border-top:1px solid #eee}
.specs div{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #eee}
.specs b{min-width:180px;flex-shrink:0}
</style>
</head>
<body>
<h1>${esc(name)}</h1>
<div class="meta">Brand: <strong>${esc(brand)}</strong>${ean?` · EAN: <strong>${esc(ean)}</strong>`:''}</div>
<div class="gal">${images.map(u=>`<img src="${esc(u)}" alt="${esc(name)}" loading="lazy">`).join('')}</div>
<p>${esc(descPlain)}</p>
${specRows.length?`<div class="specs">${specRows.map(([k,v])=>`<div><b>${esc(k)}</b><span>${esc(String(v))}</span></div>`).join('')}</div>`:''}
</body>
</html>`;

    res.setHeader('Cache-Control','public, max-age=60, stale-while-revalidate=300');
    return res.status(200).send(html);
  }catch(e){
    const err=errorPage(500,'Eroare','A apărut o eroare la încărcarea produsului.');
    return res.status(err.status).send(err.html);
  }
};
