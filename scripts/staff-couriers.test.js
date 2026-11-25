#!/usr/bin/env node
/* Test „Rândul cu curierii care ridică” din Staff (Update #782 Admin / #450 Staff) — funcțiile REALE din staff.html.
   Cerut direct: „sus, un rând cu curierii pentru care avem AWB-uri și câte: Cargus, FAN, DPD, Sameday — doar aceștia ridică; unele se combină cu FAN / DPD / Sameday”.
   Valorile `awb_courier` de mai jos sunt cele reale din producție (25.11.2026). Rulează: node scripts/staff-couriers.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','staff.html'),'utf8');
const grabFn=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');if(i<0)throw new Error('lipsește '+n);return src.slice(i,src.indexOf(';\n',i)+2);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

const code=grabConst('COURIER_PICKUP')+['courierGroupOf','courierCounts'].map(grabFn).join('\n')+';return{COURIER_PICKUP,courierGroupOf,courierCounts}';
const {COURIER_PICKUP,courierGroupOf,courierCounts}=new Function(code)();

console.log('\n— Cine ridică —');
eq('doar 4 curieri, în ordinea cerută',COURIER_PICKUP,['Cargus','FAN Courier','DPD','Sameday']);

console.log('\n— Contopirea valorilor reale din producție —');
const G=courierGroupOf;
eq('Cargus',G('Cargus'),'Cargus');
eq('Sameday / easybox / eMAG Courier / eMAG Ungaria (furgefutar.hu) → Sameday',[G('Sameday'),G('Sameday easybox'),G('eMAG Courier'),G('furgefutar.hu')],['Sameday','Sameday','Sameday','Sameday']);
eq('FAN Courier și variantele cu BoxNow (în orice ordine/scriere) → FAN',[G('FAN Courier'),G('FAN Courier / BOX NOW'),G('FAN Courier / BoxNow'),G('BoxNow / FAN Courier'),G('FANbox')],['FAN Courier','FAN Courier','FAN Courier','FAN Courier','FAN Courier']);
eq('BoxNow singur, ACS, ELTA (curierii Trendyol GR/BG) → FAN, ca la ordinea cozii',[G('BoxNow'),G('BOX NOW'),G('ACS'),G('ELTA Courier')],['FAN Courier','FAN Courier','FAN Courier','FAN Courier']);
eq('DPD și „ACS / DPD GR” → DPD (DPD e scris explicit)',[G('DPD'),G('ACS / DPD GR')],['DPD','DPD']);
eq('GLS, fără curier, necunoscut → „Alt curier” (nu ridică nimeni dintre cei 4)',[G('GLS'),G(''),G(null),G(undefined),G('Poșta Română')],['Alt curier','Alt curier','Alt curier','Alt curier','Alt curier']);

console.log('\n— Numărătoarea —');
const L=(extra)=>({awb_extra:extra||[]});
const O=(awb,courier,o={})=>({awb,awbCourier:courier,finalized:false,waiting:false,oldDone:false,awaitingAwb:false,lines:[L(o.extra)],...o});
const orders=[
  O('1','Sameday'),O('2','Sameday',{finalized:true}),O('3','eMAG Courier'),
  O('4','Cargus',{finalized:true}),O('5','Cargus'),
  O('6','FAN Courier / BoxNow'),O('7','ACS'),O('8','DPD'),
  O('9','GLS'),O('10',''),
  O('11','Sameday',{waiting:true}),                       // „În așteptare” → nu se numără
  O('12','Sameday',{oldDone:true,finalized:true}),        // finalizată înainte de coada de azi → nu se numără
  O('',  'Sameday'),                                      // fără AWB → nu se numără
  O('13','Cargus',{awaitingAwb:true}),                    // marcată „Așteaptă AWB” → nu se numără
  O('14','DPD',{extra:['14a','14b','14']}),               // colete multiple: AWB principal + 2 suplimentare (duplicatul 14 nu se dublează) = 3
];
const c=courierCounts(orders);
const sum=k=>[c[k].n,c[k].ready];
eq('Sameday: 3 AWB-uri (1, 2, 3), 1 gata',sum('Sameday'),[3,1]);
eq('Cargus: 2, 1 gata',sum('Cargus'),[2,1]);
eq('FAN: 2 (FAN/BoxNow + ACS), 0 gata',sum('FAN Courier'),[2,0]);
eq('DPD: 1 + 3 colete = 4 (8, 14, 14a, 14b)',sum('DPD'),[4,0]);
eq('Alt curier: GLS + fără curier = 2',sum('Alt curier'),[2,0]);
eq('totalul se adună (nimic pierdut între cele 5 căsuțe)',Object.values(c).reduce((t,x)=>t+x.n,0),3+2+2+4+2);
eq('detalii pe curierul real (pentru tooltip): Sameday = Sameday 2 + eMAG Courier 1',c['Sameday'].raw,{'Sameday':2,'eMAG Courier':1});
eq('fără comenzi → toate zero, fără erori',Object.values(courierCounts([])).map(x=>x.n),[0,0,0,0,0]);
eq('intrări nule/ciudate nu aruncă',Object.values(courierCounts([null,undefined,{}])).map(x=>x.n),[0,0,0,0,0]);

console.log('\n— Integrare în staff.html —');
eq('renderCourierBar folosește courierCounts: cele 4 căsuțe + rândul „alt curier”',/function renderCourierBar\(\)\{[\s\S]*?courierCounts\(ORDERS\)[\s\S]*?COURIER_PICKUP\.map\(chip\)\.join\(''\)\+otherChip/.test(src),true);
eq('apăsarea pe curier rămâne „a venit” (toggleCourierArrived cu cheia grupului)',/onclick="toggleCourierArrived\('\$\{esc\(k\)\}'\)"/.test(src),true);
eq('bara e randată din renderMain (la fiecare reîmprospătare)',/renderProgress\(\);\s*\n\s*renderCourierBar\(\);/.test(src),true);
eq('elementul #courier-bar rămâne deasupra tab-urilor',src.indexOf('id="courier-bar"')>0&&src.indexOf('id="courier-bar"')<src.indexOf('class="tabbar"'),true);
eq('cheile „a venit” deja salvate (Sameday, FAN Courier, DPD, Cargus) coincid cu cheile grupelor',COURIER_PICKUP.every(k=>['Cargus','Sameday','DPD','FAN Courier'].includes(k)),true);
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE RÂNDULUI DE CURIERI AU TRECUT');
process.exit(failed?1:0);
