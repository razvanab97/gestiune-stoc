#!/usr/bin/env node
/* Verifică imaginile produselor (DOAR CITIRE — nu scrie nimic): care URL-uri externe nu mai răspund (furnizorul a mutat/șters
   poza) și care produse nu au deloc imagine. Imaginile proprii (/api/ai-image) sunt stabile; linkurile către furnizori (ex. verk.store)
   pot muri oricând — de aici imaginile „dispărute" din Staff.
   Rulează: node scripts/check-product-images.js            (rezumat)
            node scripts/check-product-images.js --list     (și lista produselor cu probleme) */
const U='https://cbpavtvrfpkbaeueexlw.supabase.co/rest/v1',K='sb_publishable_m7_oRHyxmrrvuGpudY9V1g_LM85ubbr';
const H={apikey:K,Authorization:'Bearer '+K};
async function check(url){
  try{
    const u=new URL(url);
    const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(15000),headers:{'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',referer:u.origin+'/',accept:'image/avif,image/webp,image/*,*/*;q=0.8',range:'bytes=0-1023'}});
    return{ok:(r.status===200||r.status===206)&&/^image\//.test(r.headers.get('content-type')||''),status:r.status};
  }catch(e){return{ok:false,status:0};}
}
(async()=>{
  const rows=await (await fetch(U+'/produse?select=id,name,sku,supplier,img,archived&order=id.asc&limit=2000',{headers:H})).json();
  const withUrl=rows.filter(r=>/^https?:/.test(r.img||'')),own=withUrl.filter(r=>/\/api\/ai-image\?/.test(r.img)),ext=withUrl.filter(r=>!/\/api\/ai-image\?/.test(r.img));
  const res={};let i=0;
  await Promise.all(Array.from({length:12},async()=>{while(i<ext.length){const r=ext[i++];res[r.id]=await check(r.img);}}));
  const dead=ext.filter(r=>!res[r.id].ok),empty=rows.filter(r=>!r.img);
  const act=r=>!r.archived,host=r=>{try{return new URL(r.img).hostname}catch(e){return'?'}};
  console.log(`Produse: ${rows.length} · imagini proprii (stabile): ${own.length} · linkuri externe: ${ext.length} (funcționale: ${ext.length-dead.length}, MOARTE: ${dead.length}) · fără imagine: ${empty.length}`);
  console.log(`Active (ne-arhivate) cu problemă: ${dead.filter(act).length} moarte + ${empty.filter(act).length} fără imagine`);
  const byHost={};dead.forEach(r=>{byHost[host(r)]=(byHost[host(r)]||0)+1;});if(dead.length)console.log('Moarte pe host:',JSON.stringify(byHost));
  if(process.argv.includes('--list')){dead.forEach(r=>console.log(`  ✗ #${r.id} ${r.name.slice(0,50)} | ${r.supplier||'-'} | ${res[r.id].status} | ${r.archived?'arhivat':'activ'}`));empty.filter(act).forEach(r=>console.log(`  ∅ #${r.id} ${r.name.slice(0,50)} | ${r.supplier||'-'} | activ`));}
})().catch(e=>{console.error('Eroare:',e.message);process.exit(1);});
