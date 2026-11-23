#!/usr/bin/env node
/* Test al îmbunătățirilor de viteză din Comenzi Platforme (Update #763) — funcțiile REALE din index.html, dependențe simulate:
   (1) ciorna nu se mai scrie în localStorage / nu se mai trimite în cloud când nu s-a schimbat nimic;
   (2) căutarea se reface o singură dată după pauza de tastare;
   (3) cardurile închise nu mai construiesc corpul cu liniile (doar cele deschise).
   Rulează: node scripts/pcom-perf.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const tick=()=>new Promise(r=>setImmediate(r));

(async()=>{
/* ── 1) salvarea ciornei ── */
console.log('\n— Ciorna: se scrie doar când s-a schimbat —');
{
  const code=`let pcomSaveFailWarned=false,pcomDraftLocalSig='',pcomDraftCloudSig='',pcomCloudDraftTimer=null;
  ${['savePcomImportState','schedulePcomCloudDraftSave','savePcomImportStateToCloud','clearPcomCloudDraft'].map(grab).join('\n')}
  return{savePcomImportState,savePcomImportStateToCloud,clearPcomCloudDraft,state:()=>({l:pcomDraftLocalSig,c:pcomDraftCloudSig})}`;
  const mk=(okFlag)=>{
    const log={ls:0,posts:0,timers:[]};let lsVal=null;
    const env={
      pcImpParsed:[{id:1,include:false},{id:2,include:true,vintedImg:'data:BIG'}],pcImpPlatforma:'emag',PCIK:'k',PCOM_DRAFT_SETTINGS_KEY:'d',
      localStorage:{setItem(k,v){log.ls++;lsVal=v;},removeItem(){lsVal=null;}},toast(){},
      fetch:async()=>{log.posts++;return{ok:okFlag.v};},
      // cronometru simulat: păstrăm doar ultimul și îl rulăm la cerere (debounce de 2s)
      setTimeout:(f)=>{const t={f,dead:false};log.timers.push(t);return t;},clearTimeout:(t)=>{if(t)t.dead=true;}
    };
    const names=Object.keys(env);
    const api=new Function(...names,code)(...names.map(n=>env[n]));
    const fire=async()=>{const t=[...log.timers].reverse().find(x=>!x.dead&&!x.ran);if(t){t.ran=true;await t.f();}};
    return{api,env,log,fire,ls:()=>lsVal};
  };
  const okF={v:true};let w=mk(okF);
  w.api.savePcomImportState();await w.fire();
  eq('prima salvare: scrie local (1) și trimite în cloud (1)',[w.log.ls,w.log.posts],[1,1]);
  eq('captura Vinted (data-URL mare) nu intră în ciorna salvată',w.ls().includes('data:BIG'),false);
  w.api.savePcomImportState();w.api.savePcomImportState();await w.fire();
  eq('încă 2 randări fără nicio schimbare: nimic nou, nici local, nici cloud',[w.log.ls,w.log.posts],[1,1]);
  w.env.pcImpParsed[0].include=true;w.api.savePcomImportState();await w.fire();
  eq('o schimbare reală (linie inclusă): scrie local (2) și trimite în cloud (2)',[w.log.ls,w.log.posts],[2,2]);
  w.api.savePcomImportState();await w.fire();
  eq('după schimbare, din nou fără modificări: tot 2 și 2',[w.log.ls,w.log.posts],[2,2]);

  // serverul respinge → nu se consideră trimis, următoarea randare reîncearcă
  const badF={v:false};w=mk(badF);
  w.api.savePcomImportState();await w.fire();
  eq('cloud a răspuns cu eroare: se încearcă (1 POST)',w.log.posts,1);
  w.api.savePcomImportState();await w.fire();
  eq('…și la următoarea randare se reîncearcă (2 POST-uri), nu se consideră salvat',w.log.posts,2);
  badF.v=true;w.api.savePcomImportState();await w.fire();w.api.savePcomImportState();await w.fire();
  eq('după ce serverul răspunde OK: 3 POST-uri în total, apoi se oprește',w.log.posts,3);

  // „Resetează" șterge ciorna → aceeași ciornă, reintrodusă identic, trebuie scrisă din nou
  w=mk({v:true});w.api.savePcomImportState();await w.fire();
  await w.api.clearPcomCloudDraft();
  const l1=w.log.ls,p1=w.log.posts;   // clearPcomCloudDraft trimite ciorna goală (1 POST)
  w.api.savePcomImportState();await w.fire();
  eq('după „Resetează”, aceeași ciornă reintrodusă identic se scrie din nou (local + cloud)',[w.log.ls-l1,w.log.posts-p1],[1,1]);

  // linii goale: nu se trimite o ciornă goală ca valoare (rămâne '', ca înainte)
  w=mk({v:true});w.env.pcImpParsed.length=0;
  let sent=null;w.env.fetch=async(u,o)=>{sent=JSON.parse(o.body).value;return{ok:true};};
  const api2=new Function(...Object.keys(w.env),code)(...Object.values(w.env));
  api2.savePcomImportState();const t=w.log.timers.find(x=>!x.dead);if(t)await t.f();
  eq('previzualizare goală → valoarea din cloud rămâne gol (nu „parsed:[]”)',sent,'');
}

/* ── 2) căutarea cu pauză de tastare ── */
console.log('\n— Căutarea: o singură randare după pauză —');
{
  let renders=0;const timers=[];
  const code=`let pcxSearchTimer=null;${grab('pcxSearchDebounced')};return pcxSearchDebounced`;
  const fn=new Function('setTimeout','clearTimeout','pcxRenderOrders',code)(
    (f,ms)=>{const t={f,ms,dead:false};timers.push(t);return t;},t=>{if(t)t.dead=true;},()=>{renders++;});
  for(let i=0;i<6;i++)fn();   // 6 litere tastate repede
  const live=timers.filter(t=>!t.dead);
  eq('6 litere tastate repede: la final rămâne un singur cronometru activ',live.length,1);
  eq('pauza de așteptare e scurtă (sub o jumătate de secundă) ca să nu se simtă o întârziere',live[0].ms>=100&&live[0].ms<=400,true);
  live[0].f();
  eq('după pauză se face exact 1 randare (nu 6)',renders,1);
  eq('pcxRenderOrders oprește o căutare rămasă în așteptare (randarea directă o acoperă)',/function pcxRenderOrders\(\)\{\s*clearTimeout\(pcxSearchTimer\)/.test(src),true);
  eq('câmpul de căutare folosește varianta cu pauză',/id="pcx-search"[^>]*oninput="pcxSearchDebounced\(\)"/.test(src),true);
}

/* ── 3) corpul cardurilor: doar la cele deschise ── */
console.log('\n— Cardurile închise nu construiesc liniile —');
{
  let lineCalls=0,openFlag=false;
  const stubs={
    pcImpParsed:[{platforma:'emag',comandaId:'111',clientNume:'X',produsId:1,pretTotalCuTva:10,moneda:'RON',include:false},{platforma:'emag',comandaId:'111',produsId:2,pretTotalCuTva:5,moneda:'RON',include:false}],
    pcImpPlatforma:'emag',P:[{id:1,img:''},{id:2,img:''}],
    pcxGroupKey:()=>'emag|111',pcxGroupIsOpen:()=>openFlag,esc:s=>String(s),pcomToRon:v=>v,imgSrc:s=>s,pcxGroupAwb:()=>'',
    pcomRowById:()=>null,pcomPlatLabel:()=>'eMAG',pcxOrderStockReady:()=>false,pcxGroupAwbChipHtml:()=>'',pcxAwbBoxHtml:()=>'',
    pcxOrderWorked:()=>false,pcxFmtShortDate:()=>'',deadlineBadgeHtml:()=>'',pcxDeckStatusRowHtml:()=>'',
    pcxLineHtml:(i)=>{lineCalls++;return`<div class="pcx-line">L${i}</div>`;}
  };
  const names=Object.keys(stubs);
  const card=new Function(...names,grab('pcxOrderCardHtml')+';return pcxOrderCardHtml')(...names.map(n=>stubs[n]));
  let h=card([0,1],0);
  eq('card ÎNCHIS (2 produse): nicio linie construită',lineCalls,0);
  eq('card închis: corpul există, dar e gol și ascuns',[/<div class="pcx-order-body" style="display:none">\s*<\/div>/.test(h),h.includes('pcx-line')],[true,false]);
  eq('card închis: antetul rămâne complet (platformă, comandă, nr. produse, status)',[h.includes('#111'),h.includes('2 produse'),h.includes('Neinclus')],[true,true,true]);
  openFlag=true;h=card([0,1],0);
  eq('card DESCHIS: ambele linii construite',[lineCalls,(h.match(/class="pcx-line"/g)||[]).length],[2,2]);
  eq('card deschis: corpul nu mai e ascuns',h.includes('pcx-order-body" style=""'),true);
  lineCalls=0;openFlag=true;card([0],0);
  eq('card deschis cu un singur produs: o linie',lineCalls,1);
}

/* ── 4) navigare rapidă + „Pașii zilei" restrâns (Update #765) ── */
console.log('\n— Navigare rapidă și lista de pași —');
{
  const store={};
  const el={style:{display:'none'}},btn={cls:new Set(),attrs:{},classList:{toggle(c,on){on?btn.cls.add(c):btn.cls.delete(c);}},setAttribute(k,v){btn.attrs[k]=v;}};
  const env={document:{getElementById:id=>id==='pcx-checklist'?el:id==='pcx-checklist-btn'?btn:null},
    localStorage:{getItem:k=>(k in store?store[k]:null),setItem:(k,v)=>{store[k]=v;}},PCX_CHECKLIST_KEY:'k'};
  const names=Object.keys(env);
  const api=new Function(...names,`${grab('pcxChecklistApply')}\n${grab('pcxChecklistToggle')}\nreturn{pcxChecklistApply,pcxChecklistToggle}`)(...names.map(n=>env[n]));
  api.pcxChecklistApply();
  eq('prima deschidere (nimic memorat): pașii sunt restrânși',[el.style.display,btn.attrs['aria-expanded'],btn.cls.has('on')],['none','false',false]);
  api.pcxChecklistToggle();
  eq('click pe „Pașii zilei": se deschid, butonul devine activ, starea se memorează',[el.style.display,btn.attrs['aria-expanded'],btn.cls.has('on'),store.k],['','true',true,'1']);
  el.style.display='none';api.pcxChecklistApply();
  eq('la următoarea încărcare (starea memorată = deschis) pașii rămân deschiși',[el.style.display,store.k],['','1']);
  api.pcxChecklistToggle();
  eq('al doilea click: se restrâng din nou și se memorează',[el.style.display,store.k,btn.attrs['aria-expanded']],['none','0','false']);
  const bad=new Function('document','localStorage','PCX_CHECKLIST_KEY',`${grab('pcxChecklistApply')}\n${grab('pcxChecklistToggle')}\nreturn{pcxChecklistApply,pcxChecklistToggle}`)(env.document,{getItem(){throw new Error('blocat');},setItem(){throw new Error('blocat');}},'k');
  let threw=false;try{bad.pcxChecklistApply();bad.pcxChecklistToggle();}catch(e){threw=true;}
  eq('fără localStorage (mod privat/blocat): nu aruncă, doar nu memorează',threw,false);
  eq('ancorele există în pagină (comenzi, unelte, pași) și butoanele chemă funcțiile reale',
    ['id="pcx-preview-card"','id="pcx-tools-anchor"','id="pcx-checklist"',"onclick=\"pcxJump('pcx-preview-card')\"","onclick=\"pcxJump('pcx-tools-anchor')\"",'onclick="pcxChecklistToggle()"'].every(x=>src.includes(x)),true);
  eq('lista de pași se aplică după construirea paginii',/pcxRelocateSharedNodes\(\);\s*pcxChecklistApply\(\);/.test(src),true);
}

/* ── 5) aranjarea cardului „Previzualizare comenzi" (Update #768) ── */
console.log('\n— Aranjarea cardului Previzualizare comenzi —');
{
  const a=src.indexOf('id="pcx-preview-card"'),b=src.indexOf('id="pcx-orders-list"',a);
  const card=src.slice(a,b);
  const pos=k=>card.indexOf(k);
  eq('ordinea de sus în jos: antet+unelte → restanțe → filtre → deck → lista completă',
    [pos('class="pcx-preview-hd"'),pos('id="pcx-stock-shortage"'),pos('class="pcx-filters pcx-filterbar"'),pos('id="pcx-deck"'),pos('class="pcx-deck-sep"')].every((v,i,arr)=>v>=0&&(i===0||v>arr[i-1])),true);
  eq('unelte în antet (Cu stoc sus, Lista de comandat), nu pe un rând separat sub el',/class="pcx-pv-tools">[\s\S]{0,900}id="pcx-stock-sort-btn"[\s\S]{0,900}openPcomOrderStockSummary\(\)/.test(card),true);
  eq('platforma + căutarea sunt în ACEEAȘI bară de filtre',/class="pcx-filters pcx-filterbar">[\s\S]{0,1600}id="pcx-fplat"[\s\S]{0,1600}id="pcx-search"[\s\S]{0,300}id="pcx-filter-platform"/.test(card),true);
  eq('filtrul de status (se aplică doar listei) stă în antetul „Lista completă", nu deasupra deck-ului',/class="pcx-deck-sep">[\s\S]{0,200}id="pcx-filter-status"/.test(card)&&pos('id="pcx-filter-status"')>pos('id="pcx-deck"'),true);
  eq('cele 4 valori ale filtrului de status există',['all','unmatched','pending','included'].every(v=>card.includes('<option value="'+v+'">')),true);
  eq('antetul „Lista completă" păstrează clasa pcx-deck-sep (pcxRenderDeck îl ascunde cu deck-ul)',/sepEl\.classList\.contains\('pcx-deck-sep'\)/.test(src),true);
  // rezumatul înlocuiește contoarele care repetau platformele (cu alte numere) și „Debifează toate" (există în bara de jos)
  const sum=src.slice(src.indexOf('if(counters)counters.innerHTML='),src.indexOf('if(counters)counters.innerHTML=')+900);
  eq('rezumat: comenzi · linii · incluse, plus avertismentele fără produs / arhivate',/pcomGroups\.length[\s\S]{0,80}comenzi[\s\S]{0,160}linii[\s\S]{0,160}incluse/.test(sum)&&/fără produs/.test(sum)&&/produs arhivat/.test(sum),true);
  eq('contoarele „Total/eMAG/Trendyol" și butonul „Debifează toate" din antet au dispărut',!/pcx-counter">Total/.test(sum)&&!/pcx-deselect-chip/.test(sum),true);
  eq('butonul „Cu stoc sus" are stare proprie („on"), nu stilul de buton mare .btn-acc',/ssBtn\.classList\.toggle\('on',pcxStockSort\)/.test(src),true);
  eq('etapele: săgeți între cele din flux; „Amânate / De verificat" într-un grup separat (trec împreună pe rândul următor)',/pcx-deck-pipe">'\+PCX_DECK_PIPE\.map\(tabBtn\)\.join\('<span class="pcx-deck-chev"/.test(src)&&/class="pcx-deck-extra">/.test(src),true);
  // antetul cardului de comandă: rând flexibil (era grilă cu 10 coloane pentru 11 elemente)
  eq('antetul cardului de comandă e flex cu wrap (nu grilă cu coloane fixe)',/#page-pcom \.pcx-order-hd\{display:flex;flex-wrap:wrap;/.test(src),true);
  eq('cumpărătorul ia restul rândului și poate fi tăiat cu „…", fără să ajungă la 0 px',/#page-pcom \.pcx-order-hd>\.pcx-order-buyer\{flex:1 1 150px;min-width:0\}/.test(src),true);
  eq('insigna de termen și rândul „AWB asociat" au font propriu (moșteneau ≈31px din pagină)',/\.pcx-order-deadline\{[^}]*font-size:15px/.test(src)&&/\.pcx-order-awb-row\{font-size:16px\}/.test(src),true);
  eq('pe ecran îngust: cardul din deck ia tot rândul, săgețile trec dedesubt, grila poate să se îngusteze (min-width:0)',/\.pcx-deck-main\{min-width:0\}/.test(src)&&/grid-template-areas:"main main" "prev next"/.test(src),true);
}

console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE DE VITEZĂ (COMENZI PLATFORME) AU TRECUT');
process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
