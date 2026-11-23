#!/usr/bin/env node
/* Test al conversiei listare → unități de stoc (seturi / pachete), în special „Statie radio 2x": o unitate de stoc = 2 stații.
   Funcțiile REALE din index.html; titlurile sunt cele reale de stații radio din comenzi. Rulează: node scripts/pack-size.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const cst=n=>{const m=src.match(new RegExp('const '+n+'=.*?;\\n','s'));if(!m)throw new Error('lipsește '+n);return m[0];};
const names=['pcomPackFromNx','pcomDetectPackSize','pcomPackPlan','pcomSuggestQtyForPackMismatch','pcomRescalePriceForQty','pcomAutoPackLine','pcomRevertAutoPack','pcomRefreshPackSuggestions'];
const code=cst('PCOM_NUM_WORDS')+names.map(grab).join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
function world(lines){
  const log=[],P=[{id:172,name:'Statie radio 2x Baofeng BF888S'},{id:7,name:'Set 20 umerașe catifea'},{id:8,name:'Cutie depozitare 42L'}];
  const env={P,renderPcomImportPreview(){log.push('render');},pcomPersistQtyIfCommitted(i){log.push('persist'+i);},fmtQty:x=>String(x),state:{p:lines}};
  const keys=Object.keys(env);
  const api=new Function(...keys,'let pcImpParsed=state.p;'+code+';return{pcomDetectPackSize,pcomPackPlan,pcomSuggestQtyForPackMismatch,pcomAutoPackLine,pcomRevertAutoPack,pcomRefreshPackSuggestions,get lines(){return pcImpParsed}}')(...keys.map(k=>env[k]));
  return{api,log};
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
  eq('Set 4 × 1 → 2 cutii, se aplică singur',p(1,T4),{suggested:2,titlePack:4,productPack:2,auto:true});
  eq('Set 2 × 1 → 1 cutie = ce e deja: nimic de schimbat',p(1,'Set 2 Statii Radio Baofeng'),null);
  eq('Set 2 × 2 → 2 cutii = ce e deja',p(2,'Set 2 Statii Radio Baofeng'),null);
  eq('Set 4 × 2 → 4 cutii, automat',p(2,T4),{suggested:4,titlePack:4,productPack:2,auto:true});
  eq('„Set doua" × 1 → 1 cutie: nimic de schimbat',p(1,'Set doua Statii Walkie Talkie Baofeng'),null);
  eq('bulgară Set 8 × 1 → 4 cutii, automat',p(1,'Комплект от 8 програмируеми радиостанции')&&p(1,'Комплект от 8 програмируеми радиостанции').suggested,4);
  eq('Set 3 × 1 → 1,5 cutii: DOAR sugestie (nu e număr întreg)',p(1,'Set 3 statii radio'),{suggested:1.5,titlePack:3,productPack:2,auto:false});
  console.log('\n— Comportamentul vechi rămâne pentru restul produselor —');
  eq('produs-set fără „Nx" („Set 20 umerașe"), titlu „Set de 30" → sugestie 1,5, NU automat',api.pcomPackPlan(1,'Set de 30 umerașe',7),{suggested:1.5,titlePack:30,productPack:20,auto:false});
  eq('produs fără pachet („Cutie depozitare"), titlu „Set 3 cutii" → sugestie 3, NU automat',api.pcomPackPlan(1,'Set 3 cutii',8),{suggested:3,titlePack:3,productPack:null,auto:false});
  eq('fără produs asociat → doar sugestie',api.pcomPackPlan(1,'Set 4 statii',null),{suggested:4,titlePack:4,productPack:null,auto:false});
})();
(()=>{
  console.log('\n— Aplicare automată pe linie + anulare —');
  const a=L(),w=world([a]);
  w.api.pcomAutoPackLine(a);
  eq('linia nouă: 1 × Set 4 → 2 cutii; prețul total rămâne același (preț/buc înjumătățit)',[a.cantitate,a.cantitateComanda,a.pretFaraTva,a.suggestedCantitate,a._autoPack],[2,1,50,null,{de:1,la:2,titlePack:4,productPack:2}]);
  w.api.pcomAutoPackLine(a);
  eq('a doua trecere nu dublează conversia',[a.cantitate,a.pretFaraTva],[2,50]);
  w.api.pcomRevertAutoPack(0);
  eq('„anulează conversia": revine 1 × ; prețul revine; sugestia 2 rămâne vizibilă',[a.cantitate,a.pretFaraTva,a.suggestedCantitate,a._autoPack,a._packReverted],[1,100,2,null,true]);
  w.api.pcomAutoPackLine(a);
  eq('după anulare nu se mai aplică singură',[a.cantitate,a._autoPack],[1,null]);
  const c=L({_committedId:9}),w2=world([c]);w2.api.pcomAutoPackLine(c);
  eq('linie deja comisă (în Staff): NU se schimbă în tăcere',[c.cantitate,c._autoPack],[1,undefined]);
  const o=L({produsId:8,titluExtern:'Set 3 cutii'}),w3=world([o]);w3.api.pcomAutoPackLine(o);
  eq('alt produs (fără „Nx"): nu se aplică automat',[o.cantitate,o._autoPack],[1,undefined]);

  console.log('\n— Ciornă veche (calculată înainte de regulă) —');
  const stale=L({suggestedCantitate:4,_committedId:5}),fresh=L(),edited=L({cantitate:3,cantitateComanda:1}),ok=L({titluExtern:'Set 2 Statii Radio',suggestedCantitate:2,_committedId:6});
  const w4=world([stale,fresh,edited,ok]);const ch=w4.api.pcomRefreshPackSuggestions();
  eq('comisă cu sugestia veche „4" → corectată la 2, cantitatea NU se atinge',[stale.suggestedCantitate,stale.cantitate],[2,1]);
  eq('necomisă și neatinsă → conversie automată (2 cutii)',[fresh.cantitate,!!fresh._autoPack],[2,true]);
  eq('modificată manual de tine (3 ≠ 1) → nu se atinge',[edited.cantitate,edited._autoPack],[3,undefined]);
  eq('sugestie veche care nu mai are sens („Set 2" × 1 = 1 cutie) → dispare',[ok.suggestedCantitate],[null]);
  eq('numărul de linii schimbate',ch,3);
})();
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE DE CONVERSIE A PACHETELOR AU TRECUT');
process.exit(failed?1:0);
