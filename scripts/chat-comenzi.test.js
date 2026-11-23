#!/usr/bin/env node
/* Test „Comenzi pe produs" în Asistentul AI (Update #764) — funcțiile REALE din index.html; AI-ul și baza de date sunt simulate.
   Verifică: recunoașterea produsului din cod / nume / poză (inclusiv produse arhivate și cazurile nesigure), numărătoarea
   comenzilor pe stări (bază de date + previzualizare, fără dublări), mesajul scris de cod, link-urile din chat și că
   textul/numele din date nu poate sparge HTML-ul. Rulează: node scripts/chat-comenzi.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grabFn=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const slice=(a,b)=>{const i=src.indexOf(a),j=src.indexOf(b,i);if(i<0||j<0)throw new Error('marcaj lipsă: '+(i<0?a:b));return src.slice(i,j);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

(async()=>{
/* ── lumea simulată ── */
const P=[
  {id:1,name:'Stație radio portabilă CB walkie talkie',sku:'WT-100',ean:'5902802907004',internalCode:'AB-0001',img:'u1',bought:20,sold:5,archived:false,supplierSources:[{sku:'FURN-77'}]},
  {id:2,name:'Pistol de masaj muscular profesional',sku:'PM-5',ean:'',internalCode:'AB-0002',img:'u2',bought:10,sold:10,archived:false,supplierSources:[]},
  {id:3,name:'Pistol de masaj muscular mini',sku:'PM-6',ean:'',internalCode:'AB-0003',img:'u3',bought:4,sold:0,archived:false,supplierSources:[]},
  {id:4,name:'Cort pentru copii rotund',sku:'CORT-9',ean:'',internalCode:'AB-0004',img:'u4',bought:3,sold:3,archived:true,supplierSources:[]},
  {id:5,name:'Umeraș catifelat',sku:'',ean:'',internalCode:'AB-0005',img:'',bought:50,sold:1,archived:false,supplierSources:[]}
];
const SYNCM=[{platforma:'emag',idExtern:'DX12345AB',produsId:2,confirmat:true,componente:[]},{platforma:'trendyol',idExtern:'998877665',produsId:1,confirmat:false,componente:[]}];
// rânduri din baza de date (forma brută, cu coloane snake_case) pentru produsul 1
const dbRows=[
  {id:101,platforma:'emag',data:'2026-11-20',comanda_id:'1111111111',cantitate:2,produs_id:1,impachetat:false,anulata:false,staff_trimis_at:'2026-11-20T09:00:00Z',awb:'',pnk:'DXYZ'},
  {id:102,platforma:'trendyol',data:'2026-11-18',comanda_id:'TY-55',cantitate:1,produs_id:1,impachetat:true,anulata:false,awb:'AWB123'},
  {id:103,platforma:'emag',data:'2026-10-02',comanda_id:'2222222222',cantitate:1,produs_id:1,impachetat:false,anulata:true},
  {id:104,platforma:'emag',data:'2026-11-22',comanda_id:'3333333333',cantitate:3,produs_id:1,impachetat:false,anulata:false,staff_blocked:true,staff_issue_type:'stoc_zero',staff_issue_resolved:false},
  {id:105,platforma:'vinted',data:'2026-11-21',comanda_id:'<img src=x onerror=alert(1)>',cantitate:1,produs_id:1,impachetat:false,anulata:false},
  // aceeași comandă, 2 linii cu același produs (ex. variante) → un singur rând, cantitățile însumate
  {id:106,platforma:'emag',data:'2026-11-10',comanda_id:'8888888888',cantitate:1,produs_id:1,impachetat:true,anulata:false},
  {id:107,platforma:'emag',data:'2026-11-10',comanda_id:'8888888888',cantitate:2,produs_id:1,impachetat:true,anulata:false,awb:'AWB-8'}
];
const pcImpParsed=[
  {produsId:1,platforma:'emag',comandaId:'4444444444',cantitate:2,data:'2026-11-23',include:false},                       // nouă, în previzualizare
  {produsId:1,platforma:'emag',comandaId:'1111111111',cantitate:2,_committedId:101,include:true},                          // deja în bază (101) — NU se numără a doua oară
  {produsId:1,platforma:'emag',comandaId:'5555555555',cantitate:1,_remoteGone:Date.now(),include:false},                  // închisă pe platformă
  {produsId:1,platforma:'emag',comandaId:'6666666666',cantitate:5,_cancelledId:9},                                       // anulată local — nu se numără
  {produsId:2,platforma:'emag',comandaId:'7777777777',cantitate:1,include:false}
];
const persisted=[];let aiChatContext=null;
const env={
  P,SYNCM,PCOM:[],pcImpParsed,pcImpPlatforma:'emag',syncMapsLoaded:true,loadSyncMappings:async()=>{},sbReady:true,
  pcomPlatLabel:p=>p==='trendyol'?'Trendyol':p==='vinted'?'Vinted':'eMAG',
  qty:p=>Math.max(0,p.bought-p.sold),fmtQty:n=>String(Math.round(n*100)/100),esc:s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'),
  dbGetAll:async(...a)=>env._dbGetAll(...a),_dbGetAll:async()=>dbRows.slice(),
  aiResolvePerioada:()=>({dataStart:'2026-10-01',dataEnd:'2026-11-23'}),aiQtySold:()=>({cantitate:4,sursa:'jurnal'}),AI_SURSA_LABEL:{jurnal:'Jurnal vânzări'},
  pxcUnused:null,pcxBacklogData:()=>env._bl(),_bl:()=>({ready:true,list:[{pid:1,cerut:12,stoc:15,pedrum:3,deComandat:0}]}),
  aiChatSetStep:()=>{},aiChatPersist:async(rol,continut,tip)=>{persisted.push({rol,continut,tip});},aiChatEnsureHistory:async()=>{},renderAiChat:()=>{},
  aiChatBusy:false,aiChatStepsLog:[],aiChatCurStep:'',
  productImageTag:(p,cls)=>`<img class="${cls}" data-p="${p.id}">`,PRODUCT_IMAGE_PLACEHOLDER:'x',openModal:()=>{},
  aiChatProductPicHtml:id=>`<pic ${id}>`,aiChatSalesChartHtml:()=>'<chart>',
  // AI simulat
  _vision:{coduri:[],nume:null},_visualConfirm:[],
  callAI:async(...a)=>env._callAI(...a),_callAI:async()=>JSON.stringify(env._vision),
  aiCompareProductImages:async(img,cands)=>cands.filter(c=>env._visualConfirm.includes(c.id)).map(c=>({...c,confirmatVizual:true}))
};
// funcții REALE
const realNames=['stripDiacritics','aiOrdersNameFromText','aiOrdersNorm','aiOrdersCodesFromText','aiOrdersFindByCode','aiOrdersNameCandidates','aiOrdersReadImage','aiOrdersResolve','aiOrdersStatusOfRow','aiOrdersFetch','aiOrdersLookup','aiOrdersTok','aiOrdersBuildMessage','aiChatOrdersReply','aiOrdersAmbiguMessage','aiChatRunOrdersLookup','aiChatFormatMsgHtml','aiChatPickProductHtml','dbToPcom','pcxFmtShortDate','fuzzyMatch','productMatchText','fmNumbers','fmTokens'];
const consts=slice('const AI_ORDERS_IMG_SCHEMA','const aiOrdersNorm')+'\n'+slice('const AI_ORDERS_STOP','function aiOrdersNameFromText')+'\n'+slice('const AI_ORDERS_STARI','function aiOrdersStatusOfRow')+'\n'+'const aiOrdersNorm=s=>String(s==null?\'\':s).toLowerCase().replace(/[^a-z0-9]/g,\'\');\nconst aiOrdersPl=n=>`${n} ${n===1?\'comandă\':\'comenzi\'}`;\nconst aiOrdersBuc=n=>`${Math.round(n*100)/100} buc.`;\n'
  +slice('const FM_STOP','function fmNumbers');
const code=`let aiChatContext=null;${consts}\n${realNames.filter(n=>n!=='aiOrdersNorm').map(n=>{try{return grabFn(n);}catch(e){return'';}}).join('\n')}\nreturn{${realNames.join(',')},getCtx:()=>aiChatContext}`;
const names=Object.keys(env);
const A=new Function(...names,code)(...names.map(n=>env[n]));

console.log('\n— Coduri dintr-un text —');
eq('cod EAN + cuvinte → doar codul',A.aiOrdersCodesFromText('câte comenzi avem cu 5902802907004 în sistem?'),['5902802907004']);
eq('un an, o cantitate și o zi NU sunt coduri',A.aiOrdersCodesFromText('am 12 buc din 2026, pe 23.11'),[]);
eq('SKU cu cratimă',A.aiOrdersCodesFromText('comenzi pentru WT-100'),['WT-100']);
eq('cuvinte fără cifre nu sunt coduri',A.aiOrdersCodesFromText('statie radio portabila'),[]);

console.log('\n— Găsirea produsului după cod —');
eq('SKU (fără diferență de majuscule/cratimă)',A.aiOrdersFindByCode('wt100').map(r=>[r.produsId,r.via]),[[1,'SKU']]);
eq('EAN',A.aiOrdersFindByCode('5902802907004').map(r=>r.produsId),[1]);
eq('cod intern',A.aiOrdersFindByCode('AB-0002').map(r=>r.produsId),[2]);
eq('cod de furnizor',A.aiOrdersFindByCode('FURN-77').map(r=>r.produsId),[1]);
eq('codul listării de pe platformă (mapare confirmată)',A.aiOrdersFindByCode('DX12345AB').map(r=>[r.produsId,r.via]),[[2,'cod eMAG']]);
eq('mapare NEconfirmată nu se ia în seamă',A.aiOrdersFindByCode('998877665'),[]);
eq('produs ARHIVAT se găsește (comenzi istorice)',A.aiOrdersFindByCode('CORT-9').map(r=>r.produsId),[4]);
eq('cod prea scurt / necunoscut → nimic',[A.aiOrdersFindByCode('ab').length,A.aiOrdersFindByCode('NU-EXISTA-1').length],[0,0]);

console.log('\n— Recunoașterea produsului (text, cod, poză) —');
let r=await A.aiOrdersResolve({text:'câte comenzi avem cu WT-100?'});
eq('cod în text → produs sigur, fără apel AI',[r.status,r.produs&&r.produs.id],['ok',1]);
r=await A.aiOrdersResolve({text:'',intent:{produsCod:'5902802907004'}});
eq('cod din clasificator → produs sigur',[r.status,r.produs&&r.produs.id],['ok',1]);
r=await A.aiOrdersResolve({text:'',intent:{produsNume:'Pistol de masaj muscular profesional'}});
eq('nume aproape exact → un singur produs',[r.status,r.produs&&r.produs.id],['ok',2]);
r=await A.aiOrdersResolve({text:'',intent:{produsNume:'pistol de masaj muscular'}});
eq('nume care se potrivește cu 2 produse → NU ghicește, cere alegerea',[r.status,r.candidati.map(c=>c.id).sort()],['ambiguu',[2,3]]);
r=await A.aiOrdersResolve({text:'',intent:{produsNume:'nimic de genul asta existent'}});
eq('nume fără potrivire → negăsit, cu mesaj',[r.status,typeof r.motiv],['negasit','string']);
env._vision={coduri:['5902802907004'],nume:'stație radio'};
r=await A.aiOrdersResolve({text:'comenzi?',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('poză cu COD vizibil → produs sigur (cod are prioritate față de aspect)',[r.status,r.produs&&r.produs.id],['ok',1]);
env._vision={coduri:[],nume:'pistol de masaj muscular'};env._visualConfirm=[2];
r=await A.aiOrdersResolve({text:'',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('poză fără cod, confirmată vizual pe UN produs → ok',[r.status,r.produs&&r.produs.id,r.via],['ok',2,'poza seamănă cu produsul din stoc']);
env._visualConfirm=[2,3];
r=await A.aiOrdersResolve({text:'',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('poză confirmată pe 2 produse → alegi tu',[r.status,r.candidati.map(c=>c.id).sort()],['ambiguu',[2,3]]);
env._visualConfirm=[];
r=await A.aiOrdersResolve({text:'',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('poză neconfirmată de comparația vizuală → candidați „posibil”, nu alege singur',[r.status,r.candidati.every(c=>/posibil/.test(c.nota))],['ambiguu',true]);
env._vision={coduri:[],nume:null};
r=await A.aiOrdersResolve({text:'',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('poză din care nu se recunoaște nimic → negăsit',[r.status],['negasit']);
env._callAI=async()=>{throw new Error('AI indisponibil');};
r=await A.aiOrdersResolve({text:'WT-100',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('AI indisponibil, dar codul din text există → tot funcționează',[r.status,r.produs&&r.produs.id],['ok',1]);
env._callAI=async()=>JSON.stringify(env._vision);

console.log('\n— Fără nume în text: nu inventează un produs —');
eq('„câte comenzi avem pentru produsul ăsta?” nu conține niciun nume',A.aiOrdersNameFromText('câte comenzi avem pentru produsul ăsta?'),'');
eq('„ce comenzi avem cu poza asta” nu conține niciun nume',A.aiOrdersNameFromText('ce comenzi avem cu poza asta'),'');
eq('un nume real se păstrează, fără umplutură',A.aiOrdersNameFromText('câte comenzi avem pentru umeraș catifelat?'),'umeras catifelat');
eq('un singur cuvânt scurt nu e destul („asta”, „set”)',[A.aiOrdersNameFromText('comenzi set'),A.aiOrdersNameFromText('asta')],['','']);
eq('un singur cuvânt lung e destul („pistol”… dar nu „cort”)',[A.aiOrdersNameFromText('comenzi umerase'),A.aiOrdersNameFromText('comenzi cort')],['umerase','']);
r=await A.aiOrdersResolve({text:'câte comenzi avem pentru produsul ăsta?'});
eq('fără cod, nume sau poză → cere detalii (negăsit), nu ghicește',[r.status,/scrie codul/.test(r.motiv)],['negasit',true]);
env._vision={coduri:[],nume:null};
r=await A.aiOrdersResolve({text:'câte comenzi avem pentru produsul din poză?',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('poză din care AI nu înțelege nimic + text fără nume → negăsit, fără produs inventat',[r.status,/nu am putut recunoaște/i.test(r.motiv)],['negasit',true]);
env._vision={coduri:[],nume:'pistol de masaj muscular'};env._visualConfirm=[];
r=await A.aiOrdersResolve({text:'',imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('mesaj după poză: „din poză am înțeles …” doar când numele vine din poză',/^Din poză am înțeles „pistol de masaj muscular”/.test(r.motiv),true);
r=await A.aiOrdersResolve({text:'',intent:{produsNume:'pistol de masaj muscular'},imageDataUrl:'data:image/jpeg;base64,'+'A'.repeat(200)});
eq('nume scris de tine + poză neconfirmată: „am căutat …”, nu pretinde că a recunoscut din poză',/^Am căutat „pistol de masaj muscular”/.test(r.motiv),true);

console.log('\n— Comenzile produsului —');
const L=await A.aiOrdersLookup(1);
eq('sursa = baza de date',L.sursa,'baza de date');
eq('stări: 1 în previzualizare, 1 închisă pe platformă, 2 confirmate, 1 în Staff, 2 împachetate (una cu 2 linii), 1 anulată',
  Object.fromEntries(Object.entries(L.byState).map(([k,v])=>[k,v.comenzi.size])),{staff:1,impachetata:2,anulata:1,confirmata:2,preview:1,inchisa:1});
eq('linia din previzualizare deja în bază (_committedId) NU se numără dublu; anulata local nu intră',L.items.filter(x=>x.comandaId==='1111111111').length,1);
eq('total comenzi distincte = 8 (6 din bază + 2 noi din previzualizare); cele 2 linii ale aceleiași comenzi = 1 comandă',L.total.comenzi,8);
eq('2 linii ale aceleiași comenzi → un singur rând, cantitate însumată (3) și AWB păstrat',L.items.filter(x=>x.comandaId==='8888888888').map(x=>[x.cantitate,x.awb]),[[3,'AWB-8']]);
eq('total bucăți = (2+1+1+3+1+3) din bază + (2+1) din previzualizare = 14',L.total.bucati,14);
eq('cele deschise vin primele; împachetatele/anulatele la urmă',L.items.map(x=>x.stare).slice(-2).sort(),['anulata','impachetata']);
eq('Stoc zero raportat de Staff apare ca avertisment pe comandă',L.items.find(x=>x.comandaId==='3333333333').note,['⚠ Stoc zero raportat de Staff']);
eq('pe platforme: eMAG 6, Trendyol 1, Vinted 1',Object.fromEntries(Object.entries(L.byPlat).map(([k,v])=>[k,v.size])),{emag:6,trendyol:1,vinted:1});
env._dbGetAll=async()=>{throw new Error('offline');};
const Loff=await A.aiOrdersLookup(2);
eq('fără baza de date: se folosește memoria aplicației și se spune asta',[Loff.sursa.includes('memoria aplicației'),Loff.total.comenzi],[true,1]);
env._dbGetAll=async()=>dbRows.slice();

console.log('\n— Mesajul din chat —');
const msg=A.aiOrdersBuildMessage(P[0],L,'SKU „WT-100”');
eq('titlu cu produs, SKU, stoc',msg.split('\n')[0],'**Stație radio portabilă CB walkie talkie** · SKU WT-100 · stoc acum **15 buc.**');
eq('poza produsului',msg.includes('\n[[poza:1]]\n'),true);
eq('total și pe platformă',msg.includes('- În sistem: **8 comenzi** (14 buc.) — eMAG 6 · Trendyol 1 · Vinted 1'),true);
eq('deschise: 5 comenzi, 9 buc.; stocul (15) le acoperă',/Deschise \(de rezolvat\): \*\*5 comenzi\*\* · 9 buc\. — stocul le acoperă/.test(msg),true);
eq('restanță deja acoperită de comenzile la furnizor → spune că e acoperită, nu „de comandat 0”',msg.includes('Restanță pe stoc deja acoperită: cerut 12, în stoc 15, pe drum 3 (comandat la furnizor, așteaptă sosirea)'),true);
env._bl=()=>({ready:true,list:[{pid:1,cerut:12,stoc:5,pedrum:3,deComandat:4}]});
eq('restanță reală → cât trebuie comandat',A.aiOrdersBuildMessage(P[0],L,'x').includes('Restanță pe stoc: cerut 12, în stoc 5, pe drum 3 → de comandat **4 buc.**'),true);
env._bl=()=>({ready:false,list:[]});
eq('restanțele încă neîncărcate → fără linie de restanță (nu inventează)',A.aiOrdersBuildMessage(P[0],L,'x').includes('Restanță'),false);
env._bl=()=>({ready:true,list:[{pid:1,cerut:12,stoc:15,pedrum:3,deComandat:0}]});
eq('fiecare comandă are link către Comenzi Platforme',msg.includes('[[ord:emag|1111111111]]')&&msg.includes('[[ord:trendyol|TY-55]]'),true);
eq('id de comandă cu caractere periculoase NU devine token (rămâne text simplu)',msg.includes('[[ord:vinted|<img'),false);
eq('butonul „Deschide în Comenzi Platforme"',msg.includes('\n[[pcom:1]]\n'),true);
const html=A.aiChatFormatMsgHtml(msg);
eq('HTML: link-urile de comandă sunt generate',html.includes("aiChatOpenOrder('emag','1111111111')"),true);
eq('HTML: id-ul periculos e escapat, nu devine element',html.includes('<img src=x')||html.includes('onerror=alert(1)>'),false);
eq('HTML: butonul spre comenzile produsului',html.includes('aiChatOpenProductOrders(1)'),true);
const empty=A.aiOrdersBuildMessage(P[4],{sursa:'baza de date',items:[],total:{comenzi:0,bucati:0},byState:{},byPlat:{}},'nume');
eq('produs fără nicio comandă → spune clar, cu vânzările recente',empty.includes('Nu am găsit nicio comandă')&&empty.includes('Vândut totuși în ultimele 90 de zile'),true);
const amb=A.aiOrdersAmbiguMessage({motiv:'Alege:',candidati:[{id:2,nota:'posibil [x]|\nrău'},{id:3,nota:''}]});
eq('mesaj cu candidați: o linie [[alege]] per candidat, nota curățată',amb.split('\n'),['Alege:','[[alege:2|posibil  x   rău]]','[[alege:3|]]']);
const ah=A.aiChatFormatMsgHtml(amb);
eq('HTML: carduri cu poză + buton „Comenzi” pe fiecare candidat',[(ah.match(/class="aic-alege"/g)||[]).length,ah.includes('aiChatOrdersForProduct(2)'),ah.includes('aiChatOrdersForProduct(3)')],[2,true,true]);

console.log('\n— Fluxul complet (rezolvare → răspuns salvat în chat) —');
persisted.length=0;env._vision={coduri:[],nume:null};
await A.aiChatRunOrdersLookup({text:'comenzi pentru WT-100',intent:null});
eq('produs sigur → un singur mesaj de asistent, cu tipul „comenzi_produs”',[persisted.length,persisted[0].rol,persisted[0].tip,persisted[0].continut.startsWith('**Stație radio')],[1,'asistent','comenzi_produs',true]);
eq('contextul activ al chatului devine produsul găsit',A.getCtx(),{nume:'Stație radio portabilă CB walkie talkie',produsId:1});
persisted.length=0;
await A.aiChatRunOrdersLookup({text:'',intent:{produsNume:'pistol de masaj muscular'}});
eq('produs nesigur → mesaj cu candidați (tip „comenzi_produs”), nu un răspuns ghicit',[persisted[0].tip,persisted[0].continut.includes('[[alege:2|')&&persisted[0].continut.includes('[[alege:3|')],['comenzi_produs',true]);
persisted.length=0;
await A.aiChatRunOrdersLookup({text:'',intent:{produsNume:'zzz qqq'}});
eq('produs negăsit → mesaj de eroare, tip „eroare”',[persisted[0].tip],['eroare']);

/* ── integrarea în restul Asistentului (verificări pe cod) ── */
console.log('\n— Integrare —');
eq('clasificatorul cunoaște tipul „comenzi_produs”',/enum:\[[^\]]*'comenzi_produs'[^\]]*\]/.test(src),true);
eq('aiChatSend are ramura „comenzi_produs” înaintea identificării ieftine din poză',/else if\(intent\.tip==='comenzi_produs'\)\{[\s\S]{0,300}aiChatRunOrdersLookup/.test(src)&&/intent\.tip!=='comenzi_produs'&&!intent\.produsNume/.test(src),true);
eq('butonul 🔎 există în tab și în pop-up',['tab','popup'].every(s=>src.includes(`aiChatOrdersFromInput('${s}')`)&&src.includes(`id="aic-orders-img-${s}"`)),true);
eq('dosarul produsului primește butonul „Vezi comenzile”',/\[\[comenzi:\$\{aiChatContext\.produsId\}\]\]/.test(src),true);
console.log('\n— Cardul de candidat nu se deformează —');
{
  // bug real (Update #764, pop-up îngust): butonul avea clasa aic-sim-btn (width:100%) iar suprascrierea width:auto era mai sus în fișier → butonul
  // ocupa tot rândul flex și strivea numele produsului într-o coloană de câteva litere
  const css=src.slice(src.indexOf('.aic-alege{'),src.indexOf('.aic-alege{')+1500);
  eq('butonul cardului NU mai folosește aic-sim-btn (width:100%)',/class="btn aic-alege-btn"/.test(A.aiChatPickProductHtml(2,'x'))&&!/aic-sim-btn/.test(A.aiChatPickProductHtml(2,'x')),true);
  eq('regula butonului are specificitate mai mare și lățime automată, fără micșorare',/\.aic-alege \.aic-alege-btn\{[^}]*flex:0 0 auto;[^}]*width:auto;[^}]*white-space:nowrap/.test(css),true);
  eq('textul cardului ia restul rândului și se poate îngusta fără să iasă din card',/\.aic-alege-tx\{[^}]*flex:1 1 0;[^}]*min-width:0/.test(css),true);
}
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE „COMENZI PE PRODUS” AU TRECUT');
process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
