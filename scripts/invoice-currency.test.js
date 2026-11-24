#!/usr/bin/env node
/* Test „Distincția EUR / RON la încărcările de stoc" (Update #771) — funcțiile REALE din index.html.
   Cazul real: produsul „15" (EAN 5902802915054) a avut un cost reținut 10,33 „RON" (de fapt 10,31 EUR scris ca lei la o încărcare veche);
   la următoarea factură, în EUR, avertismentul zicea „pare prețul TOTAL" pentru prețul corect. Rulează: node scripts/invoice-currency.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const cst=n=>{const m=src.match(new RegExp('const '+n+'=.*?;\\n','s'));if(!m)throw new Error('lipsește '+n);return m[0];};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

const names=['invNear','invCostRon','invOldCostEffective','invCurrencyAdvice','invSupplierUsualCurrency','invLineCurrencyFields','weightedAvgCost'];
const code=cst('EUR_RON')+cst('INV_CUR_TOL')+names.map(grab).join('\n')+`;return{${names.join(',')}}`;
const api=new Function(code)();
const {invNear,invCostRon,invOldCostEffective,invCurrencyAdvice,invSupplierUsualCurrency,invLineCurrencyFields,weightedAvgCost}=api;

console.log('\n— Conversia —');
eq('10,31 EUR × 5,07 = 52,27 RON',invCostRon(10.31,'EUR'),52.27);
eq('RON rămâne neschimbat',invCostRon(10.31,'RON'),10.31);
eq('invNear: același număr (±6%)',[invNear(10.31,10.33),invNear(10.31,52.27),invNear(0,10),invNear(10,0)],[true,false,false,false]);

console.log('\n— Cazul real (captura): factura în RON, costul vechi din fișă = numărul din EUR —');
{
  // Maxy: comanda a fost în EUR (10,31), dar a intrat în stoc ca „10,33 RON"; factura reală e în RON: 52,27/buc.
  const p={id:15,priceBuyTTC:10.33,priceBuyEur:0};
  const it={priceBuy:52.27,currency:'RON',costRon:52.27,qty:5,lineTotalOriginal:261.35};
  const a=invCurrencyAdvice(it,p);
  eq('RON 52,27 vs cost vechi 10,33 → raport 5,06 = cursul EUR → „costul vechi era în EUR", corecție automată (strong)',[a&&a.kind,a&&a.strong,a&&a.fixed,a&&Math.round(a.ratio*100)/100],['old-cost-eur',true,52.37,5.06]);
  eq('…chiar dacă cantitatea (5) seamănă cu raportul: totalul din factură confirmă prețul pe unitate → nu e „preț TOTAL"',a.qtyAmbig,false);
  const amb=invCurrencyAdvice({priceBuy:52.27,currency:'RON',costRon:52.27,qty:5},p);
  eq('fără total verificabil și cantitatea = raportul → AMBIGUU: doar sugestie (nu corecție automată) + avertismentul de „preț total" rămâne',[amb.strong,amb.qtyAmbig],[false,true]);
  const poluat=weightedAvgCost(6,10.33,5,58.23),corect=weightedAvgCost(6,a.fixed,5,58.23);
  eq('media ponderată poluată (10,33) = 32,10 — exact ce rămăsese în fișă',poluat,32.1);
  eq('media ponderată cu costul vechi corectat = 55,03 (nu 32,10)',corect,55.03);
}

console.log('\n— Linie în EUR, costul vechi = același număr, reținut ca RON —');
{
  const it={priceBuy:10.31,currency:'EUR',costRon:52.27,qty:2};
  const a=invCurrencyAdvice(it,{id:15,priceBuyTTC:10.33,priceBuyEur:0});
  eq('EUR 10,31 (AI) vs 10,33 RON în fișă → raport 5,06 → strong, corecție automată',[a&&a.kind,a&&a.strong,a&&a.fixed],['old-cost-eur',true,52.37]);
  const u=invCurrencyAdvice({...it,_curUser:true},{id:15,priceBuyTTC:10.33,priceBuyEur:0});
  eq('moneda aleasă MANUAL de om (EUR) + număr identic → ambiguu (poate e de fapt RON) → doar sugestie',[u.kind,u.strong],['old-cost-eur',false]);
  const c=invCurrencyAdvice({...it,_curUser:true},{id:15,priceBuyTTC:10.33,priceBuyEur:10.31});
  eq('…dar dacă produsul are și prețul EUR 10,31 salvat → confirmat, strong',[c.strong,c.confirmed],[true,true]);
  const w=invCurrencyAdvice({priceBuy:10.31,currency:'EUR',costRon:52.27,qty:6},{id:15,priceBuyTTC:11.2});
  eq('raport 4,67 (în afara ±3% dar în ±8% de curs) → sugestie, nu automat',[w.kind,w.strong],['old-cost-eur',false]);
}

console.log('\n— Linie în RON cu numărul din EUR —');
{
  eq('10,31 „RON" când produsul are 10,31 EUR salvat → „treci în EUR", strong',invCurrencyAdvice({priceBuy:10.31,currency:'RON',costRon:10.31,qty:1},{id:15,priceBuyTTC:55,priceBuyEur:10.31}),{kind:'eur-as-ron',eur:10.31,strong:true});
  const w=invCurrencyAdvice({priceBuy:10.31,currency:'RON',costRon:10.31,qty:1},{id:15,priceBuyTTC:52.37});
  eq('10,31 „RON" vs cost din fișă 52,37 (de 5,08× mai mare) → sugestie „poate e în EUR", fără a presupune',[w.kind,w.strong,w.eur,w.oldCost],['eur-as-ron',false,0,52.37]);
  eq('52,27 RON (corect) vs cost 55 → nimic suspect',invCurrencyAdvice({priceBuy:52.27,currency:'RON',costRon:52.27,qty:1},{id:15,priceBuyTTC:55,priceBuyEur:10.31}),null);
}

console.log('\n— Fără alarme false —');
{
  eq('creștere reală de preț în EUR (10 RON → 4 EUR = 20,28 RON, ×2) → nimic',invCurrencyAdvice({priceBuy:4,currency:'EUR',costRon:20.28,qty:1},{id:2,priceBuyTTC:10,priceBuyEur:0}),null);
  eq('preț nou de 1,5× față de vechi → nimic',invCurrencyAdvice({priceBuy:15,currency:'RON',costRon:15,qty:3},{id:2,priceBuyTTC:10}),null);
  eq('factură EUR normală, cost vechi corect în RON (52,37) → nimic',invCurrencyAdvice({priceBuy:10.5,currency:'EUR',costRon:53.24,qty:1},{id:15,priceBuyTTC:52.37,priceBuyEur:10.31}),null);
  eq('fără produs asociat → nimic',invCurrencyAdvice({priceBuy:10,currency:'EUR',costRon:50.7,qty:1},null),null);
  eq('preț zero → nimic',invCurrencyAdvice({priceBuy:0,currency:'EUR',costRon:0,qty:1},{id:1,priceBuyTTC:10,priceBuyEur:10}),null);
  eq('produs fără cost în fișă (nou) → nimic',invCurrencyAdvice({priceBuy:10,currency:'EUR',costRon:50.7,qty:1},{id:1,priceBuyTTC:0}),null);
}

console.log('\n— Costul vechi efectiv —');
{
  const p={id:15,priceBuyTTC:10.33};
  eq('fără corecție → costul din fișă',invOldCostEffective({},p),10.33);
  eq('cu corecție pentru ACELAȘI produs → costul corectat',invOldCostEffective({_oldCostFix:52.37,_oldCostFixFor:15},p),52.37);
  eq('corecție făcută pentru alt produs (s-a schimbat alegerea) → nu se aplică',invOldCostEffective({_oldCostFix:52.37,_oldCostFixFor:99},p),10.33);
  eq('fără produs → 0',invOldCostEffective({_oldCostFix:52.37,_oldCostFixFor:15},null),0);
}

console.log('\n— Moneda obișnuită a furnizorului —');
{
  const prods=[1,2,3,4].map(i=>({supplier:'Maxy',priceBuyEur:5+i})).concat([{supplier:'Maxy',priceBuyEur:0},{supplier:'Alt',priceBuyEur:3}]);
  eq('Maxy: 4 produse cu preț EUR salvat din 5 → EUR',invSupplierUsualCurrency('maxy',prods,[]),'EUR');
  eq('furnizor necunoscut → null',invSupplierUsualCurrency('Nou',prods,[]),null);
  eq('prea puține date (2 produse) → null, nu ghicește',invSupplierUsualCurrency('Alt',[{supplier:'Alt',priceBuyEur:3},{supplier:'Alt',priceBuyEur:4}],[]),null);
  const ord=[{supplier:'Jumbo',details:[{currency:'RON'},{currency:'RON'},{currency:'RON'},{currency:'EUR'}]}];
  eq('Jumbo: din istoricul încărcărilor (3 RON, 1 EUR) → RON',invSupplierUsualCurrency('Jumbo',[],ord),'RON');
  eq('nume gol → null',invSupplierUsualCurrency('',prods,[]),null);
}

console.log('\n— Ce se scrie în istoricul încărcării —');
{
  eq('linie EUR: moneda, numărul original și cursul rămân în istoric',invLineCurrencyFields({currency:'EUR',priceBuy:10.31},null),{currency:'EUR',priceOriginal:10.31,eurRate:5.07});
  eq('linie RON: fără curs',invLineCurrencyFields({currency:'RON',priceBuy:55},null),{currency:'RON',priceOriginal:55});
  eq('cost vechi corectat se notează în istoric',invLineCurrencyFields({currency:'EUR',priceBuy:10.31,_oldCostFix:52.37,_oldCostFixFor:15},{id:15}).oldPriceCorrected,52.37);
}

console.log('\n— Integrare în index.html —');
eq('applyInvoice amestecă cu costul vechi EFECTIV (corectat), nu cu cel poluat',/const oldCost=invOldCostEffective\(item,P\[idx\]\);\s*\n\s*\/\/ Cost mediu ponderat/.test(src),true);
eq('toate cele 3 tipuri de linie din istoric primesc câmpurile de monedă',(src.match(/\.\.\.invLineCurrencyFields\(item,/g)||[]).length,3);
eq('selectorul RON/EUR există pe fiecare linie (setInvItemCurrency)',/onchange="setInvItemCurrency\(\$\{idx\},this\.value\)"/.test(src),true);
eq('selectorul de factură din antet (setInvAllCurrency) există',/id="inv-currency"[^>]*onchange="setInvAllCurrency\(this\.value\)"/.test(src),true);
eq('avertismentul „pare prețul TOTAL" se arată doar fără sfat de monedă, sau când „preț total" e la fel de plauzibil (qtyAmbig)',/if\(p&&oldPrice>0&&item\._landedCost>0&&\(!curAdv\|\|\(curAdv\.qtyAmbig&&!oldFixed\)\)\)\{/.test(src),true);
eq('Comandă furnizor: banner de monedă în previzualizare',/furnizorDupHtml\(\)\+furnizorCurrencyBannerHtml\(\)\+bulk/.test(src),true);
eq('previzualizarea facturii: banner de monedă + selector sincronizat',/invoiceDuplicateBannerHtml\(\)\+invCurrencyBannerHtml\(\)\+rows;\s*\n\s*syncInvCurrencySelect\(\);/.test(src),true);
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE DE MONEDĂ AU TRECUT');
process.exit(failed?1:0);
