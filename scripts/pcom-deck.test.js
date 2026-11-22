#!/usr/bin/env node
/* Test al „Deck-ului" de comenzi (Comenzi Platforme): amânare inteligentă + trezire automată + comenzi închise pe platformă
   + istoricul Trendyol peste fereastra de 14 zile. Funcțiile REALE din index.html, bază simulată (fără rețea).
   Rulează: node scripts/pcom-deck.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const names=['pcomSnoozeLabel','pcomSnooze','pcomUnsnooze','pcomWakeSnoozed','pcomReconcileApiDrafts','pcxDeckCat','pcxDeckAddDays','pcxDeckWakeKey','pcxDeckSort','pcomTrendyolOlderOpenLines'];
const code='let pcomWaking=false;let pcomTyLookbackAt=0;\n'+names.map(grab).join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const TODAY='2026-11-23';
function world(lines,opts={}){
  const log=[];
  const P=[{id:1,name:'Cutie',bought:'0',sold:'0'},{id:2,name:'Perie',bought:'10',sold:'2'}];
  const env={
    P,td:()=>TODAY,qty:p=>Math.max(0,parseFloat(p.bought)-parseFloat(p.sold)),
    pcxFmtShortDate:d=>d.split('-').reverse().join('.'),
    toast:(m,t)=>log.push(['toast',m,t||'ok']),
    renderPcomImportPreview(){log.push(['render']);},savePcomImportState(){log.push(['save']);},
    syncPcomLineCommitState:async i=>log.push(['sync',i]),
    pcomExcludeProtection:it=>it._protejat||'',
    isInReorderList:id=>!!opts.inReorder,pushReorderEntry:p=>log.push(['reorder',p.id]),
    apiJson:async(u,b)=>{log.push(['api',b.startDate,b.endDate]);if(opts.apiFail)throw new Error('rețea');return{lines:(opts.apiLines||[])};},
    console:{warn(){}},state:{p:lines}
  };
  const keys=Object.keys(env);
  const api=new Function(...keys,'let pcImpParsed=state.p;'+code+';return {pcomSnooze,pcomUnsnooze,pcomWakeSnoozed,pcomReconcileApiDrafts,pcxDeckCat,pcxDeckAddDays,pcxDeckWakeKey,pcxDeckSort,pcomTrendyolOlderOpenLines,pcomSnoozeLabel,get lines(){return pcImpParsed},set lines(v){pcImpParsed=v}}')(...keys.map(k=>env[k]));
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
   eq('dacă platforma o arată iar deschisă, marcajul dispare',[!!gone._remoteGone,w.api.pcxDeckCat([1])],[false,'proc']);
   const kept=L({comandaId:'V1',data:'2026-10-01'}),w2=world([kept]);
   w2.api.pcomReconcileApiDrafts('trendyol',keyOf,new Set(),o=>o.data<'2026-11-10');
   eq('istoric necitit (keep): linia veche nu se marchează',!!kept._remoteGone,false);}
  console.log('\n— Categorii deck —');
  {const w=world([]);const c=w.api.pcxDeckCat;const idx=a=>{w.api.lines=a;return[...a.keys()]};
   eq('neinclusă → De procesat',c(idx([L()])),'proc');
   eq('inclusă → Incluse',c(idx([L({include:true})])),'incluse');
   eq('amânată → Amânate',c(idx([L({amanat:true})])),'amanate');
   eq('comandă cu 2 linii, una inclusă → încă De procesat',c(idx([L({include:true}),L()])),'proc');
   eq('închisă pe platformă are prioritate față de amânată',c(idx([L({_remoteGone:1,amanat:true})])),'verifica');
   eq('închisă pe platformă dar deja inclusă/comisă → nu mai e „De verificat"',[c(idx([L({_remoteGone:1,include:true})])),c(idx([L({_remoteGone:1,_committedId:3})]))],['incluse','proc']);}
  console.log('\n— Ordinea în deck —');
  {const w=world([]);const mk=(k,dl,pos)=>({key:k,idxs:[],dl,pos});
   eq('De procesat: cel mai apropiat termen primul, fără termen la coadă',w.api.pcxDeckSort('proc',[mk('c',Infinity,0),mk('b',200,1),mk('a',100,2)]).map(x=>x.key),['a','b','c']);
   eq('termene egale → ordinea din listă',w.api.pcxDeckSort('proc',[mk('y',5,1),mk('x',5,0)]).map(x=>x.key),['x','y']);
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
