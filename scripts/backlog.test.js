#!/usr/bin/env node
/* Test al „Restanțe pe stoc" (Comenzi Platforme + Dashboard „De comandat"): produsele cu comenzi deschise și fără stoc, calculate din
   comenzi (cerut − stoc − pe drum), cu „Stoc zero" din Staff și comenzile furnizor. Funcțiile REALE din index.html, date sintetice
   (fără rețea, fără scrieri). Rulează: node scripts/backlog.test.js
   Opțional: node scripts/backlog.test.js --real <folder> rulează ACELAȘI calcul pe un instantaneu de producție (produse.json, pcom_open.json,
   setari.json, furnizor.json — citite doar în citire) și afișează rezumatul. */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const names=['parseQtyVal','qty','furnizorDeadlineInfo','pclTs','pcomLineIsApplied','pcomCurrentOrderSource','pcxBacklogData','pcxBacklogEnsureSources','pcxBacklogCount'];
const code='let pcxBlLoadAt=0;\n'+names.map(grab).join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
function world(o={}){
  const log=[];
  const env={
    sbReady:o.sbReady!==false,BACKLOG_SRC_LOADED:o.loaded!==false,
    P:o.P||[],PCOM:o.PCOM||[],STAFF_ISSUES:o.STAFF||[],FURNIZOR_ADMIN:o.FUR||[],state:{p:o.draft||[]},pcImpPlatforma:'emag',
    pcomRowById:id=>(o.PCOM||[]).find(r=>r.id===id),loadStaffIssues(){log.push('load');},console:{warn(){}}
  };
  const keys=Object.keys(env);
  const api=new Function(...keys,'let pcImpParsed=state.p;'+code+';return{pcxBacklogData,pcxBacklogCount,pcxBacklogEnsureSources}')(...keys.map(k=>env[k]));
  return{api,log};
}
const prod=(id,o={})=>({id,name:'Produs '+id,sku:'S'+id,supplier:'Verk',bought:'0',sold:'0',incomingQty:0,archived:false,...o});
const line=(pid,q,o={})=>({platforma:'emag',comandaId:'C'+Math.random().toString(36).slice(2,6),produsId:pid,cantitate:q,data:'2026-11-20',include:false,...o});
const pc=(id,pid,q,o={})=>({id,platforma:'emag',comandaId:'P'+id,produsId:pid,cantitate:q,data:'2026-11-18',createdAt:'2026-11-18T10:00:00Z',efecteAplicate:true,impachetat:false,anulata:false,...o});
const fz=(pid,com,sos=0,o={})=>({id:Math.floor(Math.random()*1e6),produs_id:pid,cantitate_comandata:com,cantitate_sosita:sos,finalizat:false,furnizor:'Verk',comanda_ref:'7',created_at:new Date(Date.now()-2*86400000).toISOString(),nu_a_sosit:false,nu_a_sosit_rezolvat:false,...o});

if(process.argv[2]==='--real'){
  const dir=process.argv[3],J=f=>JSON.parse(fs.readFileSync(path.join(dir,f),'utf8'));
  const num=v=>v==null?0:Number(v);
  const P=J('produse.json').map(r=>({id:r.id,name:r.name,sku:r.sku||'',supplier:r.supplier||'',bought:r.bought||0,sold:r.sold||0,incomingQty:r.incoming_qty||0,archived:!!r.archived}));
  const pcom=J('pcom_open.json').map(r=>({id:r.id,platforma:r.platforma,data:r.data,comandaId:r.comanda_id||'',produsId:r.produs_id,cantitate:num(r.cantitate),createdAt:r.created_at,efecteAplicate:r.efecte_aplicate!==false,impachetat:!!r.impachetat,anulata:!!r.anulata}));
  const st=Object.fromEntries(J('setari.json').map(s=>[s.key,s.value]));
  const draft=JSON.parse(st.pcom_import_draft).parsed;
  const staff=J('pcom_open.json').filter(r=>r.staff_blocked&&!r.staff_issue_resolved).map(r=>({table:'platforma_comenzi',id:r.id,comandaId:r.comanda_id||'',produsId:r.produs_id,cantitate:num(r.cantitate)||1,tip:r.staff_issue_type||'',ts:r.staff_blocked_at||''}));
  const w=world({P,PCOM:pcom,STAFF:staff,FUR:J('furnizor.json').filter(f=>!f.finalizat),draft});
  const d=w.api.pcxBacklogData();
  console.log('Produse cu restanță:',d.list.length,'| 🔴',d.cnt.nimic,'🟠',d.cnt.partial,'🟡',d.cnt.asteapta,'| de comandat:',d.cnt.buc,'buc | „De comandat" în Dashboard:',d.todo);
  d.list.filter(x=>x.stare!=='asteapta').forEach(x=>console.log(`  ${x.stare==='nimic'?'🔴':'🟠'} ${x.p.name.slice(0,44).padEnd(44)} cerut=${x.cerut} stoc=${x.stoc} pe_drum=${x.pedrum} → de comandat ${x.deComandat}`));
  process.exit(0);
}

console.log('\n— Cerut − stoc − pe drum —');
{const w=world({P:[prod(1),prod(2,{bought:'10',sold:'2'}),prod(3)],draft:[line(1,2),line(1,3),line(2,5),line(3,1)]});
 const d=w.api.pcxBacklogData(),by=Object.fromEntries(d.list.map(x=>[x.pid,x]));
 eq('stoc 0, 2 comenzi (2+3) → de comandat 5, 🔴 nimic comandat',[by[1].cerut,by[1].stoc,by[1].deComandat,by[1].stare],[5,0,5,'nimic']);
 eq('stoc 8, cerut 5 → acoperit, nu apare în listă',by[2],undefined);
 eq('rezumat: 2 în listă (1 și 3), 1 acoperit',[d.list.map(x=>x.pid).sort(),d.ok],[[1,3],1]);
 eq('Dashboard „De comandat" = produse 🔴+🟠',w.api.pcxBacklogCount(),2);}

console.log('\n— Marfa comandată la furnizor —');
{const w=world({P:[prod(1),prod(2),prod(3),prod(4)],draft:[line(1,5),line(2,5),line(3,5),line(4,5)],
  FUR:[fz(1,5),fz(2,2),fz(3,10,4),fz(4,6,0,{finalizat:true})]});
 const by=Object.fromEntries(w.api.pcxBacklogData().list.map(x=>[x.pid,x]));
 eq('comandat integral (5 din 5) → 🟡 așteaptă sosirea, de comandat 0',[by[1].stare,by[1].deComandat,by[1].pedrum],['asteapta',0,5]);
 eq('comandat parțial (2 din 5) → 🟠, rămân 3',[by[2].stare,by[2].deComandat],['partial',3]);
 eq('comandat 10, sosit 4 → pe drum 6 ≥ 5 → 🟡',[by[3].stare,by[3].pedrum],['asteapta',6]);
 eq('linie furnizor FINALIZATĂ nu mai contează → 🔴',[by[4].stare,by[4].deComandat],['nimic',5]);
 const w2=world({P:[prod(1,{incomingQty:2})],draft:[line(1,5)]});
 eq('câmpul manual „Drum" intră la pe drum (2 din 5 → 🟠, rămân 3)',(x=>[x.stare,x.pedrum,x.deComandat])(w2.api.pcxBacklogData().list[0]),['partial',2,3]);
 const w3=world({P:[prod(1)],draft:[line(1,5)],FUR:[fz(1,5,0,{nu_a_sosit:true})]});
 eq('„nu a sosit" raportat → marcat întârziat',w3.api.pcxBacklogData().list[0].furLate,true);
 const w4=world({P:[prod(1)],draft:[line(1,5)],FUR:[fz(1,5,0,{created_at:new Date(Date.now()-20*86400000).toISOString()})]});
 eq('termen (7 zile) depășit → întârziat chiar dacă nu e marcat',w4.api.pcxBacklogData().list[0].furLate,true);}

console.log('\n— Ce NU se numără —');
{const draft=[line(1,2,{amanat:true}),line(2,3,{newProduct:true}),line(3,4,{_cancelledId:9}),line(4,5),line(5,1),line(6,7,{_remoteGone:true,include:false}),line(7,2,{_remoteGone:true,include:true,_committedId:77})];
 const w=world({P:[prod(1),prod(2),prod(3),prod(4,{archived:true}),prod(5),prod(6),prod(7)],draft,
   PCOM:[pc(11,5,9,{efecteAplicate:true}),pc(12,5,9,{anulata:true}),pc(13,5,9,{impachetat:true})]});
 const by=Object.fromEntries(w.api.pcxBacklogData().list.map(x=>[x.pid,x]));
 eq('linia amânată SE numără (așteaptă marfă), marcată ⏸',[by[1].cerut,by[1].orders[0].tip],[2,'amanat']);
 eq('produs nou / linie anulată / produs arhivat → ignorate',[by[2],by[3],by[4]],[undefined,undefined,undefined]);
 eq('PCOM aplicat / anulat / împachetat nu se adaugă la cerut (doar linia din ciornă)',by[5].cerut,1);
 eq('comandă închisă pe platformă (De verificat: _remoteGone, necomisă) → nu e restanță',by[6],undefined);
 eq('dar una _remoteGone deja comisă/inclusă rămâne în calcul',by[7]&&by[7].cerut,2);}

console.log('\n— „Stoc zero" din Staff —');
{const staff=(id,pid,q,tip='stoc_zero')=>({table:'platforma_comenzi',id,comandaId:'X'+id,produsId:pid,cantitate:q,tip,ts:'2026-11-19T10:00:00Z'});
 const w=world({P:[prod(1),prod(2,{bought:'3',sold:'0'}),prod(3)],PCOM:[pc(21,1,2),pc(22,1,3),pc(23,3,1,{efecteAplicate:false})],
   STAFF:[staff(21,1,2),staff(22,1,3),staff(23,3,1),staff(24,1,1,'cantitate_insuficienta')],draft:[{...line(3,1,{comandaId:'P23'}),_committedId:23}]});
 const by=Object.fromEntries(w.api.pcxBacklogData().list.map(x=>[x.pid,x]));
 eq('2 comenzi aplicate raportate „Stoc zero" (2+3) → cerut 5, din care 5 Staff, 🔴',[by[1].cerut,by[1].staff,by[1].stare],[5,5,'nimic']);
 eq('„cantitate insuficientă" nu se numără (doar stoc zero)',by[1].orders.length,2);
 eq('comandă NEaplicată și raportată Staff: numărată o singură dată (nu 2)',[by[3].cerut,by[3].staff],[1,0]);
 const w2=world({P:[prod(1,{bought:'5',sold:'0'})],PCOM:[pc(21,1,2)],STAFF:[staff(21,1,2)]});
 eq('a venit stoc (5 ≥ 2 raportate) → restanța dispare singură',w2.api.pcxBacklogData().list.length,0);}

console.log('\n— Surse neîncărcate / ordonare —');
{const w=world({P:[prod(1)],draft:[line(1,2)],loaded:false});
 eq('comenzile furnizor neîncărcate → nu e „ready", fără număr (null), cerere de încărcare o singură dată',[w.api.pcxBacklogData().ready,w.api.pcxBacklogCount(),w.api.pcxBacklogCount(),w.log],[false,null,null,['load']]);
 const w2=world({P:[prod(1),prod(2),prod(3),prod(4)],draft:[line(1,2),line(2,9),line(3,4),line(4,4)],FUR:[fz(3,4),fz(4,1)]});
 eq('ordine: 🔴 (cel mai mare primul) → 🟠 → 🟡',w2.api.pcxBacklogData().list.map(x=>[x.pid,x.stare]),[[2,'nimic'],[1,'nimic'],[4,'partial'],[3,'asteapta']]);
 eq('totaluri: 2 + 9 (🔴) + 3 (🟠) = 14 buc. de comandat',w2.api.pcxBacklogData().cnt,{nimic:2,partial:1,asteapta:1,buc:14});}
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE „RESTANȚE PE STOC" AU TRECUT');
process.exit(failed?1:0);
