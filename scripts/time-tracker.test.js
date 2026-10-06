#!/usr/bin/env node
/* Test al nucleului trackerului (fără rețea, fără macOS): ceas + activitate + bază de date simulate.
   Rulează: node scripts/time-tracker.test.js
   Baza simulată reproduce regulile reale din migration_time_tracking.sql: upsert pe id și indexul unic
   „o singură sesiune deschisă per dispozitiv" (ended_at IS NULL). */
const {createTracker,DEFAULTS,projectOf}=require('./time-tracker');
let failed=0;
const eq=(name,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+name+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const near=(name,a,b,tol)=>{const ok=Math.abs(a-b)<=tol;if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+name+` → ${a} (așteptat ≈ ${b} ±${tol})`);};

function fakeDb(){
  const rows=new Map();let fail=0,maxOpen=0,violations=0;
  const openCount=dev=>[...rows.values()].filter(r=>r.device===dev&&!r.ended_at).length;
  return{rows,
    failNext:n=>{fail=n;},
    get maxOpen(){return maxOpen;},get violations(){return violations;},
    async upsert(s){
      if(fail>0){fail--;throw new Error('rețea indisponibilă');}
      const r={id:s.id,project_id:s.project,device:s.device,date:s.date,started_at:s.startedAt,last_seen_at:s.lastSeenAt,ended_at:s.endedAt||null,duration_seconds:Math.round(s.acc)};
      const ex=rows.get(s.id);
      if(!ex&&!r.ended_at&&openCount(r.device)>=1){violations++;throw new Error('409 duplicate key: time_sessions_one_open_per_device');}
      rows.set(s.id,r);maxOpen=Math.max(maxOpen,openCount(r.device));
    },
    async openSessions(dev){return[...rows.values()].filter(r=>r.device===dev&&!r.ended_at).map(r=>({id:r.id,last_seen_at:new Date(r.last_seen_at).toISOString(),duration_seconds:r.duration_seconds}));},
    async closeStale(id,endedAt){rows.get(id).ended_at=Date.parse(endedAt);},
    secondsOf(project,date){return[...rows.values()].filter(r=>r.project_id===project&&(!date||r.date===date)).reduce((s,r)=>s+r.duration_seconds,0);}
  };
}
// Simulator: proiectul „focusat" produce activitate la fiecare tick (ca o sesiune Claude/Codex care scrie).
function sim(opts={}){
  const cfg={...DEFAULTS,...opts.cfg};const db=opts.db||fakeDb();
  let t=Date.parse(opts.start||'2026-10-06T07:00:00Z');const act={};let idle=1,front='Claude';
  const tr=createTracker(cfg,{now:()=>t,idle:()=>idle,front:()=>front,activity:()=>act,db,log:opts.log||(()=>{})});
  return{db,tr,cfg,
    get t(){return t;},set idle(v){idle=v;},set front(v){front=v;},
    async work(project,seconds,step=5){for(let i=0;i<seconds/step;i++){t+=step*1000;act[project]={last:t,source:'claude-code'};await tr.tick();}},
    async pause(seconds,step=5){for(let i=0;i<seconds/step;i++){t+=step*1000;await tr.tick();}},
    jump(ms){t+=ms;}
  };
}

(async()=>{
  console.log('\n— Scenariul cerut (8 pași) —');
  {
    const s=sim();
    await s.work('gestiune-stoc',120);                                // 1-2) intru pe Stoc Manager, stau 2 minute
    eq('1) timerul pornește pe gestiune-stoc',s.tr.current().project,'gestiune-stoc');
    await s.work('ab-textile',60);                                    // 3-4) trec pe AB Textile, stau 1 minut
    eq('3) acum e activ AB Textile (Stoc Manager s-a oprit)',s.tr.current().project,'ab-textile');
    const gs1=s.db.secondsOf('gestiune-stoc');
    near('3) Stoc Manager salvat ≈ 2 min',gs1,120,10);
    await s.work('gestiune-stoc',30);                                 // 5) revin: continuă, nu se resetează
    // (baza se actualizează la fiecare 15s — o citire în mijlocul unei sesiuni rămâne în urmă cu cel mult un heartbeat)
    near('5) Stoc Manager continuă de la ≈ 2 min (acum ≈ 2:20-2:30, nu 0:30)',s.db.secondsOf('gestiune-stoc'),140,22);
    // 6) refresh/repornire: un tracker NOU (altă instanță) peste aceeași bază nu pierde nimic
    const keep=s.db.secondsOf('gestiune-stoc');
    const s2=sim({db:s.db,start:new Date(s.t+20000).toISOString()});
    await s2.tr.recover();
    eq('6) după repornire timpul salvat rămâne',s.db.secondsOf('gestiune-stoc'),keep);
    eq('6) nicio sesiune rămasă deschisă după recuperare',[...s.db.rows.values()].filter(r=>!r.ended_at).length,0);
    await s2.work('gestiune-stoc',60);                                // 8) revin din nou: se adună
    await s2.tr.stop();
    near('8) Stoc Manager continuă să se acumuleze (≈ 3:20 după încă 1 minut)',s.db.secondsOf('gestiune-stoc'),keep+55,14);
    near('7) AB Textile ≈ 1 min',s.db.secondsOf('ab-textile'),60,10);
    eq('NICIODATĂ două sesiuni deschise simultan (max observat)',s.db.maxOpen<=1,true);
    eq('indexul unic nu a fost încălcat niciodată',s.db.violations,0);
  }

  console.log('\n— Cazuri limită —');
  {
    const s=sim();await s.work('contaflow',60);
    s.idle=400;await s.pause(30);                                     // tastatură/mouse inactive > 5 min → nu se numără
    eq('inactivitate (idle ≥ idleLimit) → sesiunea se închide',s.tr.current(),null);
    const t1=s.db.secondsOf('contaflow');await s.pause(60);
    eq('în inactivitate nu se mai acumulează nimic',s.db.secondsOf('contaflow'),t1);
  }
  {
    const s=sim();await s.work('contaflow',60);
    const before=s.db.secondsOf('contaflow');
    s.jump(2*3600*1000);                                              // Mac-ul a stat 2 ore în sleep
    await s.work('contaflow',30);
    near('sleep 2h: orele de sleep NU se numără',s.db.secondsOf('contaflow'),before+30,12);
    eq('sleep: sesiunea veche închisă, una nouă deschisă',[...s.db.rows.values()].filter(r=>!r.ended_at).length,1);
  }
  {
    const s=sim();await s.work('contaflow',90);
    s.front='Finder';                                                 // nu mai lucrezi într-o aplicație de lucru
    await s.pause(200);                                               // fără activitate peste fereastra de 120s
    eq('fără activitate peste fereastră → sesiunea se închide',s.tr.current(),null);
    const d=s.db.secondsOf('contaflow');
    near('coada de inactivitate numărată e limitată (≤ fereastra de lucru)',d,90+s.cfg.activeWindow,15);
  }
  {
    const s=sim({start:'2026-10-06T20:59:30Z'});                      // 23:59:30 ora României (UTC+3)
    await s.work('gestiune-stoc',60);                                 // trece de miezul nopții
    const days=[...new Set([...s.db.rows.values()].map(r=>r.date))].sort();
    eq('schimbarea zilei: sesiunea se împarte pe 2 zile',days,['2026-10-06','2026-10-07']);
    near('„Timp azi" de după miezul nopții începe de la ~0 (≈ 30s)',s.db.secondsOf('gestiune-stoc','2026-10-07'),30,10);
    near('istoricul zilei precedente se păstrează (≈ 30s)',s.db.secondsOf('gestiune-stoc','2026-10-06'),30,10);
  }
  {
    const s=sim();s.db.failNext(6);                                   // rețea căzută ~30s
    await s.work('gestiune-stoc',60);await s.work('ab-textile',60);
    eq('rețea căzută: după revenire nu există duplicate / sesiuni deschise multiple',s.db.violations,0);
    eq('rețea căzută: max 1 sesiune deschisă',s.db.maxOpen<=1,true);
    near('rețea căzută: timpul pe proiecte se salvează totuși (Stoc ≈ 60s)',s.db.secondsOf('gestiune-stoc'),60,12);
  }
  {
    const s=sim();                                                    // două sesiuni paralele care scriu simultan
    for(let i=0;i<24;i++){s.jump(5000);await s.work('gestiune-stoc',0);}
    const sw=sim();let flips=0,last=null;
    for(let i=0;i<60;i++){ // 5 minute de activitate alternată
      await sw.work(i%2?'ab-textile':'gestiune-stoc',5);
      const c=sw.tr.current();if(c&&last&&c.project!==last)flips++;last=c&&c.project;
    }
    eq('două sesiuni paralele: schimbări limitate (≤ 1 la 30s ⇒ ≤ 10 în 5 min)',flips<=10,true);
    eq('două sesiuni paralele: tot max 1 sesiune deschisă',sw.db.maxOpen<=1,true);
  }
  {
    const s=sim();s.front='Finder';await s.pause(60);                 // fără activitate AI și fără aplicație de lucru
    eq('fără activitate pe niciun proiect → nu se numără',s.tr.current(),null);
    const s2=sim();await s2.work('gestiune-stoc',10);
    s2.front='Claude';await s2.pause(300);                            // tastezi o perioadă lungă după activitate (typingWindow)
    eq('input activ într-o aplicație de lucru după activitate → continuă',s2.tr.current()&&s2.tr.current().project,'gestiune-stoc');
  }
  console.log('\n— Potrivirea proiectelor pe cale —');
  const cfg=DEFAULTS;
  eq('Claude dir (Documents/GitHub)',projectOf(cfg,'-Users-razvanabunei-Documents-GitHub-gestiune-stoc'),'gestiune-stoc');
  eq('Claude dir (clona din home)',projectOf(cfg,'-Users-razvanabunei-gestiune-stoc'),'gestiune-stoc');
  eq('Codex cwd',projectOf(cfg,'/Users/razvanabunei/gestiune-stoc'),'gestiune-stoc');
  eq('Claude worktree',projectOf(cfg,'-Users-razvanabunei-Documents-GitHub-gestiune-stoc--claude-worktrees-abc'),'gestiune-stoc');
  eq('AB Textile = spalatorie-ab-textile',projectOf(cfg,'-Users-razvanabunei-Documents-GitHub-spalatorie-ab-textile'),'ab-textile');
  eq('contaflow',projectOf(cfg,'-Users-razvanabunei-Documents-GitHub-contaflow'),'contaflow');
  eq('folder fără legătură → niciun proiect',projectOf(cfg,'-Users-razvanabunei-Library-Application-Support-Claude-scratch'),null);
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE TRACKERULUI AU TRECUT');
  process.exit(failed?1:0);
})();
