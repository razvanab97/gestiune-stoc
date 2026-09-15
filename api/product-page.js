// Pagină publică de produs — un singur scop: să poată fi lipită în „Adaugă produs cu URL"
// din eMAG Seller Center, ca eMAG să extragă automat nume/imagini/descriere/EAN/brand direct
// de pe pagină (meta og: + JSON-LD schema.org/Product), fără completare manuală câmp cu câmp.
// Sursa de date: research_projects.listing (JSONB), scris deja de save_listing la fiecare
// generare de anunț (vezi index.html) — nicio tabelă/migrare nouă, doar citire.
// NU expunem aici date interne sensibile (furnizor, preț de achiziție, marjă/verdict research) —
// doar ce ar apărea oricum public pe un anunț real (nume, imagini, descriere, caracteristici, EAN, brand).

const SUPA_URL=process.env.SUPABASE_URL||'https://cbpavtvrfpkbaeueexlw.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'sb_publishable_m7_oRHyxmrrvuGpudY9V1g_LM85ubbr';

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

// description_html (dacă există) e mai bogată decât descrierea plată — are structură (paragrafe,
// beneficii ca listă, poze intercalate), exact ce lipsea pe pagina publică. Vine din AI, deci nu o
// inserăm brut (risc XSS pe o pagină PUBLICĂ) — păstrăm doar un allowlist de tag-uri text simple,
// eliminăm TOATE atributele de pe ele (niciun onclick/onerror/style), și reconstruim manual <img>
// doar din URL-uri http(s) reale, trecute prin proxy (consistent cu galeria de sus).
function sanitizeDescriptionHtml(html,proxyImg){
  const allowedTags=new Set(['p','br','ul','li','strong','b','em','i']);
  const imgSrcs=[];
  let withPlaceholders=String(html||'').replace(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi,(m,src)=>{
    if(!/^https?:\/\//i.test(src))return'';
    imgSrcs.push(src);
    return` IMG${imgSrcs.length-1} `;
  });
  let clean=withPlaceholders.replace(/<\/?([a-zA-Z0-9]+)\b[^>]*>/g,(m,tag)=>{
    const t=tag.toLowerCase();
    if(!allowedTags.has(t))return'';
    return m.startsWith('</')?`</${t}>`:`<${t}>`;
  });
  clean=clean.replace(/ IMG(\d+) /g,(m,i)=>{
    const src=imgSrcs[Number(i)];
    return`<img src="${esc(proxyImg(src))}" alt="" loading="lazy" style="max-width:100%;border-radius:8px;margin:12px 0;display:block">`;
  });
  return clean.trim();
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
    // Text simplu, dar cu STRUCTURA păstrată (paragrafe pe linii separate, iteme de listă cu „• ” în
    // față) — nu doar tag-urile smulse și totul lipit pe un singur rând (replace(/<[^>]+>/g,' ')), care
    // transforma orice descriere cu paragrafe/beneficii într-o singură propoziție continuă, greu de citit
    // pentru orice tool automat care citește STRICT description/og:description (nu body-ul HTML vizibil,
    // care oricum are deja structura corectă mai jos, prin descHtmlSafe) — cerut direct („descrierea...
    // să se încadreze la HTML”, ca eMAG să preia ceva coerent, nu un bloc de text amestecat.
    const descStructured=l.description_html
      ?String(l.description_html)
        .replace(/<li[^>]*>/gi,'\n• ').replace(/<\/li>/gi,'')
        .replace(/<\/?(?:p|div|ul|ol)[^>]*>|<br\s*\/?>/gi,'\n')
        .replace(/<[^>]+>/g,'')
        .replace(/[ \t]+/g,' ').replace(/\n[ \t]+/g,'\n').replace(/\n{3,}/g,'\n\n').trim()
      :String(l.description||'').trim();
    const descPlain=(descStructured||'').slice(0,4000);
    const metaDesc=descPlain.replace(/\s+/g,' ').trim().slice(0,300);
    // best_images vine din AI ca array de obiecte {url,role,reason}, nu de string-uri — vezi
    // aceeași reparație în factoryImages() din index.html. Plafon 40 (era 14) + excludere
    // removed_pool_images — aliniat cu factoryImages() din index.html (cerut direct: „să putem alege ce
    // poze vor fi selectate pentru a fi încărcate în eMAG” — o poză ștearsă din galerie, în Research, nu
    // mai trebuie să apară nici aici, pe pagina pe care eMAG chiar o citește la import).
    const bestUrls=(Array.isArray(l.best_images)?l.best_images:[]).map(x=>typeof x==='string'?x:x?.url).filter(Boolean);
    const rawImages=[l.main_image,...(Array.isArray(l.images)?l.images:[]),...bestUrls,...(Array.isArray(l.image_urls)?l.image_urls:[])].filter(Boolean);
    const removedImages=new Set(Array.isArray(l.removed_pool_images)?l.removed_pool_images:[]);
    const images=[...new Set(rawImages)].filter(u=>!removedImages.has(u)).slice(0,40).map(proxyImg);
    const specs=l.specs&&typeof l.specs==='object'?l.specs:{};
    const brand=(specs.Brand&&specs.Brand!=='AB HOMES')?String(specs.Brand):'AB HOMES';
    const eanRaw=String(l.ean||'').replace(/\D/g,'');
    const ean=eanRaw.length>=8&&eanRaw.length<=13?eanRaw:'';
    // ID produs/Cod produs — schema reală AB HOMES (contor zilnic+dată), alocată o singură dată per
    // listare din „Ghid completare eMAG"/„Link public produs" (index.html, ensureListingEmagId) — aici
    // doar CITIM ce a fost deja calculat și salvat, nicio alocare nouă în serverless (l.emag_id lipsă =
    // nu arătăm rândul, nu inventăm un cod).
    const emagId=String(l.emag_id||'').trim();
    const codProdus=emagId?`AB${emagId}`:'';
    // Preț — calculat client-side (aceeași logică de piață/marjă din cadranul eMAG al dosarului) și
    // salvat pe listare la „Link public produs" — vezi computeListingPriceAndPhysical în index.html.
    // Lipsă (0) = nu arătăm nimic, nu inventăm un preț.
    const priceGross=Number(l.sale_price_gross)>0?Math.round(Number(l.sale_price_gross)*100)/100:0;
    const priceNet=Number(l.sale_price_net)>0?Math.round(Number(l.sale_price_net)*100)/100:0;
    const dims=l.dims_mm&&typeof l.dims_mm==='object'?l.dims_mm:null;
    const weightG=Number(l.weight_g)>0?Math.round(Number(l.weight_g)):0;
    const physicalRows=[
      dims&&(dims.l||dims.w||dims.h)?['Dimensiuni (L×l×H, mm)',`${dims.l||'—'} × ${dims.w||'—'} × ${dims.h||'—'}`]:null,
      weightG?['Greutate',weightG>=1000?`${(weightG/1000).toFixed(2)} kg`:`${weightG} g`]:null,
    ].filter(Boolean);
    const specRows=[...Object.entries(specs).filter(([k,v])=>k&&v&&k!=='Brand'),...physicalRows].slice(0,30);
    const descHtmlSafe=l.description_html?sanitizeDescriptionHtml(l.description_html,proxyImg):'';

    // eMAG citește prețul FĂRĂ TVA la import („Offer - Price"/sale_price, exact câmpul din Ghid
    // completare eMAG) — punem prețul net (nu cel cu TVA) în tot ce e citit automat (JSON-LD/meta),
    // cerut direct („în URL să apară prețul recomandat fără TVA, pe acela să-l putem prelua").
    const jsonLd={
      '@context':'https://schema.org/',
      '@type':'Product',
      name,
      description:descPlain,
      image:images,
      brand:{'@type':'Brand',name:brand},
      sku:codProdus||`AB-${id}`,
      ...gtinField(ean),
      ...(priceNet?{offers:{'@type':'Offer',price:priceNet.toFixed(2),priceCurrency:'RON',availability:'https://schema.org/InStock'}}:{})
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
${codProdus?`<meta property="product:retailer_part_no" content="${esc(codProdus)}">`:''}
${priceNet?`<meta property="product:price:amount" content="${priceNet.toFixed(2)}">\n<meta property="product:price:currency" content="RON">\n<meta property="og:price:amount" content="${priceNet.toFixed(2)}">\n<meta property="og:price:currency" content="RON">`:''}
<script type="application/ld+json">${JSON.stringify(jsonLd).replace(/</g,'\\u003c')}</script>
<style>
body{font-family:system-ui,-apple-system,sans-serif;max-width:880px;margin:0 auto;padding:32px 20px;color:#1a1a1a;line-height:1.5}
h1{font-size:28px;margin:0 0 16px}
.gal{display:flex;gap:10px;flex-wrap:wrap;margin:0 0 20px}
.gal img{height:200px;width:auto;max-width:100%;border-radius:8px;border:1px solid #eee;object-fit:cover}
.meta{color:#666;font-size:15px;margin-bottom:14px}
.price{font-size:26px;font-weight:700;color:#1a1a1a;margin-bottom:20px}
.price small{font-size:14px;font-weight:400;color:#666}
.specs{margin-top:24px;border-top:1px solid #eee}
.specs div{display:flex;gap:10px;padding:8px 0;border-bottom:1px solid #eee}
.specs b{min-width:180px;flex-shrink:0}
.desc p{margin:0 0 14px}
.desc ul{margin:0 0 14px;padding-left:22px}
.desc li{margin-bottom:6px}
</style>
</head>
<body>
<h1>${esc(name)}</h1>
<div class="meta">Brand: <strong>${esc(brand)}</strong>${ean?` · EAN: <strong>${esc(ean)}</strong>`:''}${codProdus?` · Cod produs: <strong>${esc(codProdus)}</strong>`:''}${emagId?` · ID produs: <strong>${esc(emagId)}</strong>`:''}</div>
${priceNet?`<div class="price">${priceNet.toFixed(2)} RON <small>fără TVA · ${priceGross.toFixed(2)} RON cu TVA</small></div>`:''}
<div class="gal">${images.map(u=>`<img src="${esc(u)}" alt="${esc(name)}" loading="lazy">`).join('')}</div>
<div class="desc">${descHtmlSafe||`<p>${esc(descPlain)}</p>`}</div>
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
