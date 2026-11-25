#!/usr/bin/env node
/* Test „Comanda e unitatea" (Update #775) — funcțiile REALE din index.html și staff.html:
   Admin: awbLotFromText, awbSearchBlobFromText, pcomOrderCompleteness/pcomIncompleteOrders, pcomStockZeroCandidates, togglePcomInclude (include și surorile);
   Staff: căutarea (searchTokens, orderSearchIndex, matchDetailOrder), numărul din lot din numele fișierului, comenzi incomplete.
   Rulează: node scripts/staff-order-unit.test.js */
const fs=require('fs'),path=require('path');
const adm=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const stf=fs.readFileSync(path.join(__dirname,'..','staff.html'),'utf8');
const grabFrom=(src,n)=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

(async()=>{
/* ───────── Admin: etichete ───────── */
console.log('\n— Numărul din lot de pe etichetă (N/M) —');
{
  const names=['awbSplitKV','awbPhonesInLines','awbLotFromText','awbSearchBlobFromText'];
  const api=new Function("const AWB_NOISE_PHONES=['0216370660'];"+names.map(n=>grabFrom(adm,n)).join('\n')+';return{awbLotFromText,awbSearchBlobFromText}')();
  const L=api.awbLotFromText;
  // texte în forma reală: rânduri extrase de pdf.js (verificat pe etichete reale: „7/43” în colțul de jos-dreapta)
  eq('eMAG Courier: „7/43” în colț',L('AWB Date: 24.11.2026\nPackage value: 0.00 EUR\n012EMGXL23960294001\n012EMGXL23960294001_1027849694_16430789\n7/43','007_1027849694_eMAG_Courier_012EMGXL23960294001.pdf'),'7/43');
  eq('marcajul de rută „---6/9---” (lipit de liniuțe) NU se ia drept lot',L('BV_BRASOV_H02\n---6/9---\nBV 6\n7/43',''),'7/43');
  eq('colet unic „1 / 1” (Sameday) → fără lot',L('Piece 1 / 1\nWeight 0.20 Kg\nEnvelope',''),'');
  eq('data „24/11/2026” și „24/11” NU sunt lot',L('Data: 24/11/2026\nLivrare 24/11',''),'');
  eq('greutate „1/0.000167/1 KG” NU e lot',L('1/0.000167/1 KG\nPiese: 1/1 Plic: 0',''),'');
  eq('două fracții: se alege cea care coincide cu numărul din numele fișierului (015)',L('15/68\n22/57','015_580692801_Cargus_1213467798.pdf'),'15/68');
  eq('două fracții, fără nume cu număr: ultima din text (colțul de jos)',L('22/57\n15/68',''),'15/68');
  eq('fără fracție în text: doar numărul din numele fișierului („7”), fără total',L('fără număr','007_ceva.pdf'),'7');
  eq('fără nimic → gol',L('nimic aici','Unknown-61.pdf'),'');
  eq('N > M nu e lot (ex. 24/11 = dată)',L('24/11',''),'');
  eq('„01 - 1027926767_…” (numerotarea veche cu liniuță)',L('','01 - 1027926767_Sameday_012EMGXB23831745001.pdf'),'1');

  console.log('\n— Textul de căutare de pe etichetă —');
  const B=api.awbSearchBlobFromText;
  eq('Cargus: destinatar + telefon întreg (național și +40 → același număr)',B('Expeditor: AB HOMES INVEST SRL\nDestinatar: Ion Popescu\nTelefon +40 712 345 678\nAWB 1214217869'),'Ion Popescu | 0712345678');
  eq('eMAG: coada mascată a destinatarului („***2055”), fără cea a expeditorului („AB HOMES … ***0109”)',B('AB HOMES INVEST SRL / ***0109\nНикола Г?*** / ***2055\n012EMGXL23960294001'),'*2055');
  eq('antetul curierului „Tel/Fax +40 21 637 0660” (pe TOATE etichetele eMAG) nu intră',B('DELIVERY SOLUTIONS S.A.\nBucuresti Sectorul 2, Str. GARA HERASTRAU, Nr. 6\nTel/Fax +40 21 637 0660\nNikola G?*** / ***2055'),'*2055');
  eq('numărul curierului nu intră nici dacă apare pe alt rând',B('Contact 0216370660\nDestinatar: Ana Pop'),'Ana Pop');
  eq('fără date → gol',B('AWB Date: 24.11.2026\nWeight 1 KG'),'');
  eq('nume mascat (cu „***”) nu intră',B('Destinatar: Ion P***'),'');
}

/* ───────── Admin: comanda e unitatea ───────── */
console.log('\n— Comanda ca unitate: completitudine, bifare, AWB —');
{
  const world=(lines)=>{
    const log={commits:[],toasts:[]};
    const env={pcImpParsed:lines,pcImpPlatforma:'emag',
      renderPcomImportPreview:()=>{},toast:(m,t)=>log.toasts.push(m),
      syncPcomLineCommitState:async(i,send)=>{log.commits.push(i);},
      pcomPlatLabel:p=>p,esc:x=>String(x)};
    const names=Object.keys(env);
    const code=['pcomOrderKeyOf','pcomOrderSiblingIdxs','pcomLineIncludable','pcomIncludableSiblings','pcomOrderCompleteness','togglePcomInclude','pcomIncludeRestOfOrder','pcomIncompleteOrders'].map(n=>grabFrom(adm,n)).join('\n')+';return{pcomOrderKeyOf,pcomOrderSiblingIdxs,pcomLineIncludable,pcomOrderCompleteness,togglePcomInclude,pcomIncludeRestOfOrder,pcomIncompleteOrders}';
    return{api:new Function(...names,code)(...names.map(n=>env[n])),log};
  };
  const ln=(id,pid,extra)=>({platforma:'emag',comandaId:id,produsId:pid,include:false,cantitate:5,titluExtern:'Produs '+pid,...extra});
  {
    // cazul real 582542584: 2 produse, o linie inclusă, cealaltă nu
    const L=[ln('582542584',435,{include:true,_committedId:1}),ln('582542584',357)];
    const {api}=world(L);
    const inc=api.pcomIncompleteOrders();
    eq('comanda cu 1 din 2 linii incluse e INCOMPLETĂ (lipsește al doilea produs)',inc.map(o=>[o.id,o.inc,o.total,o.missing.length,o.fixable]),[['582542584',1,2,1,true]]);
    await api.pcomIncludeRestOfOrder('emag|582542584');
    eq('„Include restul” include și trimite linia lipsă',[L[1].include,L.every(x=>x.include)],[true,true]);
    eq('după aceea comanda nu mai e incompletă',world(L).api.pcomIncompleteOrders().length,0);
  }
  {
    // bifarea unei linii include toată comanda
    const L=[ln('A',1),ln('A',2),ln('A',3,{amanat:true}),ln('B',9)];
    const {api,log}=world(L);
    await api.togglePcomInclude(0);
    eq('bifarea liniei 0 include și linia 1 (cu produs), dar NU pe cea amânată și NU altă comandă',L.map(x=>x.include),[true,true,false,false]);
    eq('ambele linii s-au trimis la scriere în Staff',log.commits.sort(),[0,1]);
    eq('avertizează că rămâne un produs neinclus (amânat)',log.toasts.some(t=>/Comanda se trimite întreagă/.test(t)),true);
  }
  {
    // linie fără produs: nu se poate include → comanda rămâne incompletă, cu motivul
    const L=[ln('C',1,{include:true,_committedId:7}),ln('C',null)];
    const o=world(L).api.pcomIncompleteOrders()[0];
    eq('linia fără produs ales: lipsește, cu motiv, și nu se poate completa automat',[o.missing[0].why,o.fixable],['fără produs ales',false]);
  }
  {
    // comandă întreagă neinclusă sau complet inclusă = nu e „incompletă”
    const L=[ln('D',1),ln('D',2),ln('E',3,{include:true}),ln('E',4,{include:true})];
    eq('complet neinclusă sau complet inclusă → nu apare ca incompletă',world(L).api.pcomIncompleteOrders().length,0);
  }
  {
    // aceeași comandă pe platforme diferite NU se amestecă
    const L=[ln('777',1,{include:true,_committedId:1}),ln('777',2,{platforma:'trendyol'})];
    eq('număr de comandă identic pe eMAG și Trendyol = comenzi diferite, nu surori',world(L).api.pcomIncompleteOrders().length,0);
  }
}

/* ───────── Admin: stoc zero rezolvat de stoc ───────── */
console.log('\n— „Stoc zero” depășit de stoc adăugat —');
{
  const AFTER='2026-11-24T08:49:00Z',BEFORE='2026-11-20T10:00:00Z';
  const P=[{id:1,bought:8,sold:0,stockAddedAt:AFTER},{id:2,bought:0,sold:0,stockAddedAt:AFTER},{id:3,bought:2,sold:5,stockAddedAt:AFTER},{id:4,bought:5,sold:0,archived:true,stockAddedAt:AFTER},{id:5,bought:8,sold:0,stockAddedAt:BEFORE},{id:6,bought:8,sold:0}];
  const rows={10:{id:10,platforma:'emag',comandaId:'A',efecteAplicate:false},11:{id:11,platforma:'emag',comandaId:'B',efecteAplicate:true},12:{id:12,platforma:'emag',comandaId:'C',efecteAplicate:true},
    13:{id:13,platforma:'emag',comandaId:'D',efecteAplicate:false},14:{id:14,platforma:'emag',comandaId:'E',efecteAplicate:false},15:{id:15,platforma:'emag',comandaId:'F',efecteAplicate:false,impachetat:true},16:{id:16,platforma:'emag',comandaId:'G',efecteAplicate:true}};
  const PCOM=[{platforma:'emag',comandaId:'A',awb:'111'},{platforma:'emag',comandaId:'B',awb:'222'},{platforma:'emag',comandaId:'ZZ',awb:'222'}];
  const env={P,PCOM,parseQtyVal:(v,d=0)=>Number(v)||d,pcomRowById:id=>rows[id]};
  const names=Object.keys(env);
  const api=new Function(...names,grabFrom(adm,'pcomStockZeroCandidates')+';return{pcomStockZeroCandidates}')(...names.map(n=>env[n]));
  const sim={ready:[{key:'emag|A'}],awb:[{o:{key:'emag|D'},miss:[]},{o:{key:'emag|E'},miss:[{id:2,qty:1}]}]};
  const T='2026-11-23T10:00:00Z';
  const iss=[
    {table:'platforma_comenzi',id:10,tip:'stoc_zero',produsId:1,ts:T},   // A: neaplicată, simularea o dă „gata" → se readuce
    {table:'platforma_comenzi',id:11,tip:'stoc_zero',produsId:1,ts:T},   // B: aplicată, stoc brut 8 ≥ 0 → se readuce
    {table:'platforma_comenzi',id:12,tip:'stoc_zero',produsId:3,ts:T},   // C: aplicată, stoc brut −3 (supravândut) → NU
    {table:'platforma_comenzi',id:13,tip:'stoc_zero',produsId:1,ts:T},   // D: neaplicată, cu AWB, acoperită → se readuce
    {table:'platforma_comenzi',id:14,tip:'stoc_zero',produsId:2,ts:T},   // E: neaplicată, cu AWB, lipsește stoc → NU
    {table:'platforma_comenzi',id:15,tip:'stoc_zero',produsId:1,ts:T},   // F: deja împachetată → ignorată
    {table:'platforma_comenzi',id:16,tip:'produs_gresit',produsId:1,ts:T},// G: altă problemă → NU se atinge
    {table:'jurnal',id:99,tip:'stoc_zero',produsId:1,ts:T}               // vânzare directă → ignorată
  ];
  const out=api.pcomStockZeroCandidates(sim,iss).map(o=>o.key).sort();
  eq('se readuc: A (sim gata), D (AWB acoperit); NU B (AWB-ul lui e și al comenzii ZZ → etichetă greșită), C (stoc negativ), E (lipsește stoc), F (împachetată), G (altă problemă)',out,['emag|A','emag|D']);
  const sim2={ready:[],awb:[]};
  eq('o comandă neaplicată pe care simularea n-o dă gata NU se readuce',api.pcomStockZeroCandidates(sim2,[iss[0]]).length,0);
  eq('o comandă cu o linie „stoc zero” rezolvabilă și una cu altă problemă NU se readuce (ar ascunde problema)',
    api.pcomStockZeroCandidates({ready:[],awb:[]},[{table:'platforma_comenzi',id:11,tip:'stoc_zero',produsId:1,ts:T},{table:'platforma_comenzi',id:11,tip:'produs_gresit',produsId:1,ts:T}]).length,0);
  eq('raport MAI NOU decât ultima încărcare (stoc ERP există, dar raftul era gol) → NU se readuce; la fel dacă produsul n-a avut niciodată încărcare',
    [api.pcomStockZeroCandidates({ready:[{key:'emag|A'}],awb:[]},[{table:'platforma_comenzi',id:10,tip:'stoc_zero',produsId:5,ts:T}]).length,api.pcomStockZeroCandidates({ready:[{key:'emag|A'}],awb:[]},[{table:'platforma_comenzi',id:10,tip:'stoc_zero',produsId:6,ts:T}]).length],[0,0]);
  const api2=new Function('P','PCOM','parseQtyVal','pcomRowById',grabFrom(adm,'pcomStockZeroCandidates')+';return pcomStockZeroCandidates')([{id:4,bought:5,sold:0,archived:true,stockAddedAt:AFTER}],[],(v,d=0)=>Number(v)||d,id=>rows[id]);
  eq('produs arhivat → nu se readuce',api2({ready:[],awb:[]},[{table:'platforma_comenzi',id:11,tip:'stoc_zero',produsId:4,ts:T}]).length,0);
}

/* ───────── Staff: căutare ───────── */
console.log('\n— Căutare în Staff (nume, AWB, telefon, produs, curier, colet) —');
{
  const PROD=[{id:1,sku:'AB230829',internalCode:'IC-9',ean:'5900000000017'},{id:2,sku:'TX1',ean:''}];
  const env={findProdus:id=>PROD.find(p=>p.id===id)};
  const names=Object.keys(env);
  const code=['sFold','sDigits','platformLabel','awbsOfLines','orderSearchIndex','searchTokens','tokenScore','matchDetailOrder','matchScoreOrder','matchOrder'].map(n=>grabFrom(stf,n)).join('\n')+';return{matchDetailOrder,matchScoreOrder,matchOrder,searchTokens}';
  const api=new Function(...names,code)(...names.map(n=>env[n]));
  const order=(o)=>({comandaId:'582542584',clientNume:'Ion Popescu-Țuțuianu',platforma:'emag',awb:'1214217869',awbCourier:'Cargus',awbLot:'7/43',
    lines:[{produs_id:1,produs_nume:'Cutie depozitare 30L neagră',titlu_extern:'Cutie depozitare, de mare rezistenta, 60x39x20cm',pnk:'AV-1225586',cod_produs:'AB230829',awb:'1214217869',awb_extra:['1214217999'],awb_cauta:'Ion Popescu | 0712345678 | *2055'},
           {produs_id:2,produs_nume:'Taburet imitatie blana',titlu_extern:'Taburet teddy',pnk:'AV-7',awb:'1214217869'}],...o});
  const sc=(q,o)=>api.matchScoreOrder(order(o||{}),q);
  eq('număr de comandă exact → 100; început → 90',[sc('582542584'),sc('5825')],[100,90]);
  eq('AWB întreg → 100; ultimele 4 cifre → 95; ultimele 6',[sc('1214217869'),sc('7869'),sc('217869')],[100,95,95]);
  eq('AWB suplimentar (al doilea colet) se găsește',sc('1214217999')>=95,true);
  eq('nume în orice ordine și fără diacritice: „tutuianu ion”',sc('tutuianu ion')>0,true);
  eq('prefix de prenume: „ion”, „pop”',[sc('ion')>=85,sc('pop')>=85],[true,true]);
  eq('telefon întreg (națion.) → 98; +40 → același; ultimele 4 cifre → 94',[sc('0712345678'),sc('+40 712 345 678'),sc('5678')],[98,98,94]);
  eq('coada mascată eMAG „2055” se găsește ca telefon',api.matchDetailOrder(order({}),'2055').vias.includes('📞 telefon'),true);
  eq('două cuvinte = ȘI: „ion 7869” da; „ion 4444” NU',[sc('ion 7869')>0,sc('ion 4444')],[true,0]);
  eq('număr cu spații/semne = un singur cuvânt („0712-345-678”, „1214 2178 69”)',[sc('0712-345-678')>=94,sc('1214 2178 69')>=95],[true,true]);
  eq('curier: „cargus” și „carg”',[sc('cargus')>=75,sc('carg')>=75],[true,true]);
  eq('numărul din lot: „7/43” exact; „#7”',[sc('7/43')>=92,sc('#7')>=80],[true,true]);
  eq('produs după nume, SKU, EAN, PNK, cod',[sc('taburet')>0,sc('ab230829')>=80,sc('5900000000017')>=80,sc('av-1225586')>=80,sc('ic-9')>=80],[true,true,true,true,true]);
  eq('două produse din aceeași comandă: „cutie taburet” (ȘI) se potrivește',sc('cutie taburet')>0,true);
  eq('nepotrivire clară → 0',[sc('zzzzzz'),sc('9999999')],[0,0]);
  eq('o cifră într-un număr de telefon fals NU potrivește (4 cifre care nu apar)',sc('9999'),0);
  eq('rezultatul spune CE s-a potrivit',api.matchDetailOrder(order({}),'7869').vias,['🔎 AWB']);
  eq('scanare AWB + sufix de curier (codul de bare conține AWB-ul)',sc('1214217869001F5159')>0,true);
  eq('interogare goală → 0',sc('   '),0);
  eq('cuvinte de o literă se ignoră când există altele („ion a” = „ion”)',api.searchTokens('ion a').length,1);
  const noPhone=order({lines:[{produs_id:1,produs_nume:'X',awb:'1214217869'}]});
  eq('fără text de etichetă: telefonul nu se găsește, dar restul da',[api.matchScoreOrder(noPhone,'0712345678'),api.matchScoreOrder(noPhone,'cargus')>0],[0,true]);
  // viteză: 5000 de comenzi, 3 interogări
  const big=[];for(let i=0;i<5000;i++)big.push(order({comandaId:String(500000000+i),clientNume:'Client '+i,awb:'12'+String(10000000+i),lines:[{produs_id:1,produs_nume:'Produs '+(i%50),awb:'12'+String(10000000+i)}]}));
  const t0=process.hrtime.bigint();let n=0;
  ['ion popescu','7869','produs 12'].forEach(q=>big.forEach(o=>{if(api.matchScoreOrder(o,q)>0)n++;}));
  const ms=Number(process.hrtime.bigint()-t0)/1e6;
  eq(`viteză: 3 interogări pe 5000 de comenzi (cu indexul deja construit la prima) < 400 ms (a durat ${Math.round(ms)} ms)`,ms<400,true);
}

console.log('\n— Staff: lot din fișier și comenzi incomplete —');
{
  const awbLotFromFile=new Function(grabFrom(stf,'awbLotFromFile')+';return awbLotFromFile')();
  eq('„007_1027849694_…pdf” → „Nr. 7”',awbLotFromFile('007_1027849694_eMAG_Courier_012EMGXL23960294001.pdf'),'Nr. 7');
  eq('fără număr în față → gol',awbLotFromFile('Unknown-61.pdf'),'');
  eq('„000_…” → gol (nu există colet 0)',awbLotFromFile('000_x.pdf'),'');
  eq('computeOrders: comanda incompletă se marchează (Admin spune 2, în Staff e 1) și dispare când sunt toate',
    /g\.incomplete=incInfo&&!g\.finalized&&Number\(incInfo\.n\)>g\.lines\.length\?incInfo:null/.test(stf),true);
  eq('finalizarea unei comenzi incomplete cere confirmare',/if\(ord\.incomplete&&!confirm\(/.test(stf),true);
  eq('cardul de împachetat arată banda „COMANDĂ INCOMPLETĂ”',/\$\{ord\.incomplete\?incompleteBannerHtml\(ord\):''\}/.test(stf),true);
  eq('„Stoc zero” raportat deși ERP are stoc → confirmare',/type==='stoc_zero'&&l\)\{[\s\S]*?er>=\(Number\(l\.cantitate\)\|\|1\)&&!confirm/.test(stf),true);
}

console.log('\n— URGENT după AWB —');
{
  // Staff
  const PROD=[];
  const stfEnv={URGENT:{'emag|100':{at:new Date().toISOString()}},ORDERS:[],findProdus:id=>PROD.find(p=>p.id===id)};
  const names=Object.keys(stfEnv);
  const code=['sFold','sDigits','awbsOfLines','urgentKeyOf','urgentRankOf','ordersByAwb'].map(n=>grabFrom(stf,n)).join('\n')+';return{ordersByAwb,urgentRankOf,urgentKeyOf}';
  const api=new Function(...names,code)(...names.map(n=>stfEnv[n]));
  stfEnv.ORDERS.push({key:'platforma:emag:100',platforma:'emag',comandaId:'100',finalized:false,lines:[{awb:'1214217869'}]},
    {key:'platforma:emag:200',platforma:'emag',comandaId:'200',finalized:false,lines:[{awb:'4EMGLN199689004001',awb_extra:['1214999999']}]},
    {key:'platforma:emag:300',platforma:'emag',comandaId:'300',finalized:true,lines:[{awb:'1214217870'}]},
    {key:'direct',platforma:'direct',comandaId:'',finalized:false,lines:[{awb:'1214217871'}]});
  eq('AWB întreg → comanda',api.ordersByAwb('1214217869').map(o=>o.comandaId),['100']);
  eq('ultimele cifre (≥4) → comanda; mai puține → nimic',[api.ordersByAwb('7869').map(o=>o.comandaId),api.ordersByAwb('869').length],[['100'],0]);
  eq('AWB cu litere și AWB suplimentar (al doilea colet)',[api.ordersByAwb('4emgln199689004001').map(o=>o.comandaId),api.ordersByAwb('1214999999').map(o=>o.comandaId)],[['200'],['200']]);
  eq('cod scanat care conține AWB-ul (sufix de curier) → comanda',api.ordersByAwb('4EMGLN199689004001001F5159').map(o=>o.comandaId),['200']);
  eq('comenzile finalizate și vânzările directe nu apar la urgentare',[api.ordersByAwb('1214217870').length,api.ordersByAwb('1214217871').length],[0,0]);
  eq('rang urgent: marcată = 1, nemarcată = 0',[api.urgentRankOf({platforma:'emag',comandaId:'100'}),api.urgentRankOf({platforma:'emag',comandaId:'200'})],[1,0]);
  eq('aceeași comandă pe altă platformă nu moștenește urgența',api.urgentRankOf({platforma:'trendyol',comandaId:'100'}),0);
  eq('sortarea ORDERS pune urgentele primele (înaintea curierului/platformei)',/ORDERS=Object\.values\(groups\)\.sort\(\(a,b\)=>urgentRankOf\(b\)-urgentRankOf\(a\)\|\|staffCourierRank\(/.test(stf),true);
  eq('iese din urgent când e finalizată (g.urgent cere !g.finalized)',/g\.urgent=!g\.finalized&&urgentRankOf\(g\)===1/.test(stf),true);
  eq('butonul 🚨 Urgent din antet + scanare AWB',/id="staff-urgent-btn" onclick="openUrgentSheet\(\)"/.test(stf)&&/scanMode==='urgent'/.test(stf),true);
  // Admin
  const rows=[{platforma:'emag',comandaId:'100',awb:'1214217869',awbExtra:['1214000001']},{platforma:'emag',comandaId:'200',awb:'1214217999',impachetat:true},{platforma:'emag',comandaId:'300',awb:'1214217555',anulata:true}];
  const adm_env={PCOM:rows,pcImpParsed:[{platforma:'trendyol',comandaId:'T1',awb:'7000123456'}],pcImpPlatforma:'emag'};
  const n2=Object.keys(adm_env);
  const aapi=new Function(...n2,['urgentKeyAdmin','urgentOrdersByAwb'].map(n=>grabFrom(adm,n)).join('\n')+';return{urgentOrdersByAwb}')(...n2.map(n=>adm_env[n]));
  eq('Admin: AWB → comanda (salvată sau din previzualizare); împachetate/anulate nu',[aapi.urgentOrdersByAwb('1214217869').map(h=>h.comandaId),aapi.urgentOrdersByAwb('7000123456').map(h=>h.comandaId),aapi.urgentOrdersByAwb('1214217999').length,aapi.urgentOrdersByAwb('1214217555').length],[['100'],['T1'],0,0]);
  eq('Admin: AWB suplimentar și ultimele cifre',[aapi.urgentOrdersByAwb('1214000001').map(h=>h.comandaId),aapi.urgentOrdersByAwb('3456').map(h=>h.comandaId)],[['100'],['T1']]);
  eq('Admin: scrierea cheii staff_urgent semnalează Staff (bulina ↻)',/URGENT_ADMIN=orders;\s*try\{await pushStaffRefresh\(true\);\}/.test(adm),true);
}

console.log('\n— Ordinea după numărul AWB-ului (1, 2, 3…) și butonul de urgență —');
{
  const api=new Function(['lotKeyOf','lotCmp'].map(n=>grabFrom(stf,n)).join('\n')+';return{lotKeyOf,lotCmp}')();
  const G=(lot,file)=>({lines:[{awb_lot:lot||null,awb_source_file:file||null}]});
  eq('„7/43” → n=7, m=43; prefix de fișier „007_…” → n=7; fără număr → null',[api.lotKeyOf(G('7/43')),api.lotKeyOf(G(null,'007_x.pdf')),api.lotKeyOf(G(null,'Unknown-61.pdf'))],[{n:7,m:43},{n:7,m:0},null]);
  const list=[G(null,null),G('10/43'),G('2/43'),G(null,'003_a.pdf'),G('1/14'),G('2/14')];
  const ord=list.slice().sort(api.lotCmp).map(g=>{const k=api.lotKeyOf(g);return k?k.n+(k.m?'/'+k.m:''):'-';});
  eq('numerotatele în ordinea 1,2,3… (la același număr, lotul mai mic întâi), cele fără număr la urmă',ord,['1/14','2/14','2/43','3','10/43','-']);
  eq('comparatorul principal: urgent → curier → NUMĂR AWB → platformă → dată',/urgentRankOf\(b\)-urgentRankOf\(a\)\|\|staffCourierRank\(.*?\)\|\|lotCmp\(a,b\)\|\|\(PLATFORM_ORDER/.test(stf),true);
  eq('butonul de urgență e MIC, în antetul cardului (nu mai e un buton lat pe tot cardul)',/class="urgent-mini \$\{on\?'off':''\}"/.test(stf)&&!/nav-btn urgent-toggle/.test(stf),true);
  eq('butonul 🚨 există pe fiecare comandă: card Împachetare, card În așteptare, liste (Așteaptă AWB, În așteptare ×2) și rezultatele căutării',(stf.match(/urgentMiniHtml\(/g)||[]).length-1,6);
  const mini=new Function('urgentMiniHtml',grabFrom(stf,'urgentMiniHtml')+';return urgentMiniHtml')();
  eq('mic în card („🚨 Urgent”), iconiță în liste; când e urgentă: „✕ scoate”; niciun buton pe vânzări directe, finalizate sau fără număr',[/🚨 Urgent/.test(mini({key:'k',platforma:'emag',comandaId:'1'})),/>🚨<\/button>/.test(mini({key:'k',platforma:'emag',comandaId:'1'},true)),/✕ scoate/.test(mini({key:'k',platforma:'emag',comandaId:'1',urgent:true})),mini({key:'k',platforma:'direct',comandaId:'1'}),mini({key:'k',platforma:'emag',comandaId:'1',finalized:true}),mini({key:'k',platforma:'emag',comandaId:''})],[true,true,true,'','','']);
  eq('din Căutare, urgența nu șterge textul scris (se reiau doar rezultatele)',/activeTab==='search'&&document\.getElementById\('search-page-input'\)\)onSearchPageInput\(\);/.test(stf),true);
  eq('comanda urgentă are cadru roșu pe tot cardul',/\.card\.urgent\{border:3px solid #D92D20/.test(stf)&&/'multi-line':'single-line'\}\$\{ord\.urgent\?' urgent':''\}/.test(stf),true);
}

console.log('\n— Căutare în secțiunea „Asociază AWB-uri” (Admin) —');
{
  const strip=s=>String(s).normalize('NFD').replace(/[̀-ͯ]/g,'');
  const mkEl=(k,s)=>({dataset:{k,s},style:{display:''}});
  const kids=[];
  const box={get children(){return kids;},querySelectorAll:()=>({forEach(){}}),insertAdjacentHTML(){}};
  const els={};
  const getEl=id=>els[id]||(els[id]={id,style:{display:'none'},textContent:'',innerHTML:'',value:''});
  getEl('pcmi-awb-preview');els['pcmi-awb-preview']=Object.assign(box,{style:{display:''}});
  const env={stripDiacritics:strip,document:{getElementById:getEl}};
  const names=Object.keys(env);
  const code="let awbQStatus='all';"+['awbQFold','awbRowSearchText','awbQTokens','awbFilterSetStatus','awbFilterApply'].map(n=>grabFrom(adm,n)).join('\n')+';return{awbRowSearchText,awbQTokens,awbFilterApply,awbFilterSetStatus}';
  const api=new Function(...names,code)(...names.map(n=>env[n]));
  const P1={awb:'1214217869',comandaId:'582542584',file:'001_582542584_Cargus_1214217869.pdf',courier:'Cargus',rows:[{client_nume:'Ion Țuțuianu',produs_nume:'Cutie depozitare 30L'}],lot:'1/14',cauta:'Ion Tutuianu | 0712345678 | *2055'};
  const P2={awb:'7000182438622',comandaId:'11820951962',courier:'FAN Courier',rows:[],destinatar:'Maria Irimia',destinatarPhone:'+40 744 111 222'};
  const t1=api.awbRowSearchText(P1),t2=api.awbRowSearchText(P2);
  const has=(t,q)=>api.awbQTokens(q).every(w=>t.includes(w));
  eq('rând găsit: AWB întreg, ultimele cifre, comandă, nume fără diacritice, produs, fișier, lot',['1214217869','7869','582542584','tutuianu','cutie','cargus_1214','1/14'].map(q=>has(t1,q)),[true,true,true,true,true,true,true]);
  eq('telefon: număr întreg (cu spații/semne) și ultimele 4 cifre; coada mascată',['0712-345-678','0712 345 678','5678','2055'].map(q=>has(t1,q)),[true,true,true,true]);
  eq('mai multe cuvinte (ȘI) în orice ordine: „cutie ion”; nepotrivire clară → fals',[has(t1,'cutie ion'),has(t1,'ion 9999')],[true,false]);
  eq('rând negăsit: nume destinatar + telefon cu +40',[has(t2,'irimia'),has(t2,'744111222'),has(t2,'111 222'),has(t2,'fan')],[true,true,true,true]);
  eq('numerele nu se confundă între rânduri („7869” nu e pe al doilea)',has(t2,'7869'),false);
  // filtrarea rândurilor + chip-uri
  kids.push(mkEl('ok',t1),mkEl('no',t2),mkEl('dup',t1),mkEl('nr',''));
  els['pcmi-awb-q']={value:'tutuianu'};
  api.awbFilterApply();
  eq('„tutuianu” → rămân doar rândurile care îl conțin (găsit + duplicat)',kids.map(k=>k.style.display),['','none','','none']);
  eq('contorul „N din M etichete”',els['pcmi-awb-qn'].textContent,'2 din 4 etichete');
  els['pcmi-awb-q'].value='';api.awbFilterSetStatus('no');
  eq('chip „Negăsite” = negăsite + nerecunoscute',kids.map(k=>k.style.display),['none','','none','']);
  api.awbFilterSetStatus('all');
  eq('„Toate” + câmp gol → totul vizibil, fără contor',[kids.map(k=>k.style.display).join('|'),els['pcmi-awb-qn'].textContent],['|||','']);
  eq('chip-urile arată numerele pe stări',/Găsite <b>1<\/b>/.test(els['pcmi-awb-chips'].innerHTML)&&/Negăsite <b>2<\/b>/.test(els['pcmi-awb-chips'].innerHTML)&&/Duplicate <b>1<\/b>/.test(els['pcmi-awb-chips'].innerHTML),true);
  eq('randarea listei etichetează rândurile și reaplică filtrul (awbTagRows + awbFilterApply)',/box\.innerHTML=html;\s*\n\s*awbTagRows\(box\);awbFilterApply\(\);/.test(adm),true);
  eq('bara de căutare există în secțiune, deasupra listei',/id="pcmi-awb-search"[\s\S]*?id="pcmi-awb-q"[\s\S]*?<div id="pcmi-awb-preview"><\/div>/.test(adm),true);
  eq('în interfața nouă (redesign) bara se mută în slotul din „Expediere” împreună cu lista (altfel rămâne în panoul vechi, ascuns)',/\['pcx-awb-search-slot','pcmi-awb-search'\],\['pcx-awb-preview-slot','pcmi-awb-preview'\]/.test(adm)&&/id="pcx-awb-search-slot"><\/div><div id="pcx-awb-preview-slot">/.test(adm),true);
  eq('căutarea principală (Comenzi Platforme) cuprinde acum AWB suplimentar, colet, telefon și curier',/row&&row\.awbExtra\|\|\[\]\)\.join\(' '\),\(row&&row\.awbLot\)\|\|it\.awbLot,lab/.test(adm),true);
}

console.log('\n— Ordinea filelor din Staff —');
{
  const tabs=[...stf.matchAll(/class="tab-btn[^"]*" data-tab="(\w+)"/g)].map(m=>m[1]);
  eq('„Căutare” e a treia fila, imediat după Împachetare și În așteptare',tabs.slice(0,4),['pack','waiting','search','awaitawb']);
  eq('toate filele există o singură dată',[tabs.length,new Set(tabs).size],[9,9]);
}

console.log('\n— Integrare Admin —');
{
  eq('la asocierea AWB pe comandă încă necomisă se includ TOATE liniile ei (nu doar prima)',/const toInclude=\[idx,\.\.\.sibIdx\]/.test(adm)&&/for\(const i of toInclude\)\{pcImpParsed\[i\]\.include=true;await syncPcomLineCommitState\(i,true\);\}/.test(adm),true);
  eq('AWB-ul + lotul + textul de căutare se aplică pe liniile-surori necomise',/sibIdx\.forEach\(i=>\{if\(!pcImpParsed\[i\]\._committedId&&!pcImpParsed\[i\]\.awb\)Object\.assign\(pcImpParsed\[i\],awbFields\);\}\)/.test(adm),true);
  eq('antetul cardului nu mai zice „Inclus” când doar o parte e inclusă',/compl\.partial\?`⚠ \$\{compl\.inc\}\/\$\{compl\.total\} în Staff`/.test(adm),true);
  eq('lista de comenzi incomplete se publică în setari_app.staff_incomplete',/setari_app\?key=eq\.staff_incomplete/.test(adm)&&/pcomPublishIncomplete\(list\)/.test(adm),true);
  eq('după încărcarea stocului se reverifică „stoc zero” (applyInvoice)',/await pcomStockZeroRecheck\(true\)/.test(adm),true);
  eq('numărul din lot și textul de căutare se citesc la ambele surse de etichete (dosar + selectare manuală)',(adm.match(/lot:awbLotFromText\(t\.text,fname\),cauta:awbSearchBlobFromText\(t\.text\)/g)||[]).length,2);
  eq('coloanele noi lipsă nu opresc scrierea AWB (fallback în patchAwbWithSource)',/awb_preview_url\|awb_lot\|awb_cauta/.test(adm),true);
}
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE „COMANDA E UNITATEA” AU TRECUT');
process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
