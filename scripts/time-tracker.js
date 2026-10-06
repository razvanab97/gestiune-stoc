#!/usr/bin/env node
/* Tracker local de timp pe proiect — rulează pe Mac, detectează LA CE PROIECT LUCREZI EFECTIV și salvează
   sesiunile în Supabase (time_sessions). Fiecare aplicație își afișează apoi propriul „Timp azi" din aceleași
   tabele (vezi time-tracking.js), iar statisticile se calculează din aceleași sesiuni.

   Cum decide proiectul activ (FĂRĂ permisiuni speciale macOS, fără să citească conținutul conversațiilor):
   • activitatea unui proiect = ultima scriere în sesiunile Claude Code (~/.claude/projects/<cwd>/*.jsonl —
     inclusiv desktop și extensia din IDE) și Codex (~/.codex/sessions/AAAA/LL/ZZ/rollout-…jsonl) — doar mtime;
   • lucrezi efectiv dacă: ai activitate recentă pe proiect (fereastra „activeWindow") SAU tastezi/folosești mouse-ul
     într-o aplicație de lucru la scurt timp după o activitate (fereastra „typingWindow");
   • dacă tastatura/mouse-ul sunt inactive peste „idleLimit", nu se numără nimic;
   • EXACT un proiect activ la un moment dat: proiectul cu cea mai recentă activitate (schimbarea e imediată, dar nu mai des
     de „minSession" secunde, ca două sesiuni paralele să nu producă sesiuni minuscule); în plus, baza de date refuză două
     sesiuni deschise pe același dispozitiv.
   Comenzi: run [--dry] | status | projects | install | uninstall */
const fs=require('fs'),os=require('os'),path=require('path'),{execFileSync}=require('child_process');

const HOME=os.homedir(),STATE_DIR=path.join(HOME,'.ab-homes','time-tracker');
const DEFAULTS={
  supabaseUrl:'https://cbpavtvrfpkbaeueexlw.supabase.co',
  supabaseKey:'sb_publishable_m7_oRHyxmrrvuGpudY9V1g_LM85ubbr', // aceeași cheie publică ca în aplicații (RLS dezactivat, single-user)
  device:'mac',
  timezone:'Europe/Bucharest',
  tickSeconds:5,            // cât de des verificăm
  heartbeatSeconds:15,      // cât de des salvăm progresul sesiunii deschise
  activeWindow:120,         // secunde de „lucru" după ultima activitate pe proiect
  typingWindow:900,         // cât timp după ultima activitate mai numărăm, dacă tastezi/folosești mouse-ul
  typingIdle:20,            // „tastezi" = inactivitate input sub atâtea secunde
  idleLimit:300,            // inactivitate input peste care nu se mai numără nimic
  minSession:30,            // nu schimbăm proiectul mai des de atâtea secunde (două sesiuni paralele nu fac sesiuni minuscule)
  workApps:['Claude','Terminal','iTerm2','Electron','Code','Cursor','Antigravity','Google Chrome','Safari','Arc','Codex','ChatGPT'],
  projects:[ // match = nume de folder repo (potrivit pe calea sesiunii: ~/.claude/projects/<cwd> sau cwd-ul din Codex)
    {id:'gestiune-stoc',name:'Stoc Manager',match:['gestiune-stoc']},
    {id:'ab-textile',name:'AB Textile',match:['spalatorie-ab-textile']},
    {id:'contaflow',name:'ContaFlow',match:['contaflow']},
    {id:'apartpro',name:'ApartPro',match:['apartpro']},
    {id:'agentie-imobiliara-ai',name:'Agenție imobiliară AI',match:['agentie-imobiliara-ai']}
  ]
};
function loadConfig(){
  let cfg={...DEFAULTS};
  try{cfg={...cfg,...JSON.parse(fs.readFileSync(path.join(STATE_DIR,'config.json'),'utf8'))};}catch(e){}
  return cfg;
}

/* ───────── ceas / zi (Europe/Bucharest) ───────── */
function dayOf(ms,tz){return new Intl.DateTimeFormat('en-CA',{timeZone:tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
const norm=s=>String(s||'').replace(/[^a-zA-Z0-9]+/g,'-').toLowerCase();
function projectOf(cfg,pathLike){
  const n=norm(pathLike);
  for(const p of cfg.projects)for(const m of p.match||[]){const k=norm(m);if(n.endsWith('-'+k)||n.endsWith(k)&&n.length===k.length||n.includes('-'+k+'-'))return p.id;}
  return null;
}

/* ───────── detectarea activității (doar mtime) ───────── */
function claudeActivity(cfg,out){
  const root=path.join(HOME,'.claude','projects');let dirs=[];
  try{dirs=fs.readdirSync(root);}catch(e){return;}
  for(const d of dirs){
    const id=projectOf(cfg,d);if(!id)continue;
    let files=[];try{files=fs.readdirSync(path.join(root,d));}catch(e){continue;}
    for(const f of files){if(!f.endsWith('.jsonl'))continue;
      try{const m=fs.statSync(path.join(root,d,f)).mtimeMs;if(!out[id]||m>out[id].last)out[id]={last:m,source:'claude-code'};}catch(e){}}
  }
}
const codexCwd={};
function codexActivity(cfg,out,now){
  const root=path.join(HOME,'.codex','sessions');if(!fs.existsSync(root))return;
  for(const off of [0,1]){
    const d=new Date(now-off*86400000),dir=path.join(root,String(d.getUTCFullYear()),String(d.getUTCMonth()+1).padStart(2,'0'),String(d.getUTCDate()).padStart(2,'0'));
    let files=[];try{files=fs.readdirSync(dir);}catch(e){continue;}
    for(const f of files){if(!/^rollout-.*\.jsonl$/.test(f))continue;
      const fp=path.join(dir,f);
      try{
        const m=fs.statSync(fp).mtimeMs;if(now-m>cfg.typingWindow*1000)continue;
        if(!(fp in codexCwd)){const fd=fs.openSync(fp,'r'),b=Buffer.alloc(8192),n=fs.readSync(fd,b,0,8192,0);fs.closeSync(fd);
          const mm=b.toString('utf8',0,n).match(/"cwd":"([^"]+)"/);codexCwd[fp]=mm?mm[1]:'';}
        const id=projectOf(cfg,codexCwd[fp]);if(id&&(!out[id]||m>out[id].last))out[id]={last:m,source:'codex'};
      }catch(e){}
    }
  }
}
function readActivity(cfg,now){const out={};claudeActivity(cfg,out);codexActivity(cfg,out,now);return out;}
function idleSeconds(){
  try{const o=execFileSync('/usr/sbin/ioreg',['-c','IOHIDSystem'],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    const m=o.match(/"HIDIdleTime"\s*=\s*(\d+)/);return m?Number(m[1])/1e9:0;}catch(e){return 0;}
}
function frontApp(){
  try{const f=execFileSync('/usr/bin/lsappinfo',['front'],{encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    const o=execFileSync('/usr/bin/lsappinfo',['info','-only','name',f],{encoding:'utf8',stdio:['ignore','pipe','ignore']});
    const m=o.match(/"LSDisplayName"="([^"]*)"/)||o.match(/"([^"]+)"\s*:?\s*ASN/);return m?m[1]:'';}catch(e){return '';}
}

/* ───────── decizia: la ce proiect lucrezi acum ───────── */
function decide(cfg,t,idle,front,act,current){
  if(idle>=cfg.idleLimit)return null;
  const typing=idle<=cfg.typingIdle&&cfg.workApps.some(a=>front.toLowerCase().includes(a.toLowerCase()));
  const ok=id=>{const a=act[id];if(!a)return false;const age=(t-a.last)/1000;return age<=cfg.activeWindow||(typing&&age<=cfg.typingWindow);};
  const cands=Object.keys(act).filter(ok).sort((a,b)=>act[b].last-act[a].last);
  if(!cands.length)return null;
  const best=cands[0];
  if(current&&cands.includes(current.project)){
    if(best===current.project)return best;
    // alt proiect are activitate mai nouă: schimbăm imediat, dar nu înainte ca sesiunea curentă să dureze minSession
    if(t-current.startedAt<cfg.minSession*1000)return current.project;
  }
  return best;
}

/* ───────── clientul Supabase (PostgREST) ───────── */
function makeDb(cfg){
  const base=cfg.supabaseUrl+'/rest/v1',h={apikey:cfg.supabaseKey,Authorization:'Bearer '+cfg.supabaseKey,'Content-Type':'application/json'};
  async function req(method,p,body,extra){
    const r=await fetch(base+'/'+p,{method,headers:{...h,...(extra||{})},body:body===undefined?undefined:JSON.stringify(body),signal:AbortSignal.timeout(15000)});
    const text=await r.text();
    if(!r.ok)throw new Error(`Supabase ${r.status}: ${text.slice(0,200)}`);
    return text?JSON.parse(text):null;
  }
  const row=s=>({id:s.id,project_id:s.project,device:s.device,started_at:new Date(s.startedAt).toISOString(),last_seen_at:new Date(s.lastSeenAt).toISOString(),
    ended_at:s.endedAt?new Date(s.endedAt).toISOString():null,duration_seconds:Math.round(s.acc),date:s.date,source:s.source});
  return{
    // upsert idempotent: reîncercarea după o eroare de rețea nu creează duplicate
    upsert:s=>req('POST','time_sessions?on_conflict=id',row(s),{Prefer:'resolution=merge-duplicates,return=minimal'}),
    openSessions:device=>req('GET',`time_sessions?device=eq.${encodeURIComponent(device)}&ended_at=is.null&select=id,last_seen_at,duration_seconds`),
    closeStale:(id,endedAt)=>req('PATCH',`time_sessions?id=eq.${id}`,{ended_at:endedAt},{Prefer:'return=minimal'}),
    today:(day)=>req('GET',`time_daily?date=eq.${day}&select=project_id,seconds`)
  };
}

/* ───────── nucleul trackerului (testabil: ceas, activitate și DB injectate) ───────── */
function uuid(){return require('crypto').randomUUID();}
function createTracker(cfg,deps){
  const log=deps.log||(()=>{});
  let cur=null,lastTick=null,lastHb=0;const closing=[];
  const tickMs=cfg.tickSeconds*1000;
  async function flush(t){
    // 1) închiderile întâi (indexul unic permite o singură sesiune deschisă/dispozitiv), 2) deschiderea, 3) heartbeat
    while(closing.length){try{await deps.db.upsert(closing[0]);closing.shift();}catch(e){log('db: închidere amânată — '+e.message);return;}}
    if(cur){
      if(!cur.persisted){try{await deps.db.upsert(cur);cur.persisted=true;lastHb=t;log(`▶ ${cur.project}`);}catch(e){log('db: deschidere amânată — '+e.message);}}
      else if(t-lastHb>=cfg.heartbeatSeconds*1000){try{await deps.db.upsert(cur);lastHb=t;}catch(e){log('db: heartbeat amânat — '+e.message);}}
    }
  }
  function close(reason){
    if(!cur)return;
    cur.endedAt=cur.lastSeenAt;closing.push(cur);
    log(`■ ${cur.project} — ${Math.round(cur.acc)}s (${reason})`);cur=null;
  }
  async function tick(){
    const t=deps.now(),dt=lastTick==null?0:t-lastTick;lastTick=t;
    const gap=dt>tickMs*3; // sleep / proces suspendat: nu numărăm intervalul ratat
    const act=deps.activity(t),want=decide(cfg,t,deps.idle(),deps.front(),act,cur);
    const day=dayOf(t,cfg.timezone);
    if(cur&&(gap||want!==cur.project||cur.date!==day))close(gap?'pauză sistem':!want?'inactiv':want!==cur.project?'schimbare proiect':'schimbarea zilei');
    if(!cur&&want){cur={id:uuid(),project:want,device:cfg.device,startedAt:t,lastSeenAt:t,endedAt:null,acc:0,date:day,source:(act[want]||{}).source||'',persisted:false};}
    else if(cur){cur.acc+=Math.min(dt,tickMs*2)/1000;cur.lastSeenAt=t;}
    await flush(t);
    return cur;
  }
  // La pornire: sesiunile rămase deschise (crash/oprire bruscă) se închid la ultimul heartbeat cunoscut.
  async function recover(){
    const open=await deps.db.openSessions(cfg.device);
    for(const s of open){await deps.db.closeStale(s.id,s.last_seen_at);log(`↺ sesiune veche închisă (${s.id.slice(0,8)})`);}
  }
  async function stop(){close('oprire');await flush(deps.now());}
  return{tick,recover,stop,current:()=>cur,pending:()=>closing.length};
}

/* ───────── CLI ───────── */
function lock(){
  fs.mkdirSync(STATE_DIR,{recursive:true});const f=path.join(STATE_DIR,'tracker.pid');
  try{const pid=Number(fs.readFileSync(f,'utf8'));if(pid&&pid!==process.pid){process.kill(pid,0);console.error('Trackerul rulează deja (pid '+pid+').');process.exit(1);}}catch(e){}
  fs.writeFileSync(f,String(process.pid));process.on('exit',()=>{try{fs.unlinkSync(f)}catch(e){}});
}
async function run(dry){
  const cfg=loadConfig();if(!dry)lock();
  const ts=()=>new Date().toLocaleTimeString('ro-RO');
  const log=m=>console.log(`[${ts()}] ${m}`);
  const db=dry?{upsert:async()=>{},openSessions:async()=>[],closeStale:async()=>{}}:makeDb(cfg);
  const tr=createTracker(cfg,{now:()=>Date.now(),idle:idleSeconds,front:frontApp,activity:t=>readActivity(cfg,t),db,log});
  if(!dry){try{await tr.recover();}catch(e){log('Atenție: nu am putut verifica sesiunile vechi — '+e.message+' (rulează migration_time_tracking.sql?)');}}
  log(dry?'Mod DRY — nu scriu nimic în baza de date.':'Tracker pornit.');
  let busy=false;
  const timer=setInterval(async()=>{if(busy)return;busy=true;try{const c=await tr.tick();if(dry&&c)process.stdout.write(`\r  activ: ${c.project} · ${Math.round(c.acc)}s   `);}catch(e){log('eroare: '+e.message);}busy=false;},cfg.tickSeconds*1000);
  const bye=async()=>{clearInterval(timer);try{await tr.stop();}catch(e){}process.exit(0);};
  process.on('SIGINT',bye);process.on('SIGTERM',bye);
}
async function status(){
  const cfg=loadConfig(),rows=await makeDb(cfg).today(dayOf(Date.now(),cfg.timezone));
  const fmt=s=>`${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  console.log('Timp azi pe proiect:');rows.forEach(r=>console.log('  '+r.project_id.padEnd(26)+fmt(r.seconds)));
  if(!rows.length)console.log('  (nimic înregistrat încă)');
}
const PLIST=path.join(HOME,'Library','LaunchAgents','ro.abhomes.time-tracker.plist');
function plist(){return`<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>Label</key><string>ro.abhomes.time-tracker</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${__filename}</string><string>run</string></array><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>StandardOutPath</key><string>${STATE_DIR}/tracker.log</string><key>StandardErrorPath</key><string>${STATE_DIR}/tracker.err</string></dict></plist>`;}
function install(){
  fs.mkdirSync(STATE_DIR,{recursive:true});fs.mkdirSync(path.dirname(PLIST),{recursive:true});fs.writeFileSync(PLIST,plist(),{mode:0o600});
  try{execFileSync('launchctl',['bootout',`gui/${process.getuid()}`,PLIST],{stdio:'ignore'});}catch(e){}
  execFileSync('launchctl',['bootstrap',`gui/${process.getuid()}`,PLIST]);console.log('Tracker instalat și pornit automat la logare. Log: '+STATE_DIR+'/tracker.log');
}
function uninstall(){try{execFileSync('launchctl',['bootout',`gui/${process.getuid()}`,PLIST],{stdio:'ignore'});}catch(e){}try{fs.unlinkSync(PLIST);}catch(e){}console.log('Tracker oprit și dezinstalat.');}

module.exports={createTracker,decide,projectOf,dayOf,loadConfig,makeDb,DEFAULTS};
if(require.main===module){
  const cmd=process.argv[2]||'run';
  if(cmd==='run')run(process.argv.includes('--dry')).catch(e=>{console.error('Eroare:',e.message);process.exit(1);});
  else if(cmd==='status')status().catch(e=>{console.error('Eroare:',e.message);process.exit(1);});
  else if(cmd==='projects')console.log(JSON.stringify(loadConfig().projects,null,2));
  else if(cmd==='install')install();
  else if(cmd==='uninstall')uninstall();
  else console.log('Comenzi: run [--dry] | status | projects | install | uninstall');
}
