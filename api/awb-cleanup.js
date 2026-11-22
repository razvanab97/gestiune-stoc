// Curățare zilnică a etichetelor AWB din Supabase Storage (bucket „awb-labels”), cerut direct:
// „nu avem nevoie de o bază de date a AWB-urilor — pentru cele împachetate să se șteargă la distanță de 5 zile”.
// Rulează din Vercel Cron (vercel.json → crons), o dată pe zi. Șterge:
//   1. poza AWB a comenzilor împachetate de mai mult de 5 zile (impachetat=true, impachetat_at < acum-5z) și golește
//      awb_preview_url pe acele rânduri — doar dacă aceeași poză nu e folosită și de un rând încă neîmpachetat/recent;
//   2. pozele AWB rămase fără nicio comandă (înlocuite între timp), mai vechi de 5 zile.
// AWB-ul în sine (numărul, curierul, fișierul-sursă) rămâne pe comandă; se șterge doar imaginea etichetei.
// GET /api/awb-cleanup?dry=1 → doar numără, nu șterge nimic (oricine). Ștergerea reală: doar Vercel Cron
// (Authorization: Bearer $CRON_SECRET când CRON_SECRET e setat; altfel user-agent vercel-cron).
const SUPA_URL=process.env.SUPABASE_URL||'https://fwjgtfjzgvelnmxoyief.supabase.co';
const SERVICE_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||'';
const BUCKET='awb-labels';
const ZILE=5;
const MAX_STERGERI=1500; // pe rulare — restul la rularea următoare

function hdr(extra){return{apikey:SERVICE_KEY,authorization:'Bearer '+SERVICE_KEY,'content-type':'application/json',...extra};}
async function call(method,url,body,extra){
  const r=await fetch(url,{method,headers:hdr(extra),body:body?JSON.stringify(body):undefined});
  const t=await r.text();let d=null;try{d=t?JSON.parse(t):null;}catch(e){d={message:t};}
  if(!r.ok)throw new Error(`${method} ${url.replace(SUPA_URL,'')} → ${r.status} ${d?.message||d?.error||t}`.slice(0,400));
  return d;
}
const fileOf=u=>{const m=String(u||'').match(/\/awb-labels\/([^?#]+)/);return m?decodeURIComponent(m[1]):'';};

async function toateRandurile(){
  const out=[];
  for(let off=0;;off+=1000){
    const rows=await call('GET',`${SUPA_URL}/rest/v1/platforma_comenzi?select=id,awb_preview_url,impachetat,impachetat_at&awb_preview_url=not.is.null&order=id.asc&limit=1000&offset=${off}`);
    out.push(...rows);if(rows.length<1000)break;
  }
  return out;
}
async function toateFisierele(){
  const out=[];
  for(let off=0;;off+=1000){
    const items=await call('POST',`${SUPA_URL}/storage/v1/object/list/${BUCKET}`,{prefix:'',limit:1000,offset:off,sortBy:{column:'name',order:'asc'}});
    out.push(...items.filter(i=>i&&i.id));if(items.length<1000)break;
  }
  return out;
}

module.exports=async(req,res)=>{
  const dry=String(req.query?.dry||'')==='1';
  if(!dry){
    const secret=process.env.CRON_SECRET;
    const ok=secret?req.headers.authorization===`Bearer ${secret}`:/vercel-cron/i.test(req.headers['user-agent']||'');
    if(!ok)return res.status(401).json({error:'Doar Vercel Cron poate șterge. Pentru o simulare: ?dry=1'});
  }
  if(!SERVICE_KEY)return res.status(500).json({error:'Lipsește SUPABASE_SERVICE_ROLE_KEY în variabilele Vercel — fără ea Storage nu permite ștergerea.'});
  try{
    const prag=Date.now()-ZILE*86400000;
    const rows=await toateRandurile();
    const vechi=r=>r.impachetat===true&&r.impachetat_at&&Date.parse(r.impachetat_at)<prag;
    const folosite=new Set(),dePastrat=new Set();
    rows.forEach(r=>{const f=fileOf(r.awb_preview_url);if(!f)return;folosite.add(f);if(!vechi(r))dePastrat.add(f);});
    const randuriVechi=rows.filter(r=>vechi(r)&&fileOf(r.awb_preview_url)&&!dePastrat.has(fileOf(r.awb_preview_url)));
    const deSters=new Set(randuriVechi.map(r=>fileOf(r.awb_preview_url)));
    const fisiere=await toateFisierele();
    const existente=new Set(fisiere.map(f=>f.name));
    let orfane=0;
    fisiere.forEach(f=>{
      if(folosite.has(f.name)||deSters.has(f.name))return;
      const t=Date.parse(f.created_at||f.updated_at||'');
      if(t&&t<prag){deSters.add(f.name);orfane++;}
    });
    const lista=[...deSters].filter(n=>existente.has(n)).slice(0,MAX_STERGERI);
    const octeti=fisiere.filter(f=>lista.includes(f.name)).reduce((s,f)=>s+(Number(f.metadata?.size)||0),0);
    const rezumat={dry,prag:new Date(prag).toISOString(),fisiere_in_bucket:fisiere.length,de_sters:lista.length,din_care_orfane:orfane,mb:Math.round(octeti/1048576*10)/10,randuri_golite:0};
    if(dry)return res.status(200).json(rezumat);

    const sterse=new Set();
    for(let i=0;i<lista.length;i+=100){
      const lot=lista.slice(i,i+100);
      await call('DELETE',`${SUPA_URL}/storage/v1/object/${BUCKET}`,{prefixes:lot});
      lot.forEach(n=>sterse.add(n));
    }
    // golește awb_preview_url pe rândurile ale căror poze au fost șterse (și pe cele care arătau spre fișiere deja lipsă)
    const ids=randuriVechi.filter(r=>{const f=fileOf(r.awb_preview_url);return sterse.has(f)||!existente.has(f);}).map(r=>r.id);
    for(let i=0;i<ids.length;i+=100){
      await call('PATCH',`${SUPA_URL}/rest/v1/platforma_comenzi?id=in.(${ids.slice(i,i+100).join(',')})`,{awb_preview_url:null},{prefer:'return=minimal'});
    }
    rezumat.randuri_golite=ids.length;rezumat.sterse=sterse.size;
    await call('POST',`${SUPA_URL}/rest/v1/setari_app?on_conflict=key`,{key:'awb_cleanup_last',value:`${new Date().toISOString()} · ${sterse.size} poze AWB șterse (${rezumat.mb} MB), ${ids.length} comenzi golite`,updated_at:new Date().toISOString()},{prefer:'resolution=merge-duplicates,return=minimal'}).catch(()=>{});
    return res.status(200).json(rezumat);
  }catch(e){
    return res.status(500).json({error:String(e.message||e)});
  }
};
