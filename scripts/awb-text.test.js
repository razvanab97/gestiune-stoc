#!/usr/bin/env node
/* Test „Text selectabil din etichetele AWB" (Update #769) — funcțiile REALE din index.html, pe o etichetă sintetică modelată după cele Cargus/Sameday/FAN
   (fără date reale de clienți). Verifică: geometria stratului de text, gruparea pe rânduri, detectarea telefoanelor (și că AWB-urile/datele/rutele NU
   sunt luate drept telefon), „doar valoarea", panoul (escapare HTML, avertisment AI) și integrarea în pagină. Rulează: node scripts/awb-text.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grabFn=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');if(i<0)throw new Error('lipsește '+n);return src.slice(i,src.indexOf(';\n',i)+2);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const esc=s=>String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const code=[grabConst('awbMul'),...['awbBuildTextLayer','awbTextLines','awbPhonesInLines','awbSplitKV','awbZoomPanelHtml'].map(grabFn)].join('\n')+';return{awbMul,awbBuildTextLayer,awbTextLines,awbPhonesInLines,awbSplitKV,awbZoomPanelHtml}';
const A=new Function('esc',code)(esc);

// pagină A6 (298 × 420 pt), viewport scale 1 ca la PDF.js: [1,0,0,-1,0,420]
const VP=[1,0,0,-1,0,420],W=298,H=420;
// fragment de text în coordonate PDF (origine jos-stânga): baseline la y=yPdf
const it=(str,x,yPdf,fs=10,width)=>({str,transform:[fs,0,0,fs,x,yPdf],width:width==null?str.length*fs*0.5:width});

console.log('\n— Geometria stratului de text —');
{
  const L=A.awbBuildTextLayer([it('AWB',30,380,10,24),it('  ',60,380),it('',70,380),{str:'x'}],W,H,VP);
  eq('textul gol / doar spații / fără transformare e ignorat',L.items.length,1);
  const a=L.items[0];
  eq('x și lățimea sunt fracții din lățimea paginii',[a.x,Math.round(a.w*W)],[30/W,24]);
  eq('y = colțul de sus (baseline 380 din jos → 40 de sus, minus ~0,82 din font), ca fracție din înălțime',Math.round(a.y*H*100)/100,Math.round((40-8.2)*100)/100);
  eq('înălțimea = mărimea fontului / înălțimea paginii',Math.round(a.h*H),10);
  const rot=A.awbBuildTextLayer([{str:'First Mile',transform:[7,7,-7,7,100,200],width:50}],W,H,VP);
  eq('textul rotit (filigranul diagonal Sameday) e ignorat',rot.items.length,0);
  eq('matricea de viewport inversează axa y (PDF origine jos → ecran origine sus)',A.awbMul(VP,[1,0,0,1,0,380]).slice(4),[0,40]);
}

console.log('\n— Rânduri (de sus în jos, de la stânga la dreapta) —');
{
  // etichetă sintetică Cargus: două coloane pe același rând + rânduri separate
  const raw=[
    it('Destinatar:',10,200,10),it('RO-FIRMA TEST SA',62,200.5,10),
    it('Expeditor:',10,260,10),it('AB TEXTILE SRL',60,260,10),
    it('Contact:',10,170,10),it('Ion Popescu',50,170,10),it('+40 712 345 678',110,170,10),
    it('Nota:',10,330,10),it('1214069727',40,330,10)
  ];
  const L=A.awbBuildTextLayer(raw,W,H,VP);
  eq('rândurile ies în ordinea paginii, cu fragmentele unite pe același rând',A.awbTextLines(L),['Nota: 1214069727','Expeditor: AB TEXTILE SRL','Destinatar: RO-FIRMA TEST SA','Contact: Ion Popescu +40 712 345 678']);
  eq('o abatere mică pe verticală (200 vs 200,5) nu rupe rândul',A.awbTextLines(L).filter(x=>x.startsWith('Destinatar')).length,1);
  eq('fără text → fără rânduri',A.awbTextLines({items:[]}),[]);
  // tabel Cargus: celule diferite pe același rând vizual (gol mare între ele) NU se lipesc
  const T=A.awbBuildTextLayer([it('Expeditor:',10,300,9),it('AB TEXTILE SRL',58,300,9),it('Plic',200,300,9),it('Colet',230,300,9),it('Palet',262,300,9)],W,H,VP);
  eq('celulele de tabel de pe același rând (gol mare) devin rânduri separate',A.awbTextLines(T),['Expeditor: AB TEXTILE SRL','Plic','Colet','Palet']);
  const N=A.awbBuildTextLayer([it('Nota:',10,330,9),it('1214069727',120,330,9)],W,H,VP);
  eq('„Nota:” și valoarea din celula de lângă (gol mare) rămân împreună: eticheta se termină cu „:”',A.awbTextLines(N),['Nota: 1214069727']);
  const D=A.awbBuildTextLayer([it('Destinatar:',10,250,9),it('RO-FIRMA SA',62,250,9),it('Incercari permise',62+11*4.5+5.4,250,9)],W,H,VP);
  eq('două celule vecine cu gol mic (≈0,6 × font), „Destinatar: …SA" | „Incercari permise" → separate (caz real Cargus)',A.awbTextLines(D),['Destinatar: RO-FIRMA SA','Incercari permise']);
  const S=A.awbBuildTextLayer([it('Str.',10,300,9),it('Dristorului,',32,300,9),it('Nr.',90,300,9),it('91-95',104,300,9)],W,H,VP);
  eq('cuvintele aceleiași propoziții (goluri mici) rămân împreună',A.awbTextLines(S),['Str. Dristorului, Nr. 91-95']);
}

console.log('\n— Telefoane (și ce NU e telefon) —');
{
  const P=ls=>A.awbPhonesInLines(ls).map(x=>x.copy);
  eq('+40768198389 (ca pe eticheta Cargus din captură)',P(['Contact: George Dinu +40768198389']),['+40768198389']);
  eq('cu spații: „+40 768 198 389” → +40768198389',P(['Tel +40 768 198 389']),['+40768198389']);
  eq('fără prefix: 0768198389',P(['0768198389']),['0768198389']);
  eq('telefon fix București: 021 933 0123',P(['Tel 021 933 0123']),['0219330123']);
  eq('același număr în două forme (+40… și 0…) rămâne cu ambele variante',P(['+40768198389','0768198389']),['+40768198389','0768198389']);
  eq('exact același număr scris de două ori → o singură dată',P(['+40768198389','+40 768 198 389']),['+40768198389']);
  eq('AWB Cargus 1214069727 NU e telefon',P(['Nota: 1214069727']),[]);
  eq('AWB FAN 7000183099770 NU e telefon',P(['AWB: 7000183099770']),[]);
  eq('AWB eMAG Courier 4EMGLN199690149001 NU e telefon',P(['4EMGLN199690149001']),[]);
  eq('data 23.11.2026, ruta 10-03-60-09, codul 077 - 37-09-30-08, greutatea 0.000167/1 NU sunt telefoane',P(['Data: 23.11.2026','Ruta: 10-03-60-09','077 - 37-09-30-08','G/GVol/GEv: 1/0.000167/1 KG']),[]);
  eq('număr mascat („***4614”) NU e telefon',P(['Ignat Gab*** / ***4614']),[]);
  eq('referința „4EMGLN…_583304927_266750487” (Sameday) NU e telefon — bug găsit pe o etichetă reală',P(['4EMGLN199690149001_583304927_266750487']),[]);
  eq('un ID de 9 cifre fără 0/40 în față NU e telefon',P(['ID 266750487']),[]);
  eq('„Tel/Fax 40 21 637 0660” (prefix 40 fără +) → +40216370660',P(['Tel/Fax 40 21 637 0660']),['+40216370660']);
  eq('un număr lipit de litere nu e telefon („ABC0768198389”)',P(['ABC0768198389']),[]);
  eq('mai multe telefoane pe rânduri diferite',P(['+40712290109 Ruta','Contact +40768198389']),['+40712290109','+40768198389']);
}

console.log('\n— „Eticheta: valoare" —');
{
  const kv=A.awbSplitKV;
  eq('„Destinatar: RO-ARMYSECURITY SA"',kv('Destinatar: RO-ARMYSECURITY SA'),{k:'Destinatar',v:'RO-ARMYSECURITY SA'});
  eq('„Contact: eMAG Ab Homes Invest" → valoarea fără etichetă',kv('Contact: eMAG Ab Homes Invest').v,'eMAG Ab Homes Invest');
  eq('o etichetă cu diacritice: „Observații: nimic"',kv('Observații: nimic'),{k:'Observații',v:'nimic'});
  eq('rând fără „:" → null',kv('RAMBURS 0.00 RON'),null);
  eq('două puncte la final, fără valoare → null',kv('Platitor:'),null);
  eq('ora „Data AWB: 24.11.2026" e tot cheie:valoare (copiezi data)',kv('Data AWB: 24.11.2026').v,'24.11.2026');
}

console.log('\n— Panoul —');
{
  const html=A.awbZoomPanelHtml(['Destinatar: RO-FIRMA <img src=x onerror=alert(1)> SA','Contact: Ion +40768198389','Platitor: Expeditor'],'pdf');
  eq('HTML-ul din text e escapat (nu devine element)',html.includes('<img src=x')||html.includes('onerror=alert(1)>'),false);
  const h2=A.awbZoomPanelHtml(['Expeditor: AB SRL','Destinatar: RO-FIRMA TEST SA','Contact: Ion +40768198389'],'pdf');
  eq('numele destinatarului apare ca buton („👤 …”), înaintea telefoanelor, și copiază doar valoarea',h2.includes('👤 RO-FIRMA TEST SA')&&h2.indexOf('👤')<h2.indexOf('📞')&&h2.includes('copyText(&quot;RO-FIRMA TEST SA&quot;)'),true);
  eq('fără rând „Destinatar:” nu apare butonul de nume',A.awbZoomPanelHtml(['Expeditor: AB SRL'],'pdf').includes('👤'),false);
  eq('butonul de telefon cu numărul de copiat',html.includes('📞 +40768198389')&&html.includes('copyText(&quot;+40768198389&quot;)'),true);
  eq('rândurile cu „Eticheta: valoare" au „doar valoarea"',(html.match(/doar valoarea/g)||[]).length,3);
  eq('„Copiază tot textul" cu toate rândurile',html.includes('Copiază tot textul')&&html.includes('Platitor: Expeditor'),true);
  eq('sursa PDF: nota „Text exact din PDF", fără avertisment',html.includes('Text exact din PDF')&&!html.includes('izp-note warn'),true);
  const ai=A.awbZoomPanelHtml(['Ceva'],'ai');
  eq('sursa AI: avertisment vizibil să verifici cifrele',ai.includes('izp-note warn')&&ai.includes('Verifică cifrele'),true);
  eq('fără rânduri: mesaj, nu panou gol',A.awbZoomPanelHtml([],'pdf').includes('Nu am găsit text în etichetă'),true);
  const q=A.awbZoomPanelHtml(['Adresa: str. "Mare" nr 1'],'pdf');
  eq('ghilimelele din text nu sparg atributul onclick',/onclick="copyText\(&quot;Adresa: str\. \\&quot;Mare\\&quot; nr 1&quot;\)"/.test(q),true);
}

console.log('\n— Integrare în pagină —');
{
  eq('miniatura din „Asociază AWB-uri" deschide lightbox-ul etichetei (cu PDF-ul din memorie)',/function awbThumbHtml[\s\S]{0,400}AWB_THUMB_P\[prefix\+'-'\+idx\]=p[\s\S]{0,500}onclick="awbZoomFromThumb\(this,'\$\{prefix\}-\$\{idx\}'\)"/.test(src),true);
  eq('„👁 Vezi AWB" deschide lightbox-ul etichetei, cu fișierul și pagina sursă',/onclick="pcomZoomAwbPreview\(\$\{Number\(committedRow\.id\)\}\)"[^>]*>👁 Vezi AWB/.test(src)&&/function pcomZoomAwbPreview\(id\)\{[^}]*awbSourceFile[^}]*awbSourcePage/.test(src),true);
  eq('ordinea de rezolvare: PDF în memorie → conector (arhiva de pe Mac) → AI pe imagine',/opts\.blob\)\{try\{layer=await awbExtractTextLayer[\s\S]{0,400}awbTextFromConnector[\s\S]{0,900}awbTextFromImageAI/.test(src),true);
  eq('o deschidere obișnuită (poză de produs) oprește modul etichetă rămas de la o deschidere anterioară',/function openImgZoom\(src,awbMode\)\{[\s\S]{0,400}if\(!awbMode\)\{awbZoomToken\+\+;ov\.classList\.remove\('awb'\)/.test(src),true);
  eq('închiderea invalidează un răspuns care vine târziu (token) și golește stratul și panoul',/function closeImgZoom\(\)\{awbZoomToken\+\+;[\s\S]{0,300}imgzoom-text'\)\.innerHTML=''/.test(src),true);
  eq('lightbox-ul are stratul de text și panoul în pagină',src.includes('id="imgzoom-text"')&&src.includes('id="imgzoom-panel"'),true);
  eq('imaginea nu mai are stil inline care să blocheze mărimea în modul etichetă',!/<img id="imgzoom-src"[^>]*style=/.test(src),true);
  eq('textul selectat din strat se vede (::selection) și textul în sine e transparent',/\.imgzoom-text span::selection\{background:rgba\(118,87,246,\.38\)/.test(src)&&/\.imgzoom-text span\{[^}]*color:transparent[^}]*user-select:text/.test(src),true);
}
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE TEXTULUI DIN ETICHETE AU TRECUT');
process.exit(failed?1:0);
