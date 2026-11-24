#!/usr/bin/env node
/* Test „Simulare stoc după AWB" (Update #772) — funcțiile REALE din index.html (pcxSimAllocate, pcxSimData, pcxSimOrdHtml).
   Regula: comenzile CU AWB scad primele din stoc (mereu); restul, de la cea mai veche (amânatele la coadă); o comandă fără stoc complet NU rezervă nimic.
   Rulează: node scripts/stock-sim.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

const mk=(P,source,pcom)=>{
  const env={P,PCL_PLATS:['emag','trendyol','vinted'],pcImpPlatforma:'emag',PCOM:pcom||[],
    qty:p=>Math.max(0,(p.bought||0)-(p.sold||0)),
    parseQtyVal:(v,d=0)=>{const n=Number(v);return isFinite(n)?n:d;},
    pcomCurrentOrderSource:()=>({source}),
    pcomLineIsApplied:it=>it.efecteAplicate===true,
    pcomRowById:id=>(pcom||[]).find(o=>o.id===id),
    pclTs:it=>it.plasataLa?String(it.plasataLa).replace('T',' ').slice(0,19):'9999',
    pclDateLabel:ts=>{const m=String(ts||'').match(/^(\d{4})-(\d{2})-(\d{2})/);return m?m[3]+'.'+m[2]:'';},
    pcomPlatLabel:p=>p==='trendyol'?'Trendyol':p==='vinted'?'Vinted':'eMAG',
    esc:x=>String(x==null?'':x).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),
    fmtQty:n=>String(Math.round(n*100)/100)};
  const names=Object.keys(env);
  const code=['pcxSimAllocate','pcxSimData','pcxSimOrdHtml'].map(grab).join('\n')+';return{pcxSimAllocate,pcxSimData,pcxSimOrdHtml}';
  return new Function(...names,code)(...names.map(n=>env[n]));
};
const prod=(id,stoc,extra)=>({id,name:'Produs '+id,sku:'S'+id,bought:stoc,sold:0,...extra});
const line=(oid,pid,q,t,extra)=>({platforma:'emag',comandaId:String(oid),produsId:pid,cantitate:q,plasataLa:t,clientNume:'C'+oid,...extra});

console.log('\n— Regula de bază —');
{
  // stoc A=5. 101 (veche, fără AWB) cere 3; 102 (mai nouă, cu AWB) cere 4; 103 (cea mai nouă, fără AWB) cere 1.
  const P=[prod(1,5)];
  const src=[line(101,1,3,'2026-11-20T10:00:00'),line(102,1,4,'2026-11-22T10:00:00',{awb:'AWB1'}),line(103,1,1,'2026-11-23T10:00:00')];
  const d=mk(P,src).pcxSimData();
  eq('comanda CU AWB scade prima (4 din 5) chiar dacă e mai nouă',[d.awb.map(x=>x.o.id),d.afterAwb.get(1)],[['102'],1]);
  eq('apoi cea mai veche fără AWB (101, cere 3) NU mai are stoc → blocată, lipsesc 2',d.blocked.map(b=>[b.o.id,b.miss]),[['101',[{id:1,qty:2}]]]);
  eq('blocată NU rezervă: ultima unitate rămâne pentru comanda mai nouă 103',[d.ready.map(o=>o.id),d.end.get(1)],[['103'],0]);
}

console.log('\n— Ordinea vechimii —');
{
  const P=[prod(1,2)];
  const src=[line(3,1,1,'2026-11-23T10:00:00'),line(1,1,1,'2026-11-20T10:00:00'),line(2,1,1,'2026-11-21T10:00:00')];
  const d=mk(P,src).pcxSimData();
  eq('stoc 2, trei comenzi: primele două (cele mai vechi) sunt gata, a treia (cea mai nouă) rămâne fără stoc',[d.ready.map(o=>o.id),d.blocked.map(b=>b.o.id)],[['1','2'],['3']]);
}

console.log('\n— Comandă cu mai multe produse: gata doar dacă le are pe toate —');
{
  const P=[prod(1,5),prod(2,0)];
  const src=[line(1,1,2,'2026-11-20T10:00:00'),line(1,2,1,'2026-11-20T10:00:00'),line(2,1,3,'2026-11-21T10:00:00')];
  const d=mk(P,src).pcxSimData();
  eq('comanda 1 (A×2 + B×1, B=0) e blocată și NU rezervă A',d.blocked.map(b=>[b.o.id,b.miss.map(m=>m.id)]),[['1',[2]]]);
  eq('comanda 2 (A×3) primește stocul lui A rămas întreg',[d.ready.map(o=>o.id),d.end.get(1)],[['2'],2]);
}

console.log('\n— AWB generat dar stocul nu ajunge —');
{
  const P=[prod(1,2)];
  const src=[line(1,1,3,'2026-11-20T10:00:00',{awb:'A1'}),line(2,1,1,'2026-11-21T10:00:00',{awb:'A2'}),line(3,1,1,'2026-11-22T10:00:00')];
  const d=mk(P,src).pcxSimData();
  eq('comenzile cu AWB scad mereu; prima lipsește 1, a doua lipsește 1 (stocul e deja negativ)',d.awb.map(x=>[x.o.id,x.miss]),[['1',[{id:1,qty:1}]],['2',[{id:1,qty:1}]]]);
  eq('stocul simulat devine negativ (se vede cât lipsește) și comanda fără AWB nu are stoc',[d.afterAwb.get(1),d.ready.length,d.blocked.map(b=>[b.o.id,b.miss])],[-2,0,[['3',[{id:1,qty:1}]]]]);
}

console.log('\n— Amânate, neasociate, aplicate, anulate —');
{
  const P=[prod(1,1),prod(2,5,{archived:true})];
  const src=[
    line(1,1,1,'2026-11-19T10:00:00',{amanat:true}),            // veche, dar amânată → la coadă
    line(2,1,1,'2026-11-22T10:00:00'),                           // mai nouă, activă → primește stocul
    line(3,999,1,'2026-11-18T10:00:00'),                         // produs inexistent → neasociată
    line(4,2,1,'2026-11-18T11:00:00'),                           // produs arhivat → neasociat
    line(5,1,1,'2026-11-18T12:00:00',{efecteAplicate:true}),     // deja aplicată → stocul e deja scăzut, nu intră
    line(6,1,1,'2026-11-18T13:00:00',{anulata:true}),            // anulată → nu intră
    line(7,1,0,'2026-11-18T14:00:00'),                           // cantitate 0 → nu intră
  ];
  const d=mk(P,src).pcxSimData();
  eq('activa 2 primește stocul înaintea amânatei 1 (deși 1 e mai veche)',[d.ready.map(o=>o.id),d.blocked.filter(b=>b.o.amanat).map(b=>b.o.id)],[['2'],['1']]);
  eq('neasociată / arhivată → blocate cu „produs neasociat", nu consumă stoc',d.blocked.filter(b=>b.unmatched).map(b=>b.o.id).sort(),['3','4']);
  eq('aplicate, anulate și cu cantitate 0 nu apar deloc',d.total,4);
}

console.log('\n— AWB din rândul salvat sau din ciornă —');
{
  const P=[prod(1,3)];
  const pcom=[{id:77,awb:'AWB-SALVAT'}];
  const src=[line(1,1,1,'2026-11-20T10:00:00',{_committedId:77}),line(2,1,1,'2026-11-21T10:00:00',{awb:'AWB-CIORNA'}),line(3,1,1,'2026-11-22T10:00:00')];
  const d=mk(P,src,pcom).pcxSimData();
  eq('AWB pe rândul salvat (_committedId) sau pe ciornă — ambele se socotesc „cu AWB"',d.awb.map(x=>[x.o.id,x.o.awb]).sort(),[['1','AWB-SALVAT'],['2','AWB-CIORNA']]);
  eq('rămâne 1 buc. pentru comanda fără AWB',d.ready.map(o=>o.id),['3']);
}

console.log('\n— Corectitudine pe date aleatorii (față de o implementare independentă) —');
{
  let seed=12345;const rnd=()=>{seed=(seed*1664525+1013904223)%4294967296;return seed/4294967296;};
  let bad=0,checks=0;
  for(let round=0;round<300;round++){
    const nP=1+Math.floor(rnd()*4),P=[];for(let i=1;i<=nP;i++)P.push(prod(i,Math.floor(rnd()*8)));
    const nO=1+Math.floor(rnd()*9),src=[],ords=[];
    for(let o=1;o<=nO;o++){
      const day=10+Math.floor(rnd()*15),awb=rnd()<0.35,amanat=rnd()<0.15,ls=[];
      const nl=1+Math.floor(rnd()*3);for(let k=0;k<nl;k++)ls.push({pid:1+Math.floor(rnd()*nP),q:1+Math.floor(rnd()*3)});
      ords.push({id:String(o),day,awb,amanat,ls});
      ls.forEach(l=>src.push(line(o,l.pid,l.q,`2026-11-${String(day).padStart(2,'0')}T10:00:00`,{awb:awb?'W'+o:'',amanat})));
    }
    const d=mk(P,src).pcxSimData();
    // implementare independentă (buclă simplă, fără Map-uri partajate)
    const stock={};P.forEach(p=>stock[p.id]=p.bought);
    const need=o=>{const n={};o.ls.forEach(l=>n[l.pid]=(n[l.pid]||0)+l.q);return n;};
    const ordIdx=Object.fromEntries(ords.map((o,i)=>[o.id,i]));
    const age=(a,b)=>a.day-b.day||ordIdx[a.id]-ordIdx[b.id];
    ords.filter(o=>o.awb).sort(age).forEach(o=>{const n=need(o);for(const k in n)stock[k]-=n[k];});
    const exReady=[],exBlocked=[];
    ords.filter(o=>!o.awb).sort((a,b)=>(a.amanat-b.amanat)||age(a,b)).forEach(o=>{const n=need(o);let ok=true;for(const k in n)if(stock[k]<n[k])ok=false;if(ok){for(const k in n)stock[k]-=n[k];exReady.push(o.id);}else exBlocked.push(o.id);});
    checks++;
    const same=JSON.stringify(d.ready.map(o=>o.id))===JSON.stringify(exReady)&&JSON.stringify(d.blocked.map(b=>b.o.id))===JSON.stringify(exBlocked)&&[...d.end.keys()].every(id=>d.end.get(id)===stock[id]);
    // invariant: stoc_start − scăzut de AWB − scăzut de „gata” = stoc_final
    let consumed={};[...d.awb.map(x=>x.o),...d.ready].forEach(o=>o.lines.forEach(l=>consumed[l.pid]=(consumed[l.pid]||0)+l.q));
    const inv=[...d.start.keys()].every(id=>d.start.get(id)-(consumed[id]||0)===d.end.get(id));
    if(!same||!inv)bad++;
  }
  eq(`${checks} scenarii aleatorii: aceeași împărțire gata/blocate/AWB și același stoc final ca implementarea independentă, invariant stoc păstrat`,bad,0);
}

console.log('\n— Randare (HTML) —');
{
  const P=[prod(1,0)];
  const src=[line(1,1,2,'2026-11-20T10:00:00',{awb:'1214069732',clientNume:'Ion <b>'})];
  const api=mk(P,src),d=api.pcxSimData();
  const html=api.pcxSimOrdHtml(d.awb[0].o,'s-awb',d.awb[0],d);
  eq('AWB fără stoc: mesajul „AWB generat, dar stocul nu ajunge" + lipsesc 2 × produs',/AWB generat, dar stocul nu ajunge: lipsesc 2 × Produs 1/.test(html),true);
  eq('numele clientului e escapat (fără HTML injectat)',/Ion &lt;b&gt;/.test(html)&&!/Ion <b>/.test(html),true);
  eq('numărul AWB se vede',/📮 1214069732/.test(html),true);
}

console.log('\n— Integrare în index.html —');
eq('banda are punct de montare sub „Restanțe pe stoc”',/<div id="pcx-stock-shortage" class="pcx-bl"><\/div>\s*<!--[^]*?-->\s*<div id="pcx-stock-sim" class="pcx-bl pcx-sim"><\/div>/.test(src),true);
eq('randată din ambele locuri unde se randează restanțele',(src.match(/renderPcxBacklog\(\);pcxBacklogRefreshDash\(\);renderPcxSim\(\);/g)||[]).length,2);
eq('nu scrie nimic (niciun dbPost/dbPatch/sb( în blocul simulării)',(()=>{const i=src.indexOf('// ══ 🧮 SIMULARE STOC DUPĂ AWB'),j=src.indexOf('function goDashToBacklog(){');return!/dbPost|dbPatch|dbDelete|saveProdToDb|\bsb\(/.test(src.slice(i,j));})(),true);
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE SIMULĂRII DE STOC AU TRECUT');
process.exit(failed?1:0);
