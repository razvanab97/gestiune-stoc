#!/usr/bin/env node
/* Test al cronometrului manual „Pregătire comenzi" (blocul PREP-TIMER din index.html), fără browser:
   ceas și bază de date simulate. Rulează: node scripts/prep-timer.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const a=src.indexOf('/* PREP-TIMER:START'),b=src.indexOf('/* PREP-TIMER:END */');
if(a<0||b<0)throw new Error('blocul PREP-TIMER lipsește din index.html');
const block=src.slice(a,b);
let failed=0;const eq=(n,x,y)=>{const ok=JSON.stringify(x)===JSON.stringify(y);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(x)}\n       așteptat: ${JSON.stringify(y)}`));};

function make(){
  const clock={t:Date.parse('2026-10-07T07:00:00Z')};const log=[];const db={runs:[],failPatch:false,conflict:false};
  const RealDate=Date;
  class FakeDate extends RealDate{constructor(...x){x.length?super(...x):super(clock.t)}static now(){return clock.t}}
  const env={
    Date:FakeDate,Intl,Math,Promise,JSON,Number,String,Object,Array,
    window:{},document:{readyState:'loading',addEventListener(){}},setInterval(){},
    dbGet:async p=>{log.push(['GET',p]);return db.runs.map(r=>({...r}));},
    dbPost:async(t,row)=>{log.push(['POST',t,row]);if(db.conflict){const e=new Error('{"code":"23505","message":"duplicate key ... time_sessions_one_open_per_device"}');throw e;}db.runs.unshift({...row});return[row];},
    dbPatch:async(p,body)=>{log.push(['PATCH',p,body]);if(db.failPatch)throw new Error('rețea');const id=p.match(/id=eq\.(.+)$/)[1];Object.assign(db.runs.find(r=>r.id===id),body);return[{}];},
    dbDelete:async p=>{log.push(['DELETE',p]);const id=p.match(/id=eq\.(.+)$/)[1];db.runs=db.runs.filter(r=>r.id!==id);return[];},
    toast:(m,t)=>log.push(['toast',t||'ok',m]),confirm:()=>{log.push(['confirm']);return env.__confirm!==false;},
    crypto:{randomUUID:()=>'id-'+(++env.__n)},__n:0
  };
  const keys=Object.keys(env);
  const fn=new Function(...keys,block+';return PrepTimer;');
  return{pt:fn(...keys.map(k=>env[k])),clock,log,db,env};
}
(async()=>{
  console.log('\n— Start / Gata —');
  {const w=make();
   await w.pt.start();
   const post=w.log.find(l=>l[0]==='POST');
   eq('Start scrie o rundă deschisă în time_sessions (project/device/source)',[post[1],post[2].project_id,post[2].device,post[2].source,post[2].ended_at],['time_sessions','gestiune-stoc','prep','prep',null]);
   eq('ziua rundei = ziua de lucru (Europe/Bucharest)',post[2].date,'2026-10-07');
   eq('rundă deschisă în stare',!!w.pt.summarize(w.pt.state().runs,w.clock.t).open,true);
   const n=w.log.filter(l=>l[0]==='POST').length;await w.pt.start();
   eq('al doilea Start cât rulează NU creează altă rundă',w.log.filter(l=>l[0]==='POST').length,n);
   w.clock.t+=42*60*1000+10*1000;                                   // 42 min 10 s mai târziu, lucrând în paralel
   await w.pt.done();
   const patch=w.log.find(l=>l[0]==='PATCH');
   eq('Gata salvează durata de ceas de perete (42 min 10 s = 2530 s)',patch[2].duration_seconds,2530);
   eq('Gata închide runda (ended_at setat)',!!patch[2].ended_at,true);
   const s=w.pt.summarize(w.pt.state().runs,w.clock.t);
   eq('totalul de azi = 2530 s, 1 rundă',[s.today.total,s.today.count],[2530,1]);
   eq('după Gata nu mai e nicio rundă deschisă',s.open,null);
   eq('mesajul de succes arată timpul',w.log.filter(l=>l[0]==='toast').pop()[2].includes('42 min'),true);}
  console.log('\n— Mai multe runde / istoric —');
  {const w=make();
   w.pt.state().runs.push(
     {id:'a',date:'2026-10-07',started_at:'2026-10-07T05:00:00Z',ended_at:'2026-10-07T05:30:00Z',duration_seconds:1800},
     {id:'b',date:'2026-10-07',started_at:'2026-10-07T09:00:00Z',ended_at:'2026-10-07T09:15:00Z',duration_seconds:900},
     {id:'c',date:'2026-10-06',started_at:'2026-10-06T05:00:00Z',ended_at:'2026-10-06T06:00:00Z',duration_seconds:3600},
     {id:'d',date:'2026-10-05',started_at:'2026-10-05T05:00:00Z',ended_at:'2026-10-05T05:20:00Z',duration_seconds:1200});
   const s=w.pt.summarize(w.pt.state().runs,w.clock.t);
   eq('azi: 2 runde însumate = 2700 s',[s.today.total,s.today.count],[2700,2]);
   eq('zile ordonate descrescător',s.days.map(d=>d.date),['2026-10-07','2026-10-06','2026-10-05']);
   eq('medie pe ZILE = (2700+3600+1200)/3 = 2500 s',s.avg,2500);
   eq('cea mai rapidă / cea mai lungă zi',[s.min,s.max],[1200,3600]);}
  console.log('\n— Anulare / erori —');
  {const w=make();await w.pt.start();w.env.__confirm=false;
   await w.pt.cancel();
   eq('anulare refuzată la confirmare: nu se șterge nimic',w.log.some(l=>l[0]==='DELETE'),false);
   eq('...runda rămâne deschisă',!!w.pt.summarize(w.pt.state().runs,w.clock.t).open,true);}
  {const w=make();await w.pt.start();
   await w.pt.cancel();
   eq('anulare confirmată: rândul se șterge din bază',w.log.some(l=>l[0]==='DELETE'),true);
   eq('...și dispare din stare (nu se salvează timp)',w.pt.state().runs.length,0);}
  {const w=make();await w.pt.start();w.db.failPatch=true;w.clock.t+=600000;await w.pt.done();
   eq('salvarea eșuează la Gata: runda RĂMÂNE deschisă (nu se pierde timpul)',!!w.pt.summarize(w.pt.state().runs,w.clock.t).open,true);
   eq('...cu mesaj de eroare',w.log.filter(l=>l[0]==='toast').pop()[1],'err');
   w.db.failPatch=false;await w.pt.done();
   eq('reîncercare reușită: se salvează 600 s',w.db.runs[0].duration_seconds,600);}
  {const w=make();w.db.runs.push({id:'x',date:'2026-10-07',started_at:'2026-10-07T05:00:00Z',ended_at:null,duration_seconds:0});
   w.db.conflict=true;await w.pt.start();
   eq('rundă deja deschisă (alt dispozitiv): indexul unic respinge, se reîncarcă și se afișează aceea',w.pt.summarize(w.pt.state().runs,w.clock.t).open&&w.pt.summarize(w.pt.state().runs,w.clock.t).open.id,'x');}
  console.log('\n— Formatare —');
  const f=make().pt;
  eq('hm(2530) = 42 min',f.hm(2530),'42 min');eq('hm(3900) = 1h 05m',f.hm(3900),'1h 05m');eq('hm(45) = 45 s',f.hm(45),'45 s');
  eq('clock(3725) = 01:02:05',f.clock(3725),'01:02:05');
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE CRONOMETRULUI DE COMENZI AU TRECUT');
  process.exit(failed?1:0);
})().catch(e=>{console.error('EROARE TEST',e);process.exit(1)});
