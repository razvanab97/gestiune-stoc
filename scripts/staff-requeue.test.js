#!/usr/bin/env node
/* Test al „↩ Readu în Împachetare" din Staff → În așteptare: funcțiile REALE din staff.html (clasificarea comenzilor,
   undo, scrieri), bază simulată în memorie. Rulează: node scripts/staff-requeue.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','staff.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1)}}};
const helpers=src.slice(src.indexOf("const QUEUE_RESET_HOUR"),src.indexOf("async function loadQueueMarker"));
const names=['computeOrders','packQueue','waitingQueue','findLineByKey','orderOfLine','lineKey','patchLine','requeueChanges','requeueOrder','requeueAllCarried','scheduleUndo','undoAction','advanceAfterAction'];
const code=[helpers,'const PLATFORM_ORDER={emag:0,trendyol:1,vinted:2};',...names.map(grab)].join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

function world(opts={}){
  const NOW=Date.parse('2026-10-07T07:20:00Z');                     // 10:20 ora României, după resetul de 22:00 de ieri
  const calls=[],toasts=[];let failAt=opts.failAtCall||0,n=0;
  const mkC=(id,cid,extra={})=>({id,platforma:'emag',comanda_id:cid,client_nume:'C'+id,produs_id:id,produs_nume:'Produs '+id,cantitate:1,impachetat:false,impachetat_at:null,staff_blocked:false,staff_issue_resolved:false,
    staff_trimis_at:'2026-10-06T10:00:00Z',created_at:'2026-10-06T10:00:00Z',data:'2026-10-06',awb:'AWB'+id,...extra});
  const COMENZI=[mkC(1,'A1'),mkC(2,'A2'),mkC(3,'B3',{staff_blocked:true,staff_issue_type:'stoc_zero',staff_trimis_at:'2026-10-07T05:00:00Z'}),
                 mkC(4,'C4',{staff_trimis_at:'2026-10-07T06:00:00Z'})];   // C4 = deja „de azi" (nu e în așteptare)
  const JURNAL=[{id:9,data:'2026-10-06',product_id:9,product_name:'Vânzare directă',qty:1,staff_trimis_at:'2026-10-06T11:00:00Z',created_at:'2026-10-06T11:00:00Z',impachetat:false}];
  const env={
    COMENZI,JURNAL,ORDERS:[],lineBusy:{},pendingUndo:null,curKey:null,activeTab:'waiting',ISSUE_LABELS:{stoc_zero:'Stoc zero'},
    td:()=>'2026-10-07',renderMain(){},hideToast(){},logActivity(){},
    showToast:(m,u)=>toasts.push(m),
    confirm:m=>{calls.push(['confirm',m]);return opts.confirm!==false;},
    sb:async(m,p,b)=>{n++;if(failAt&&n===failAt)throw new Error('rețea');calls.push([m,p,b]);return[];},
    setTimeout:(f,t)=>0,clearTimeout(){},
    Date:class extends Date{constructor(...a){a.length?super(...a):super(NOW)}static now(){return NOW}},
    console:{error(){},warn(){}}
  };
  const keys=Object.keys(env);
  const api=new Function(...keys,code+';return {computeOrders,packQueue,waitingQueue,requeueOrder,requeueAllCarried,undoAction,get ORDERS(){return ORDERS},get pendingUndo(){return pendingUndo},get curKey(){return curKey},set curKey(v){curKey=v},set activeTab(v){activeTab=v}}')(...keys.map(k=>env[k]));
  api.computeOrders();
  return{api,calls,toasts,COMENZI,JURNAL};
}
const keysOf=l=>l.map(o=>o.comandaId||o.key).sort();
(async()=>{
  console.log('\n— Starea de pornire —');
  {const w=world();
   eq('în așteptare: A1, A2 (din ziua anterioară), B3 (problemă), vânzarea directă',keysOf(w.api.waitingQueue()),['A1','A2','B3','j9']);
   eq('în Împachetare: doar C4 (de azi)',keysOf(w.api.packQueue()),['C4']);}
  console.log('\n— Readu o comandă „din ziua anterioară" —');
  {const w=world();w.api.curKey=w.api.waitingQueue().find(o=>o.comandaId==='A1').key;await w.api.requeueOrder(w.api.curKey);
   const patch=w.calls.find(c=>c[0]==='PATCH');
   eq('scrie staff_trimis_at = acum pe comanda A1 (trimitere explicită)',[patch[1],patch[2].staff_trimis_at],['platforma_comenzi?id=eq.1','2026-10-07T07:20:00.000Z']);
   eq('A1 e acum în Împachetare, nu mai e în Așteptare',[keysOf(w.api.packQueue()).includes('A1'),keysOf(w.api.waitingQueue()).includes('A1')],[true,false]);
   eq('fără confirmare (nu are problemă raportată)',w.calls.some(c=>c[0]==='confirm'),false);
   eq('toast cu ANULEAZĂ',w.toasts.pop(),'↩ Comandă readusă în Împachetare');
   eq('de pe card: trece pe următoarea din Așteptare',keysOf(w.api.waitingQueue()).includes(w.api.ORDERS.find(o=>o.key===w.api.curKey)?.comandaId||'j9'),true);
   await w.api.undoAction();
   eq('ANULEAZĂ: A1 revine în Așteptare cu data veche',[keysOf(w.api.waitingQueue()).includes('A1'),w.COMENZI[0].staff_trimis_at],[true,'2026-10-06T10:00:00Z']);}
  {const w=world();await w.api.requeueOrder(w.api.waitingQueue().find(o=>o.comandaId==='A2').key);
   eq('apăsat din LISTĂ (curKey null): rămâne pe listă',w.api.curKey,null);}
  console.log('\n— Comandă cu problemă raportată —');
  {const w=world({confirm:false});await w.api.requeueOrder(w.api.waitingQueue().find(o=>o.comandaId==='B3').key);
   eq('confirmare refuzată: nimic nu se scrie',[w.calls.some(c=>c[0]==='PATCH'),keysOf(w.api.waitingQueue()).includes('B3')],[false,true]);
   eq('confirmarea numește problema',/Stoc zero/.test(w.calls.find(c=>c[0]==='confirm')[1]),true);}
  {const w=world();await w.api.requeueOrder(w.api.waitingQueue().find(o=>o.comandaId==='B3').key);
   const body=w.calls.find(c=>c[0]==='PATCH')[2];
   eq('problemă marcată rezolvată + retrimisă',[body.staff_blocked,body.staff_issue_resolved,!!body.staff_trimis_at],[false,true,true]);
   eq('B3 trece în Împachetare',keysOf(w.api.packQueue()).includes('B3'),true);
   await w.api.undoAction();
   eq('ANULEAZĂ: problema revine (blocată, nerezolvată), comanda iar în Așteptare',[w.COMENZI[2].staff_blocked,w.COMENZI[2].staff_issue_resolved,keysOf(w.api.waitingQueue()).includes('B3')],[true,false,true]);}
  console.log('\n— Vânzare directă (Jurnal) —');
  {const w=world();await w.api.requeueOrder(w.api.waitingQueue().find(o=>o.key==='j9').key);
   eq('scrie pe jurnal?id=eq.9',w.calls.find(c=>c[0]==='PATCH')[1],'jurnal?id=eq.9');
   eq('rândul din Jurnal e actualizat local (nu se pierde la recalcul)',w.JURNAL[0].staff_trimis_at,'2026-10-07T07:20:00.000Z');
   eq('vânzarea directă e acum în Împachetare',keysOf(w.api.packQueue()).includes('j9'),true);
   await w.api.undoAction();
   eq('ANULEAZĂ: revine în Așteptare cu data veche',[keysOf(w.api.waitingQueue()).includes('j9'),w.JURNAL[0].staff_trimis_at],[true,'2026-10-06T11:00:00Z']);}
  console.log('\n— În bloc —');
  {const w=world();await w.api.requeueAllCarried();
   eq('mută A1, A2 și vânzarea directă; B3 (cu problemă) RĂMÂNE în Așteptare',[keysOf(w.api.waitingQueue()),keysOf(w.api.packQueue())],[['B3'],['A1','A2','C4','j9']]);
   eq('o confirmare cu numărul (3)',/3 comenzi/.test(w.calls.find(c=>c[0]==='confirm')[1]),true);
   await w.api.undoAction();
   eq('ANULEAZĂ în bloc: toate 3 revin în Așteptare',keysOf(w.api.waitingQueue()),['A1','A2','B3','j9']);}
  {const w=world({confirm:false});await w.api.requeueAllCarried();
   eq('confirmare refuzată în bloc: nimic nu se scrie',w.calls.some(c=>c[0]==='PATCH'),false);}
  console.log('\n— Eroare la scriere —');
  {const w=world({failAtCall:2});await w.api.requeueAllCarried();                 // a doua scriere eșuează
   eq('eșec la a 2-a scriere: prima se restaurează, nu rămâne nimic pe jumătate',[keysOf(w.api.waitingQueue()),w.COMENZI[0].staff_trimis_at],[['A1','A2','B3','j9'],'2026-10-06T10:00:00Z']);
   eq('...cu mesaj de eroare',/Eroare/.test(w.toasts.pop()),true);}
  {const w=world({failAtCall:1});await w.api.requeueOrder(w.api.waitingQueue().find(o=>o.comandaId==='A1').key);
   eq('eșec la scriere pe o singură comandă: rămâne în Așteptare, cu mesaj de eroare',[keysOf(w.api.waitingQueue()).includes('A1'),/Eroare/.test(w.toasts.pop())],[true,true]);}
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE „READU ÎN ÎMPACHETARE” AU TRECUT');
  process.exit(failed?1:0);
})().catch(e=>{console.error('EROARE TEST',e);process.exit(1)});
