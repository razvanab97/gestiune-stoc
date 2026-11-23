#!/usr/bin/env node
/* Test al conversiei listare → unități de stoc (seturi / pachete), în special „Statie radio 2x": o unitate de stoc = 2 stații.
   Funcțiile REALE din index.html; titlurile sunt cele reale de stații radio din comenzi. Rulează: node scripts/pack-size.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const cst=n=>{const m=src.match(new RegExp('const '+n+'=.*?;\\n','s'));if(!m)throw new Error('lipsește '+n);return m[0];};
const names=['pcomPackFromNx','pcomDetectPackSize','pcomPackNorm','pcomPackSingleUnit','pcomPackMemKey','pcomPackMemGet','pcomPackMemMerge','pcomPackMemSave','pcomPackLearn','pcomPackPlan','pcomSuggestQtyForPackMismatch','pcomRescalePriceForQty','pcomAutoPackLine','pcomRevertAutoPack','pcomPackAfterManualEdit','pcomRefreshPackSuggestions','applyPcomSuggestedQty','pcomSetQty','pcomAdjustQty'];
const code=cst('PCOM_NUM_WORDS')+cst('PCOM_PACK_SET_WORDS')+"let PCOM_PACK_MEM={};const PCOM_PACK_MEM_LS='ls',PCOM_PACK_MEM_KEY='k';let pcomPackMemTimer=null;\n"+names.map(grab).join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
function world(lines){
  const log=[],posts=[],P=[{id:172,name:'Statie radio 2x Baofeng BF888S'},{id:7,name:'Set 20 umerașe catifea'},{id:8,name:'Cutie depozitare 42L'},
    {id:9,name:'Cutie depozitare, cu capac si cleme de prindere, din plastic, transparent, 12L, 34.8x28x21.6cm'},{id:10,name:'Cutii depozitare pliabile'},{id:11,name:'Set cutii depozitare'},
    {id:12,name:'Umeraș catifelat'},{id:13,name:'Lampă solară grădină'}];
  const env={P,renderPcomImportPreview(){log.push('render');},pcomPersistQtyIfCommitted(i){log.push('persist'+i);},fmtQty:x=>String(x),state:{p:lines},
    localStorage:{setItem(){},getItem(){return null;}},fetch:async(u,o)=>{posts.push(o&&o.body);return{json:async()=>({value:''})};},setTimeout:(f)=>{log.push('timer');return 1;},clearTimeout(){},toast(m){log.push('toast');}};
  const keys=Object.keys(env);
  const api=new Function(...keys,'let pcImpParsed=state.p;'+code+';return{pcomDetectPackSize,pcomPackPlan,pcomSuggestQtyForPackMismatch,pcomAutoPackLine,pcomRevertAutoPack,pcomRefreshPackSuggestions,applyPcomSuggestedQty,pcomSetQty,pcomAdjustQty,pcomPackLearn,pcomPackMemGet,pcomPackMemMerge,pcomPackSingleUnit,get mem(){return PCOM_PACK_MEM},get lines(){return pcImpParsed}}')(...keys.map(k=>env[k]));
  return{api,log,posts};
}
const T4='Set 4 statii radio portabile emisie receptie PROGRAMATE in banda de licenta libera, Walkie Talkie, Baofeng BF-888s';
const L=(o={})=>({produsId:172,titluExtern:T4,cantitate:1,cantitateComanda:1,pretFaraTva:100,pretTotalCuTva:121,...o});
(()=>{
  const {api}=world([]);
  console.log('\n— Detectarea mărimii pachetului (titluri reale) —');
  const d=api.pcomDetectPackSize;
  eq('„Set 4 statii radio…" → 4',d(T4),4);
  eq('„Set 2 Statii Radio Baofeng BF-88E" → 2',d('Set 2 Statii Radio Baofeng BF-88E, 1500mAh, 16 canale, Negru'),2);
  eq('„Set doua Statii Walkie Talkie…" (cifră cu litere) → 2',d('Set doua Statii Walkie Talkie Baofeng BF-888S, 16 Canale Programate PMR'),2);
  eq('„Set 4 buc Statii Radio…" → 4',d('Set 4 buc Statii Radio Walkie Talkie Baofeng BF-888S UHF 400-470MHz'),4);
  eq('bulgară „Комплект от 8 …" → 8',d('Комплект от 8 програмируеми радиостанции Walkie Talkie + бонус кабел'),8);
  eq('numele produsului „Statie radio 2x Baofeng BF888S" → 2',d('Statie radio 2x Baofeng BF888S'),2);
  eq('dimensiunile NU sunt pachete: „60x40x40 cm", „3x3 m", „2x1.5"',[d('Cutie 60x40x40 cm'),d('Prelată 3x3 m'),d('Cablu 2x1.5 mm')],[null,null,null]);
  eq('fără indiciu de set → null („Portable Walkie-Talkie - BF-888S")',d('Portable Walkie-Talkie - BF-888S, ABTD0704'),null);
  eq('regula veche rămâne: „Set de 30 umerașe" → 30',d('Set de 30 umerașe'),30);

  console.log('\n— Planul de conversie pe „Statie radio 2x" (1 cutie = 2 stații) —');
  const p=(q,t)=>api.pcomPackPlan(q,t,172);
  eq('Set 4 × 1 → 2 cutii, se aplică singur',p(1,T4),{suggested:2,titlePack:4,productPack:2,auto:true,sursa:'nume'});
  eq('Set 2 × 1 → 1 cutie = ce e deja: nimic de schimbat',p(1,'Set 2 Statii Radio Baofeng'),null);
  eq('Set 2 × 2 → 2 cutii = ce e deja',p(2,'Set 2 Statii Radio Baofeng'),null);
  eq('Set 4 × 2 → 4 cutii, automat',p(2,T4),{suggested:4,titlePack:4,productPack:2,auto:true,sursa:'nume'});
  eq('„Set doua" × 1 → 1 cutie: nimic de schimbat',p(1,'Set doua Statii Walkie Talkie Baofeng'),null);
  eq('bulgară Set 8 × 1 → 4 cutii, automat',p(1,'Комплект от 8 програмируеми радиостанции')&&p(1,'Комплект от 8 програмируеми радиостанции').suggested,4);
  eq('Set 3 × 1 → 1,5 cutii: DOAR sugestie (nu e număr întreg)',p(1,'Set 3 statii radio'),{suggested:1.5,titlePack:3,productPack:2,auto:false,sursa:'nume'});
  console.log('\n— Comportamentul vechi rămâne pentru restul produselor —');
  eq('produs-set fără „Nx" („Set 20 umerașe"), titlu „Set de 30" → sugestie 1,5, NU automat',api.pcomPackPlan(1,'Set de 30 umerașe',7),{suggested:1.5,titlePack:30,productPack:20,auto:false,sursa:null});
  eq('produs fără pachet („Cutie depozitare 42L"), titlu „Set 3 cutii" → 3 cutii, ACUM automat (un singur exemplar, Update #767)',api.pcomPackPlan(1,'Set 3 cutii',8),{suggested:3,titlePack:3,productPack:null,auto:true,sursa:'titlu'});
  eq('fără produs asociat → doar sugestie',api.pcomPackPlan(1,'Set 4 statii',null),{suggested:4,titlePack:4,productPack:null,auto:false,sursa:null});
})();
(()=>{
  console.log('\n— Aplicare automată pe linie + anulare —');
  const a=L(),w=world([a]);
  w.api.pcomAutoPackLine(a);
  eq('linia nouă: 1 × Set 4 → 2 cutii; prețul total rămâne același (preț/buc înjumătățit)',[a.cantitate,a.cantitateComanda,a.pretFaraTva,a.suggestedCantitate,a._autoPack],[2,1,50,null,{de:1,la:2,titlePack:4,productPack:2,sursa:'nume'}]);
  w.api.pcomAutoPackLine(a);
  eq('a doua trecere nu dublează conversia',[a.cantitate,a.pretFaraTva],[2,50]);
  w.api.pcomRevertAutoPack(0);
  eq('„anulează conversia": revine 1 × ; prețul revine; nu mai sugerează (listarea e memorată „fără conversie")',[a.cantitate,a.pretFaraTva,a.suggestedCantitate,a._autoPack,a._packReverted],[1,100,null,null,true]);
  w.api.pcomAutoPackLine(a);
  eq('după anulare nu se mai aplică singură',[a.cantitate,a._autoPack],[1,null]);
  const c=L({_committedId:9}),w2=world([c]);w2.api.pcomAutoPackLine(c);
  eq('linie deja comisă (în Staff): NU se schimbă în tăcere',[c.cantitate,c._autoPack],[1,undefined]);
  const o=L({produsId:8,titluExtern:'Set 3 cutii'}),w3=world([o]);w3.api.pcomAutoPackLine(o);
  eq('produs fără „Nx", dar „un singur exemplar" („Cutie…" vs „Set 3 cutii"): se aplică automat, cu chip',[o.cantitate,o._autoPack],[3,{de:1,la:3,titlePack:3,productPack:null,sursa:'titlu'}]);

  console.log('\n— Ciornă veche (calculată înainte de regulă) —');
  const stale=L({suggestedCantitate:4,_committedId:5}),fresh=L(),edited=L({cantitate:3,cantitateComanda:1}),ok=L({titluExtern:'Set 2 Statii Radio',suggestedCantitate:2,_committedId:6});
  const w4=world([stale,fresh,edited,ok]);const ch=w4.api.pcomRefreshPackSuggestions();
  eq('comisă cu sugestia veche „4" → corectată la 2, cantitatea NU se atinge',[stale.suggestedCantitate,stale.cantitate],[2,1]);
  eq('necomisă și neatinsă → conversie automată (2 cutii)',[fresh.cantitate,!!fresh._autoPack],[2,true]);
  eq('modificată manual de tine (3 ≠ 1) → nu se atinge',[edited.cantitate,edited._autoPack],[3,undefined]);
  eq('sugestie veche care nu mai are sens („Set 2" × 1 = 1 cutie) → dispare',[ok.suggestedCantitate],[null]);
  eq('numărul de linii schimbate',ch,3);
})();
(async()=>{
  const TC='Set 5 cutii depozitare, cu capac si cleme de prindere, din plastic, transparent, 12L, 34.8x28x21.6cm';   // titlul REAL din captură (eMAG #582841809)
  const C=(o={})=>({platforma:'emag',comandaId:'582841809',pnk:'AV-1211814s5',produsId:9,titluExtern:TC,cantitate:1,cantitateComanda:1,pretFaraTva:120.62,pretTotalCuTva:145.95,include:false,...o});

  console.log('\n— Cazul din captură: „Set 5 cutii" × 1 → 5 (Update #767) —');
  {
    const {api}=world([]);
    eq('titlu real + produs real („Cutie depozitare…12L…") → 5 cutii, automat',api.pcomPackPlan(1,TC,9),{suggested:5,titlePack:5,productPack:null,auto:true,sursa:'titlu'});
    eq('2 seturi comandate → 10 cutii',api.pcomPackPlan(2,TC,9)&&api.pcomPackPlan(2,TC,9).suggested,10);
    const a=C(),w=world([a]);w.api.pcomAutoPackLine(a);
    eq('linia: 1 → 5 buc., cantitatea din comandă păstrată, prețul total încasat neschimbat (pe bucată împărțit la 5)',[a.cantitate,a.cantitateComanda,a.pretTotalCuTva,a.pretFaraTva],[5,1,145.95,24.12]);
    eq('chip: sursa „titlu", fără pachet al produsului',a._autoPack,{de:1,la:5,titlePack:5,productPack:null,sursa:'titlu'});
    eq('dimensiunile din titlu („34.8x28x21.6cm", „12L") NU sunt luate drept pachet',[api.pcomDetectPackSize('Cutie depozitare 12L, 34.8x28x21.6cm'),api.pcomDetectPackSize('Cutie 60x40x40 cm')],[null,null]);
  }

  console.log('\n— „Un singur exemplar": când NU se aplică singur —');
  {
    const {api}=world([]);
    eq('produsul are același cuvânt la plural („Cutii depozitare pliabile") → ambiguu, doar sugestie',api.pcomPackPlan(1,TC,10),{suggested:5,titlePack:5,productPack:null,auto:false,sursa:null});
    eq('produsul e declarat set („Set cutii depozitare") → doar sugestie',api.pcomPackPlan(1,TC,11),{suggested:5,titlePack:5,productPack:null,auto:false,sursa:null});
    eq('titlul nu are cuvânt după număr („Set 5") → nu se poate verifica, doar sugestie',api.pcomPackPlan(1,'Set 5',9),{suggested:5,titlePack:5,productPack:null,auto:false,sursa:null});
    eq('produs diferit de cuvântul din titlu („Lampă solară" vs „Set 5 cutii") → doar sugestie',api.pcomPackPlan(1,TC,13),{suggested:5,titlePack:5,productPack:null,auto:false,sursa:null});
    eq('„Set 20 umerașe catifelate" → produs „Umeraș catifelat" = o bucată → 20, automat',api.pcomPackPlan(1,'Set 20 umerașe catifelate pentru haine',12),{suggested:20,titlePack:20,productPack:null,auto:true,sursa:'titlu'});
    eq('„Set 2 lămpi solare" → produs „Lampă solară grădină" → 2, automat',api.pcomPackPlan(1,'Set 2 lămpi solare LED',13)&&api.pcomPackPlan(1,'Set 2 lămpi solare LED',13).auto,true);
    eq('un număr de 1 („Set 1 cutie") nu e pachet',api.pcomPackPlan(1,'Set 1 cutie depozitare',9),null);
  }

  console.log('\n— După alegerea MANUALĂ a produsului (golul din captură) —');
  {
    const a=C({viaPnk:false,score:1,suggestedCantitate:null}),w=world([a]);
    const ch=w.api.pcomRefreshPackSuggestions();
    eq('linie cu produs ales manual, cantitate 1, fără nicio sugestie → la următoarea randare se convertește la 5',[ch,a.cantitate,!!a._autoPack],[1,5,true]);
    eq('a doua randare nu mai schimbă nimic',w.api.pcomRefreshPackSuggestions(),0);
    const c=C({_committedId:7}),w2=world([c]);w2.api.pcomRefreshPackSuggestions();
    eq('linie deja în Staff: cantitatea NU se schimbă în tăcere, dar primește sugestia 💡 (5)',[c.cantitate,c.suggestedCantitate,c._autoPack],[1,5,undefined]);
    const e=C({cantitate:5,cantitateComanda:1}),w3=world([e]);w3.api.pcomRefreshPackSuggestions();
    eq('linie la care ai pus TU 5: nu se atinge, fără sugestie',[e.cantitate,e.suggestedCantitate,e._autoPack],[5,undefined,undefined]);
    const f=C({amanat:true}),w4=world([f]);w4.api.pcomRefreshPackSuggestions();
    eq('linie amânată: nu se atinge',[f.cantitate,f._autoPack],[1,undefined]);
    // produs care pare deja un set („Set cutii depozitare"): o sugestie NOUĂ ar fi zgomot; una deja existentă rămâne
    const h=C({produsId:11}),w6=world([h]);w6.api.pcomRefreshPackSuggestions();
    eq('linie fără sugestie, produs „Set cutii…" → nu primește o sugestie nouă (zgomot)',[h.cantitate,h.suggestedCantitate],[1,undefined]);
    const h2=C({produsId:11,suggestedCantitate:5}),w7=world([h2]);w7.api.pcomRefreshPackSuggestions();
    eq('…dar o sugestie care exista deja rămâne',h2.suggestedCantitate,5);
    const g=C({produsId:null}),w5=world([g]);
    eq('fără produs asociat: nimic de convertit',[w5.api.pcomRefreshPackSuggestions(),g.cantitate],[0,1]);
  }

  console.log('\n— Memoria pe listare (ce confirmi o dată se aplică singur) —');
  {
    // produs plural/ambiguu (id 10): fără memorie → doar sugestie
    const A=C({produsId:10}),w=world([A]);
    w.api.pcomRefreshPackSuggestions();
    eq('înainte de memorie: produs ambiguu → doar sugestia 5',[A.cantitate,A.suggestedCantitate,A._autoPack],[1,5,undefined]);
    w.api.applyPcomSuggestedQty(0);
    eq('apeși „Aplică" → 5 și memorat (platformă + PNK + produs)',[A.cantitate,A.suggestedCantitate,w.api.mem['emag|p:av-1211814s5|10']&&w.api.mem['emag|p:av-1211814s5|10'].r],[5,null,5]);
    eq('memoria se trimite și în cloud (după 1,5 s)',w.log.includes('timer'),true);
    const B=C({produsId:10,comandaId:'999'});w.api.lines.push(B);
    w.api.pcomRefreshPackSuggestions();
    eq('comandă NOUĂ pe aceeași listare → se convertește singură, cu chip „memorie"',[B.cantitate,B._autoPack&&B._autoPack.sursa],[5,'memorie']);
    const D=C({produsId:10,comandaId:'1000',pnk:'ALT-PNK'});w.api.lines.push(D);
    w.api.pcomRefreshPackSuggestions();
    eq('altă listare (alt PNK) → NU moștenește memoria (doar sugestie)',[D.cantitate,D.suggestedCantitate],[1,5]);
    const E=C({produsId:10,comandaId:'1001',cantitate:2,cantitateComanda:2});w.api.lines.push(E);
    w.api.pcomRefreshPackSuggestions();
    eq('2 comandate pe listarea memorată → 10',E.cantitate,10);

    // anulare = „fără conversie" pentru listarea asta, chiar dacă numele produsului declară pachetul
    const R=C({produsId:9,pnk:'AV-R'}),w2=world([R]);
    w2.api.pcomRefreshPackSuggestions();
    eq('linie convertită automat (produs „Cutie…")',R.cantitate,5);
    w2.api.pcomRevertAutoPack(0);
    eq('„↶ anulează conversia" → revine la 1 și se memorează „fără conversie"',[R.cantitate,R._packReverted,w2.api.mem['emag|p:av-r|9']&&w2.api.mem['emag|p:av-r|9'].r],[1,true,1]);
    const R2=C({produsId:9,pnk:'AV-R',comandaId:'555'});w2.api.lines.push(R2);
    w2.api.pcomRefreshPackSuggestions();
    eq('următoarea comandă pe aceeași listare NU se mai convertește și nici nu mai sugerează',[R2.cantitate,R2.suggestedCantitate,R2._autoPack],[1,undefined,undefined]);

    // editări manuale
    const M=C({produsId:10,pnk:'AV-M'}),w3=world([M]);
    w3.api.pcomRefreshPackSuggestions();
    w3.api.pcomSetQty(0,'5');
    eq('scrii TU exact cantitatea sugerată (5) → se memorează pentru listare',w3.api.mem['emag|p:av-m|10']&&w3.api.mem['emag|p:av-m|10'].r,5);
    const X=C({produsId:10,pnk:'AV-X'}),w4=world([X]);
    w4.api.pcomRefreshPackSuggestions();
    w4.api.pcomSetQty(0,'6');
    eq('scrii 6 (altceva decât regula) → excepția ta, NU se memorează',w4.api.mem['emag|p:av-x|10'],undefined);
    const Y=C({produsId:9,pnk:'AV-Y'}),w5=world([Y]);
    w5.api.pcomRefreshPackSuggestions();
    w5.api.pcomSetQty(0,'1');
    eq('linie convertită automat, tu scrii 1 → rămâne 1 (nu se reconvertește), memorat „fără conversie"',[Y.cantitate,Y._packReverted,w5.api.mem['emag|p:av-y|9']&&w5.api.mem['emag|p:av-y|9'].r],[1,true,1]);
    w5.api.pcomRefreshPackSuggestions();
    eq('…și la randările următoare rămâne 1',Y.cantitate,1);
    const Z=C({produsId:9,pnk:'AV-Z'}),w6=world([Z]);
    w6.api.pcomRefreshPackSuggestions();w6.api.pcomAdjustQty(0,1);
    eq('„+" pe o linie convertită (5 → 6): excepția ta, nu se reconvertește și nu se memorează',[Z.cantitate,Z._packReverted,w6.api.mem['emag|p:av-z|9']],[6,true,undefined]);

    // îmbinarea cu cloud-ul: câștigă intrarea mai nouă
    const w7=world([]);w7.api.pcomPackLearn(C({produsId:10,pnk:'AV-C'}),3);
    const k='emag|p:av-c|10',t0=w7.api.mem[k].at;
    w7.api.pcomPackMemMerge({[k]:{r:7,at:t0-5000}});
    eq('intrarea din cloud mai VECHE nu o suprascrie pe cea locală',w7.api.mem[k].r,3);
    w7.api.pcomPackMemMerge({[k]:{r:7,at:t0+5000},'x|y|1':{r:2,at:1},'bad':{r:0,at:1}});
    eq('intrarea din cloud mai NOUĂ câștigă; intrările invalide (r=0) se ignoră',[w7.api.mem[k].r,w7.api.mem['x|y|1'].r,w7.api.mem['bad']],[7,2,undefined]);
  }

  console.log('\n— Integrare în pagină (verificări pe cod) —');
  {
    const SRC=src;
    eq('alegerea manuală a produsului desface conversia produsului vechi și lasă regula să reevalueze',/Produs nou ales → regula de pachet se reevaluează[\s\S]{0,500}ln\._autoPack=null;ln\._packReverted=false;ln\.suggestedCantitate=null/.test(SRC),true);
    eq('memoria conversiilor se încarcă la pornire, înaintea ciornei',/pcomPackMemLoad\(\)\.then\([\s\S]{0,200}\);\s*\nloadPcomImportState\(\)/.test(SRC),true);
    eq('chip-ul spune „buc." (nu „pachet de null") pentru produs fără pachet',/const to=a\.productPack>1\?`pachet de \$\{a\.productPack\} buc\.`:'buc\.'/.test(SRC),true);
  }
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE DE CONVERSIE A PACHETELOR AU TRECUT');
  process.exit(failed?1:0);
})();
