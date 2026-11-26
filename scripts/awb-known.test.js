#!/usr/bin/env node
/* Test „etichetă fără număr de comandă → comanda după AWB-ul deja salvat" (Update #783) — funcțiile REALE din index.html.
   Cazul real (26.11.2026): eticheta ACS/DPD Grecia (pagina 6 din Unknown-99.pdf) n-are numărul comenzii; AI-ul citea codul de client „2ΘΣ232960” drept AWB și eticheta
   rămânea „format nerecunoscut”, deși AWB-ul ei (2876970014) era deja salvat pe comanda Trendyol 11824598207. Rulează: node scripts/awb-known.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grabFn=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

(async()=>{
  const names=['awbNorm','awbLooksPlausible','awbTextView','awbKnownAwbIndex','awbKnownPick','awbMatchKnownInText','awbDigitRuns','awbResolveByKnownAwb'];
  const mk=(PCOM,dbRows)=>{
    const log={q:[]};
    const env={PCOM,AWB_KNOWN_FALSE_POSITIVES:new Set(),dbGet:async u=>{log.q.push(u);return dbRows||[];}};
    const keys=Object.keys(env);
    const code=names.map(grabFn).join('\n')+`;return{${names.join(',')}}`;
    return{api:new Function(...keys,code)(...keys.map(k=>env[k])),log};
  };

  // textul real al paginii (fără date personale): AWB-ul ACS + codul de client + AWB-ul DPD în formă de cod de bare, cu spații
  const acs=`1 - 0 008 140 974 389 7 - 286 000 000 17 1 0
sender AB HOMES
81409743897
Αρ.Αποστολής    Προέλευση Τεμ.
2876970014          ΘΣ            1     1.00      2ΘΣ232960             13/11/2026
ΑΠΟΣΤΟΛΕΑΣ AB HOMES   Ποσό/COD: 15.35 €`;
  const row=(o)=>({platforma:'trendyol',comandaId:'11824598207',awb:'2876970014',awbExtra:[],awbCourier:'ACS / DPD GR',anulata:false,...o});

  console.log('\n— Textul etichetei —');
  {
    const {api}=mk([]);
    eq('AWB scris cu spații („8 140 974 389 7”) devine un singur număr',api.awbTextView('x 8 140 974 389 7 y').includes('81409743897'),true);
    eq('numerele separate de linie nouă NU se lipesc între ele',api.awbTextView('123\n4567890123').includes('1234567890123'),false);
  }

  console.log('\n— Potrivirea după AWB-ul cunoscut —');
  {
    const {api}=mk([row()]);
    const idx=api.awbKnownAwbIndex();
    eq('eticheta ACS fără număr de comandă → comanda 11824598207, cu AWB-ul și curierul salvate',api.awbMatchKnownInText(acs,idx),{awb:'2876970014',comandaId:'11824598207',courier:'ACS / DPD GR',_knownAwb:true});
    eq('codul de client „2ΘΣ232960” nu e un AWB plauzibil (de-aceea eticheta rămânea nerecunoscută)',api.awbLooksPlausible('2ΘΣ232960','ACS'),false);
    eq('pagină fără niciun AWB cunoscut → null (nu ghicește)',api.awbMatchKnownInText('Sameday 123 Strada Mare nr 5, telefon 0712345678',idx),null);
  }
  {
    const {api}=mk([row({anulata:true})]);
    eq('comandă anulată → ignorată',api.awbMatchKnownInText(acs,api.awbKnownAwbIndex()),null);
  }
  {
    const {api}=mk([row(),row({comandaId:'11999999999',awb:'1212248167'})]);
    eq('două comenzi diferite, un singur AWB pe pagină → o singură potrivire',api.awbMatchKnownInText(acs,api.awbKnownAwbIndex()).comandaId,'11824598207');
    eq('pagină cu AWB-urile a DOUĂ comenzi diferite → ambiguu, null',api.awbMatchKnownInText(acs+'\n1212248167',api.awbKnownAwbIndex()),null);
  }
  {
    const {api}=mk([row({awb:'11824598207'})]);   // AWB = chiar numărul comenzii (cod nefolosibil) → nu e AWB real
    eq('AWB identic cu numărul comenzii nu se folosește la potrivire',api.awbMatchKnownInText('x 11824598207 y',api.awbKnownAwbIndex()),null);
  }
  {
    const {api}=mk([row({awb:'ABC123',awbExtra:['4EMGLN200171254001']})]);
    eq('AWB scurt (sub 10 caractere) ignorat — risc de potrivire întâmplătoare',api.awbMatchKnownInText('ABC123 ABC123',api.awbKnownAwbIndex()),null);
    eq('AWB suplimentar (awb_extra) se recunoaște',api.awbMatchKnownInText('colet 4EMGLN200171254001',api.awbKnownAwbIndex()).awb,'4EMGLN200171254001');
  }

  console.log('\n— Pas în fluxul de citire (cu căutare în bază) —');
  {
    const {api,log}=mk([],[{platforma:'trendyol',comanda_id:'11824598207',awb:'2876970014',awb_courier:'ACS / DPD GR'}]);
    const tasks=[{p:null,text:acs},{p:{awb:'7000183128284',comandaId:'11826896012'},text:'x'}];
    const n=await api.awbResolveByKnownAwb(tasks,t=>!t.p);
    eq('comandă veche, absentă din memorie: găsită prin căutare în bază după numerele de pe pagină',[n,tasks[0].p&&tasks[0].p.comandaId,tasks[0].p&&tasks[0].p._knownAwb],[1,'11824598207',true]);
    eq('pagina deja recunoscută nu se atinge',tasks[1].p.comandaId,'11826896012');
    eq('interogarea cere doar AWB-uri, fără comenzi anulate',/anulata=eq\.false&awb=in\./.test(log.q[0]||''),true);
  }
  {
    const {api}=mk([row()]);
    const bad=[{p:{awb:'2ΘΣ232960',courier:'ACS'},text:acs}];
    const n=await api.awbResolveByKnownAwb(bad,t=>!t.p||!api.awbLooksPlausible(t.p.awb,t.p.courier));
    eq('AI-ul a citit un cod greșit drept AWB → înlocuit cu potrivirea sigură',[n,bad[0].p.awb,bad[0].p.comandaId],[1,'2876970014','11824598207']);
  }
  {
    const {api,log}=mk([row()]);
    const n=await api.awbResolveByKnownAwb([{p:{awb:'7000183128284'},text:'x'}],t=>!t.p);
    eq('nimic de rezolvat → nicio interogare',[n,log.q.length],[0,0]);
  }

  console.log('\n— Integrare în index.html —');
  eq('ambele fluxuri de citire (PDF ales manual + dosar) cheamă pasul ÎNAINTE de AI',(src.match(/await awbResolveByKnownAwb\(awbTasks,t=>!t\.p\);/g)||[]).length,2);
  eq('…și DUPĂ AI, pentru un cod citit greșit drept AWB',(src.match(/awbResolveByKnownAwb\(awbTasks,t=>!t\.p\|\|!awbLooksPlausible\(t\.p\.awb,t\.p\.courier\)\)/g)||[]).length,2);
  eq('AWB suplimentar: comanda neîmpachetată e readusă în coada de azi (staff_trimis_at)',/pcomAddExtraAwbIfNeeded\(p\.comandaId,platforma,p\.awb\)\)\{[\s\S]{0,700}staff_trimis_at:nowIso/.test(src),true);
  eq('etichetă fără „N/M” nu mai scrie awb_lot:null peste numărul salvat (ambele PATCH-uri)',(src.match(/awb_lot:p\.lot\|\|null/g)||[]).length,0);
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE AWB CUNOSCUT AU TRECUT');
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
