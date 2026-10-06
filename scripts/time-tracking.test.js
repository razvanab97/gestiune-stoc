#!/usr/bin/env node
/* Test al nucleului de măsurare din pagină (time-tracking.js → createEngine / combineSeconds), fără browser.
   Rulează: node scripts/time-tracking.test.js
   Simulează: tab activ / ascuns / blur / inactivitate, schimbarea aplicației (2 proiecte, aceeași bază), schimbarea zilei,
   timer întârziat, rețea căzută, sesiune rămasă deschisă după un crash — cu aceleași reguli ca baza reală (upsert pe id,
   index unic „o singură sesiune deschisă per dispozitiv"). */
const {createEngine,combineSeconds}=require('../time-tracking.js');
let failed=0;
const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const near=(n,a,b,t)=>{const ok=Math.abs(a-b)<=t;if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+` → ${Math.round(a*10)/10} (așteptat ≈ ${b} ±${t})`);};
let uid=0;const uuid=()=>'id-'+(++uid);
const dayOf=ms=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Bucharest'}).format(new Date(ms));

function fakeDb(){
  const rows=new Map();let fail=0,maxOpenPerDevice=0,violations=0;
  const open=dev=>[...rows.values()].filter(r=>r.device===dev&&!r.ended_at).length;
  return{rows,failNext:n=>{fail=n;},get violations(){return violations;},get maxOpen(){return maxOpenPerDevice;},
    api:{
      async upsert(r){if(fail>0){fail--;throw new Error('rețea indisponibilă');}
        const ex=rows.get(r.id);if(!ex&&!r.ended_at&&open(r.device)>=1){violations++;const e=new Error('HTTP 409 time_sessions_one_open_per_device');e.status=409;throw e;}
        rows.set(r.id,{...(ex||{}),...r});maxOpenPerDevice=Math.max(maxOpenPerDevice,open(r.device));},
      async openOwn(){return[...rows.values()].filter(r=>false);}, // înlocuit per tab mai jos
      async closeStale(id,iso){rows.get(id).ended_at=iso;}
    },
    seconds:(project,day)=>[...rows.values()].filter(r=>r.project_id===project&&(!day||r.date===day)).reduce((s,r)=>s+r.duration_seconds,0)};
}
// un „tab" = un motor cu propriul dispozitiv; ceasul și starea (vizibil/focus/input) sunt controlate din test
function tab(db,project,device,clock){
  const t={visible:false,idle:false};
  const dbApi={upsert:db.api.upsert,closeStale:db.api.closeStale,openOwn:async()=>[...db.rows.values()].filter(r=>r.device===device&&!r.ended_at).map(r=>({id:r.id,last_seen_at:r.last_seen_at}))};
  const e=createEngine({project,device,source:'web',now:()=>clock.t,dayOf,isActive:()=>t.visible&&!t.idle,uuid,heartbeatMs:15000,db:dbApi});
  return Object.assign(t,{e,async run(sec,step=1){for(let i=0;i<sec/step;i++){clock.t+=step*1000;await e.tick();}}});
}

(async()=>{
  console.log('\n— Cronometrul se oprește când pleci de pe tab și continuă când revii —');
  {
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};const a=tab(db,'gestiune-stoc','web-A',clock);
    a.visible=true;await a.run(120);                                  // 2 minute pe tab
    near('pe tab 2 min → ≈ 2:00 acumulat',a.e.current().acc,120,2);
    a.visible=false;await a.e.leave();                                // plec pe alt tab (visibilitychange → hidden)
    eq('plec de pe tab → sesiunea se închide imediat',a.e.current(),null);
    near('timpul s-a salvat în bază la ieșire (≈ 2:00)',db.seconds('gestiune-stoc'),120,2);
    await a.run(300);                                                 // 5 minute cu tabul în fundal (fixat, deschis)
    near('5 minute în fundal NU se numără',db.seconds('gestiune-stoc'),120,2);
    a.visible=true;await a.run(60);await a.e.leave();                 // revin 1 minut
    near('revin → continuă de la ≈ 2:00, nu de la 0 (acum ≈ 3:00)',db.seconds('gestiune-stoc'),180,3);
    eq('2 sesiuni distincte în zi (intrarea 1 + revenirea)',db.rows.size,2);
    eq('niciodată 2 sesiuni deschise pe același dispozitiv',db.violations,0);
  }
  console.log('\n— Schimbare între aplicații (același calculator) —');
  {
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};
    const stoc=tab(db,'gestiune-stoc','web-stoc',clock),apart=tab(db,'apartpro','web-apart',clock);
    stoc.visible=true;await stoc.run(60);                             // lucrez în Stoc Manager
    stoc.visible=false;apart.visible=true;await stoc.e.leave();      // trec pe XapartPro (tab fixat)
    // în timpul ăsta cele două motoare ticăie în paralel, dar doar tabul vizibil numără
    for(let i=0;i<90;i++){clock.t+=1000;await stoc.e.tick();await apart.e.tick();}
    apart.visible=false;stoc.visible=true;await apart.e.leave();
    for(let i=0;i<30;i++){clock.t+=1000;await stoc.e.tick();await apart.e.tick();}
    await stoc.e.leave();
    near('Stoc Manager ≈ 60s + 30s',db.seconds('gestiune-stoc'),90,3);
    near('XapartPro ≈ 90s (doar cât a fost pe tab)',db.seconds('apartpro'),90,3);
    // verificare de simultaneitate: intervalele sesiunilor celor două proiecte nu se suprapun
    const iv=[...db.rows.values()].map(r=>[Date.parse(r.started_at),Date.parse(r.last_seen_at),r.project_id]).sort((x,y)=>x[0]-y[0]);
    let overlap=false;for(let i=1;i<iv.length;i++)if(iv[i][0]<iv[i-1][1]-1500&&iv[i][2]!==iv[i-1][2])overlap=true;
    eq('două proiecte nu acumulează timp simultan',overlap,false);
  }
  console.log('\n— Cazuri limită —');
  {
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};const a=tab(db,'gestiune-stoc','web-A',clock);
    a.visible=true;await a.run(30);a.idle=true;await a.run(30);       // fără input (idle) → pauză
    eq('inactivitate (idle) → se oprește',a.e.current(),null);
    near('timpul pe inactivitate nu se numără (≈ 30s)',db.seconds('gestiune-stoc'),30,3);
    a.idle=false;await a.run(10);
    eq('revine inputul → pornește o sesiune nouă',!!a.e.current(),true);
  }
  {
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};const a=tab(db,'gestiune-stoc','web-A',clock);
    a.visible=true;await a.run(30);clock.t+=3600*1000;await a.e.tick();await a.run(20);await a.e.leave();
    near('timer înghețat 1h (laptop închis / tab suspendat): ora lipsă NU se numără (≈ 50s)',db.seconds('gestiune-stoc'),50,5);
  }
  {
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T20:59:30Z')};    // 23:59:30 ora României
    const a=tab(db,'gestiune-stoc','web-A',clock);a.visible=true;await a.run(60);await a.e.leave();
    eq('schimbarea zilei: sesiunea se împarte pe 2 zile',[...new Set([...db.rows.values()].map(r=>r.date))].sort(),['2026-10-06','2026-10-07']);
    near('„Timp azi" de după miezul nopții pornește de la ~0 (≈ 30s)',db.seconds('gestiune-stoc','2026-10-07'),30,5);
    near('istoricul zilei precedente rămâne (≈ 30s)',db.seconds('gestiune-stoc','2026-10-06'),30,5);
  }
  {
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};const a=tab(db,'gestiune-stoc','web-A',clock);
    db.failNext(2);a.visible=true;await a.run(30);                    // rețea căzută ~30s (primele 2 încercări de salvare eșuează)
    near('rețea căzută: timpul se acumulează totuși local (≈ 30s)',a.e.current().acc,30,2);
    await a.run(60);await a.e.leave();
    near('după revenirea rețelei totul se salvează (≈ 90s)',db.seconds('gestiune-stoc'),90,5);
    eq('rețea căzută: fără duplicate / încălcări de index',db.violations,0);
  }
  {
    // tab crăpat cu o sesiune rămasă deschisă pe ACELAȘI dispozitiv → la repornire se închide la ultimul heartbeat, apoi se deschide una nouă
    const db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};
    db.rows.set('old',{id:'old',project_id:'gestiune-stoc',device:'web-A',source:'web',started_at:new Date(clock.t-600000).toISOString(),last_seen_at:new Date(clock.t-570000).toISOString(),ended_at:null,duration_seconds:30,date:'2026-10-06'});
    const a=tab(db,'gestiune-stoc','web-A',clock);a.visible=true;await a.run(20);await a.e.leave();
    eq('sesiune veche rămasă deschisă se închide la ultimul heartbeat',db.rows.get('old').ended_at,db.rows.get('old').last_seen_at);
    eq('nicio sesiune rămasă deschisă',[...db.rows.values()].filter(r=>!r.ended_at).length,0);
    near('timpul vechi (30s) se păstrează + noul (≈ 20s)',db.seconds('gestiune-stoc'),50,3);
    eq('fără încălcări ale indexului unic',db.violations,0);
  }
  console.log('\n— Afișajul „Timp azi" nu sare înapoi la pauză (combineSeconds) —');
  {
    const day='2026-10-06',db=fakeDb(),clock={t:Date.parse('2026-10-06T08:00:00Z')};const a=tab(db,'gestiune-stoc','web-A',clock);
    a.visible=true;await a.run(60);
    const dbRows=[...db.rows.values()];                               // starea citită din bază la ultimul refresh
    const before=combineSeconds(dbRows,a.e,clock.t,45,day).seconds;
    a.visible=false;await a.e.leave();                                // pun pauză — sesiunea nu mai e „me", dar nu e în dbRows vechi
    const after=combineSeconds(dbRows,a.e,clock.t,45,day).seconds;
    near('la pauză valoarea afișată rămâne (nu sare înapoi la 0)',after,before,1.5);
    a.visible=true;await a.run(10);
    near('la revenire continuă de la valoarea de dinainte (+10s)',combineSeconds(dbRows,a.e,clock.t,45,day).seconds,before+10,2);
  }
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE MĂSURĂRII DIN PAGINĂ AU TRECUT');
  process.exit(failed?1:0);
})();
