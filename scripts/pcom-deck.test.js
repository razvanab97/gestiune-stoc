#!/usr/bin/env node
/* Test al „Deck-ului" de comenzi (Comenzi Platforme): amânare inteligentă + trezire automată + comenzi închise pe platformă
   + istoricul Trendyol peste fereastra de 14 zile. Funcțiile REALE din index.html, bază simulată (fără rețea).
   Rulează: node scripts/pcom-deck.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const names=['pcomSnoozeLabel','pcomSnooze','pcomUnsnooze','pcomWakeSnoozed','pcomReconcileApiDrafts','pcxGroupAwb','pcomStaffPackedConfirmed','pcxDeckIsWorked','pcxDeckWorkedLast','pcxDeckCat','pcxDeckAddDays','pcxDeckWakeKey','pcxDeckSort','pcomTrendyolOlderOpenLines','pcomFinDismissed','pcomFinDismissLines','pcomEmagFinalizedLookback'];
const code='let pcomWaking=false;let pcomTyLookbackAt=0;const PCOM_FIN_DISMISS_KEY="k",PCOM_FIN_DAYS=14;let pcomEmagFinAt=0;\n'+names.map(grab).join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const TODAY='2026-11-23';
function world(lines,opts={}){
  const log=[],store=opts.store||{};
  const P=[{id:1,name:'Cutie',bought:'0',sold:'0'},{id:2,name:'Perie',bought:'10',sold:'2'}];
  const env={
    P,td:()=>TODAY,qty:p=>Math.max(0,parseFloat(p.bought)-parseFloat(p.sold)),
    pcomRowById:id=>(opts.rows||{})[id],
    pcxOrderWorked:(pl,id)=>(opts.worked||[]).includes(pl+'|'+id),pcImpPlatforma:'emag',
    pcxFmtShortDate:d=>d.split('-').reverse().join('.'),
    toast:(m,t)=>log.push(['toast',m,t||'ok']),
    renderPcomImportPreview(){log.push(['render']);},savePcomImportState(){log.push(['save']);},
    syncPcomLineCommitState:async i=>log.push(['sync',i]),
    pcomExcludeProtection:it=>it._protejat||'',
    isInReorderList:id=>!!opts.inReorder,pushReorderEntry:p=>log.push(['reorder',p.id]),
    apiJson:async(u,b)=>{log.push(['api',b.startDate,b.endDate]);if(opts.apiFail)throw new Error('rețea');return{lines:(opts.apiLines||[])};},
    localEmagJson:async(pth,b)=>{log.push(['emag',pth,b.from,b.to]);if(opts.emagFail)throw new Error('conector oprit');return{lines:opts.finLines||[]};},
    dbGet:async u=>{log.push(['db',u]);if(opts.dbFail)throw new Error('db');return opts.dbRows||[];},
    pcomEmagMatchLine:r=>({...r,platforma:'emag',produsId:null,include:true}),pcomApplyRecentFlags(){},pcomTranslateForeignTitles(){},
    localStorage:{getItem:k=>(store[k]===undefined?null:store[k]),setItem:(k,v)=>{store[k]=v;}},
    console:{warn(){}},state:{p:lines}
  };
  const keys=Object.keys(env);
  const api=new Function(...keys,'let pcImpParsed=state.p;'+code+';return {pcomEmagFinalizedLookback,pcomFinDismissLines,pcxDeckWorkedLast,pcxDeckIsWorked,pcomSnooze,pcomUnsnooze,pcomWakeSnoozed,pcomReconcileApiDrafts,pcxDeckCat,pcxDeckAddDays,pcxDeckWakeKey,pcxDeckSort,pcomTrendyolOlderOpenLines,pcomSnoozeLabel,get lines(){return pcImpParsed},set lines(v){pcImpParsed=v}}')(...keys.map(k=>env[k]));
  return{api,log,P};
}
const L=(o={})=>({platforma:'trendyol',_source:'api',comandaId:'C'+Math.random().toString(36).slice(2,6),pnk:'p',titluExtern:'T',data:'2026-11-20',produsId:2,cantitate:2,include:false,amanat:false,...o});
(async()=>{
  console.log('\n— Amânare —');
  {const a=L(),b=L(),w=world([a,b]);
   await w.api.pcomSnooze([0],'zi','2026-11-25');
   eq('„până la o dată": amanat + amanatPana, fără amanatStoc',[a.amanat,a.amanatPana,a.amanatStoc],[true,'2026-11-25',false]);
   eq('se sincronizează cu Staff (retrage comanda comisă) și se re-randează',[w.log.some(l=>l[0]==='sync'&&l[1]===0),w.log.some(l=>l[0]==='render')],[true,true]);
   eq('eticheta arată data',w.api.pcomSnoozeLabel(a),'⏸ Amânată până 25.11.2026');
   await w.api.pcomSnooze([1],'stoc');
   eq('„până apare stoc": amanatStoc true, adăugat la lista de comandat',[b.amanat,b.amanatStoc,b.amanatPana,w.log.some(l=>l[0]==='reorder'&&l[1]===2)],[true,true,'',true]);
   eq('eticheta „până apare stoc"',w.api.pcomSnoozeLabel(b),'⏸ Amânată până apare stoc');}
  {const a=L(),w=world([a]);await w.api.pcomSnooze([0],'zi','2026-11-23');await w.api.pcomSnooze([0],'zi','2020-01-01');await w.api.pcomSnooze([0],'zi','');
   eq('data de azi / din trecut / goală este refuzată (nimic nu se amână)',[a.amanat,w.log.filter(l=>l[0]==='toast'&&l[2]==='err').length],[false,3]);}
  {const a=L({_protejat:'stoc scăzut'}),w=world([a]);await w.api.pcomSnooze([0],'zi','2026-11-25');
   eq('comandă cu stoc deja scăzut/împachetată nu se amână (protecție)',[a.amanat,w.log.some(l=>l[0]==='toast'&&l[2]==='err')],[false,true]);}
  console.log('\n— Trezire automată —');
  {const a=L({amanat:true,amanatPana:'2026-11-22',include:true}),b=L({amanat:true,amanatPana:'2026-11-24'}),c=L({amanat:true}),w=world([a,b,c]);
   const n=w.api.pcomWakeSnoozed(false);
   eq('doar cea cu data trecută se redeschide (1)',[n,a.amanat,b.amanat,c.amanat],[1,false,true,true]);
   eq('revine NEinclusă, cu marcaj și motiv; câmpurile de amânare se golesc',[a.include,a._trezit&&/data amânării/.test(a._trezit.motiv),a.amanatPana,a.amanatStoc],[false,true,'',false]);
   eq('amânarea veche, fără dată (flag simplu), nu se atinge niciodată',c.amanat,true);
   eq('data de azi trezește (<= azi)',(()=>{const x=L({amanat:true,amanatPana:TODAY});const ww=world([x]);ww.api.pcomWakeSnoozed(false);return x.amanat;})(),false);}
  {const a=L({amanat:true,amanatStoc:true,produsId:1,cantitate:2}),b=L({amanat:true,amanatStoc:true,produsId:2,cantitate:2}),w=world([a,b]);
   w.api.pcomWakeSnoozed(false);
   eq('până apare stoc: produsul 1 (stoc 0) rămâne amânat, produsul 2 (stoc 8 ≥ 2) se trezește',[a.amanat,b.amanat,b._trezit&&b._trezit.motiv],[true,false,'a apărut stoc']);
   w.P[0].bought='1';w.api.pcomWakeSnoozed(false);
   eq('stoc 1 < cantitate 2 → încă amânat',a.amanat,true);
   w.P[0].bought='2';w.api.pcomWakeSnoozed(false);
   eq('stoc 2 ≥ cantitate 2 → se trezește',a.amanat,false);}
  {const a=L({amanat:true,amanatPana:'2026-11-01'}),w=world([a]);w.api.pcomWakeSnoozed(true);
   eq('apelat din randare: salvează fără re-randare recursivă',[w.log.some(l=>l[0]==='save'),w.log.some(l=>l[0]==='render')],[true,false]);}
  console.log('\n— Comenzi închise pe platformă (nu se mai pierd) —');
  {const keyOf=o=>'trendyol|'+o.comandaId+'|'+(o.pnk||o.codProdus||o.titluExtern);
   const open=L({comandaId:'O1'}),gone=L({comandaId:'G1'}),com=L({comandaId:'K1',_committedId:7}),file=L({comandaId:'F1',_source:'file'}),emag=L({platforma:'emag',comandaId:'E1'});
   const w=world([open,gone,com,file,emag]);
   const ch=w.api.pcomReconcileApiDrafts('trendyol',keyOf,new Set([keyOf(open)]),undefined);
   eq('nu se șterge nimic: toate cele 5 linii rămân',w.api.lines.length,5);
   eq('doar linia API necomisă absentă din platformă e marcată (_remoteGone)',[!!open._remoteGone,!!gone._remoteGone,!!com._remoteGone,!!file._remoteGone,!!emag._remoteGone,ch],[false,true,false,false,false,1]);
   eq('deck: aceea e „De verificat"',w.api.pcxDeckCat([1]),'verifica');
   w.api.pcomReconcileApiDrafts('trendyol',keyOf,new Set([keyOf(gone),keyOf(open)]),undefined);
   eq('dacă platforma o arată iar deschisă, marcajul dispare',[!!gone._remoteGone,w.api.pcxDeckCat([1])],[false,'de_inclus']);
   const kept=L({comandaId:'V1',data:'2026-10-01'}),w2=world([kept]);
   w2.api.pcomReconcileApiDrafts('trendyol',keyOf,new Set(),o=>o.data<'2026-11-10');
   eq('istoric necitit (keep): linia veche nu se marchează',!!kept._remoteGone,false);}
  console.log('\n— Etape deck —');
  {const rows={5:{awb:'123'},6:{awb:''},7:{awb:'9',impachetat:true,staffFinalizatAt:'2026-11-23T10:00'},8:{awb:'9',impachetat:true,staffFinalizatAt:''},9:{awb:''}};
   const w=world([],{rows});const c=w.api.pcxDeckCat;const idx=a=>{w.api.lines=a;return[...a.keys()]};
   eq('fără produs → 🧩 Fără produs',c(idx([L({produsId:0})])),'produs');
   eq('cu produs, neinclusă → ▶ De inclus',c(idx([L()])),'de_inclus');
   eq('comandă cu 2 linii, una inclusă → încă De inclus',c(idx([L({include:true}),L()])),'de_inclus');
   eq('o linie fără produs în comandă → Fără produs (nu poate fi inclusă)',c(idx([L({include:true}),L({produsId:0})])),'produs');
   eq('inclusă Trendyol, fără AWB în bază → 📮 Așteaptă AWB',c(idx([L({include:true,_committedId:6})])),'awb');
   eq('inclusă eMAG, fără AWB → 📮 Așteaptă AWB',c(idx([L({platforma:'emag',include:true,_committedId:9})])),'awb');
   eq('inclusă, cu AWB → 📦 În Staff',c(idx([L({include:true,_committedId:5})])),'in_staff');
   eq('Vinted inclusă fără cod → 📦 În Staff (codul e opțional)',c(idx([L({platforma:'vinted',include:true})])),'in_staff');
   eq('împachetată DAR neconfirmată de Staff → încă În Staff',c(idx([L({include:true,_committedId:8})])),'in_staff');
   eq('împachetată și confirmată în Staff → ✔ De închis',c(idx([L({include:true,_committedId:7})])),'de_inchis');
   eq('comandă cu 2 linii, doar una confirmată → încă În Staff',c(idx([L({include:true,_committedId:7}),L({include:true,_committedId:5})])),'in_staff');
   eq('amânată → Amânate (chiar dacă e fără produs)',c(idx([L({amanat:true,produsId:0})])),'amanate');
   eq('închisă pe platformă are prioritate față de amânată',c(idx([L({_remoteGone:1,amanat:true})])),'verifica');
   eq('închisă pe platformă dar deja inclusă/comisă → nu mai e „De verificat"',[c(idx([L({_remoteGone:1,include:true,_committedId:5})])),c(idx([L({_remoteGone:1,_committedId:3})]))],['in_staff','de_inclus']);}
  console.log('\n— Comenzi lucrate (număr copiat) → la coada etapei —');
  {const a=L({comandaId:'A'}),b=L({comandaId:'B'}),c=L({comandaId:'C'}),d=L({comandaId:'D',platforma:'emag'});
   const w=world([a,b,c,d],{worked:['trendyol|A','trendyol|C']});const it=n=>({idxs:[n],key:'k'+n});const items=[it(0),it(1),it(2),it(3)];
   eq('lucratele (A, C) coboară la coadă, fiecare grup păstrându-și ordinea',w.api.pcxDeckWorkedLast(items).map(x=>x.key),['k1','k3','k0','k2']);
   const w2=world([a,b],{worked:[]});eq('nimic lucrat → aceeași listă',w2.api.pcxDeckWorkedLast([it(0),it(1)]).map(x=>x.key),['k0','k1']);
   const w3=world([a,b],{worked:['trendyol|A','trendyol|B']});eq('totul lucrat → aceeași listă (nu se răstoarnă nimic)',w3.api.pcxDeckWorkedLast([it(0),it(1)]).map(x=>x.key),['k0','k1']);
   eq('marcajul e pe platformă + număr: același număr pe altă platformă nu contează',w.api.pcxDeckIsWorked([3]),false);}
  console.log('\n— eMAG: finalizate (AWB emis) neînregistrate, ultimele 14 zile —');
  {const F=(id,o={})=>({comandaId:id,titluExtern:'T'+id,cantitate:1,statusEmag:4,finalizareLa:'2026-11-20 10:00:00',tara:'RO',...o});
   const known=L({platforma:'emag',comandaId:'K1'});
   const w=world([known],{finLines:[F('N1'),F('K1'),F('D1'),F('N2'),F('DB1')],dbRows:[{comanda_id:'DB1'}],store:{k:JSON.stringify(['D1'])}});
   const n=await w.api.pcomEmagFinalizedLookback(false);
   const call=w.log.find(l=>l[0]==='emag');
   eq('cere conectorului finalizatele din ultimele 14 zile (azi-14 → mâine)',[call[1],call[2],call[3]],['/orders-historical','2026-11-09','2026-11-24']);
   eq('adaugă DOAR ce nu e în bază / ciornă / respins: N1 și N2',[n,w.api.lines.slice(1).map(x=>x.comandaId)],[2,['N1','N2']]);
   const add=w.api.lines[1];
   eq('liniile noi: finalizată, „închisă pe platformă" (→ De verificat), NEincluse, fără produs forțat',[add._finalizataEmag,!!add._remoteGone,add.include,add._source,w.api.pcxDeckCat([1])],[true,true,false,'api','verifica']);
   eq('verifică în bază direct, în bucăți, cu ID-urile comenzilor',w.log.find(l=>l[0]==='db')[1].startsWith('platforma_comenzi?platforma=eq.emag&comanda_id=in.(N1,K1,D1,N2,DB1)'),true);
   eq('nu scrie nimic: doar citire (conector + GET în bază) — fără comitere/salvare de linii',w.log.filter(l=>['sync','save','api'].includes(l[0])).length+w.log.filter(l=>l[0]==='db'&&/method|POST|PATCH/.test(String(l[1]))).length,0);
   // eliminare → nu se mai readuce
   w.api.pcomFinDismissLines([w.api.lines[1]]);w.api.lines=w.api.lines.filter(x=>x.comandaId!=='N1');w.log.length=0;
   const n2=await w.api.pcomEmagFinalizedLookback(false);
   eq('N1 eliminat de utilizator nu mai revine; N2 (deja în ciornă) nu se dublează',[n2,w.api.lines.map(x=>x.comandaId)],[0,['K1','N2']]);
   // fundal: cel mult o dată pe oră
   w.log.length=0;const n3=await w.api.pcomEmagFinalizedLookback(true);
   eq('în fundal, în aceeași oră: nu mai apelează conectorul',[n3,w.log.length],[0,0]);}
  {const w=world([],{finLines:[{comandaId:'X1',titluExtern:'T',cantitate:1}],dbFail:true});
   eq('dacă nu se poate verifica în bază → nu adaugă nimic (nu riscă dubluri)',[await w.api.pcomEmagFinalizedLookback(false),w.api.lines.length],[0,0]);}
  {const w=world([],{emagFail:true});
   eq('conector oprit → 0, fără erori',await w.api.pcomEmagFinalizedLookback(false),0);}
  {const a=L({comandaId:'A',_finalizataEmag:true}),b=L({comandaId:'B'}),store={},w=world([a,b],{store});
   w.api.pcomFinDismissLines([a,b]);
   eq('se memorează doar liniile „finalizate neînregistrate", nu orice linie eliminată',JSON.parse(store.k),['A']);}
  console.log('\n— Ordinea în deck —');
  {const w=world([]);const mk=(k,dl,pos)=>({key:k,idxs:[],dl,pos});
   eq('De inclus: cel mai apropiat termen primul, fără termen la coadă',w.api.pcxDeckSort('de_inclus',[mk('c',Infinity,0),mk('b',200,1),mk('a',100,2)]).map(x=>x.key),['a','b','c']);
   eq('termene egale → ordinea din listă',w.api.pcxDeckSort('de_inclus',[mk('y',5,1),mk('x',5,0)]).map(x=>x.key),['x','y']);
   eq('pcxDeckAddDays(1) = mâine',w.api.pcxDeckAddDays(1),'2026-11-24');}
  console.log('\n— Istoric Trendyol peste fereastra de 14 zile —');
  {const w=world([],{apiLines:[{comandaId:'X1'}]});const r=await w.api.pcomTrendyolOlderOpenLines('2026-11-10');
   const calls=w.log.filter(l=>l[0]==='api');
   eq('prima rulare: 45 de zile înapoi, în bucăți de 14 zile, fără suprapuneri',[calls.length,calls[0][1],calls[calls.length-1][2]],[3,'2026-10-09','2026-11-09']);
   eq('rezultat complet cu liniile aduse',[r.complete,r.lines.length],[true,3]);
   const r2=await w.api.pcomTrendyolOlderOpenLines('2026-11-10');
   eq('a doua rulare în aceeași oră: nu mai apelează API-ul',[r2.lines.length,w.log.filter(l=>l[0]==='api').length],[0,3]);}
  {const old=L({data:'2026-11-06'}),w=world([old],{apiLines:[]});await w.api.pcomTrendyolOlderOpenLines('2026-11-10');w.log.length=0;
   const r=await w.api.pcomTrendyolOlderOpenLines('2026-11-10');
   eq('după lookback complet, o linie veche din ciornă cere în continuare istoricul de la ea',[w.log.filter(l=>l[0]==='api').length>=1,w.log.find(l=>l[0]==='api')&&w.log.find(l=>l[0]==='api')[1]],[true,'2026-11-06']);}
  {const w=world([],{apiFail:true});const r=await w.api.pcomTrendyolOlderOpenLines('2026-11-10');
   eq('eroare de rețea: complete=false (nu se curăță nimic pe o listă incompletă)',[r.complete,r.lines.length],[false,0]);}
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE DECK-ULUI DE COMENZI AU TRECUT');
  process.exit(failed?1:0);
})().catch(e=>{console.error('EROARE TEST',e);process.exit(1)});
