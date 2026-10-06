/* TIME TRACKING — widget „Timp azi" + statistici, partajat între toate aplicațiile/proiectele.
   Citește sesiunile salvate de trackerul de pe Mac (scripts/time-tracker.js) din Supabase (time_sessions /
   time_daily / time_projects — vezi migration_time_tracking.sql). NU măsoară nimic singur: faptul că aplicația
   e deschisă într-un tab nu înseamnă timp lucrat; sursa adevărului e trackerul + baza de date.

   Conectare într-o aplicație (o singură linie, cu id-ul propriu al proiectului):
     <script src="https://gestiune-stoc-pi.vercel.app/time-tracking.js" data-project="ab-textile" defer></script>
   Opțiuni (data-*): project (obligatoriu) · label · mount (selector CSS; implicit un element fix în colț) ·
   supa-url / supa-key (implicit baza comună). Stilul moștenește variabilele CSS ale aplicației (--surf, --b2, --acc, ...). */
(function(){
  'use strict';
  var script=document.currentScript||document.querySelector('script[data-project][src*="time-tracking"]');
  if(!script||!script.dataset.project){console.warn('time-tracking: lipsește data-project');return;}
  var CFG={
    project:script.dataset.project,
    label:script.dataset.label||'Timp azi',
    mount:script.dataset.mount||'',
    url:(script.dataset.supaUrl||'https://cbpavtvrfpkbaeueexlw.supabase.co').replace(/\/$/,'')+'/rest/v1',
    key:script.dataset.supaKey||'sb_publishable_m7_oRHyxmrrvuGpudY9V1g_LM85ubbr',
    tz:'Europe/Bucharest',
    liveSeconds:45,        // un heartbeat mai vechi de atât ⇒ trackerul nu mai rulează ⇒ cronometrul stă
    refreshMs:20000
  };
  var PALETTE=['#7657F6','#F79009','#12B76A','#0BA5EC','#EE46BC','#F04438','#667085'];
  var state={sessions:[],loaded:false,error:null,day:'',skew:0,panel:false,range:'today',daily:null,projects:null};
  var el={};

  /* ── helpers ── */
  function dayOf(ms){return new Intl.DateTimeFormat('en-CA',{timeZone:CFG.tz,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(ms));}
  function pad(n){return String(n).padStart(2,'0');}
  function clock(s){s=Math.max(0,Math.floor(s));return pad(Math.floor(s/3600))+':'+pad(Math.floor(s%3600/60))+':'+pad(s%60);}
  function hm(s){s=Math.max(0,Math.round(s));var h=Math.floor(s/3600),m=Math.floor(s%3600/60);if(h)return h+'h '+pad(m)+'m';if(m)return m+'m';return s?'<1m':'0m';}
  function now(){return Date.now()+state.skew;}
  function headers(){return{apikey:CFG.key,Authorization:'Bearer '+CFG.key};}
  function get(path){
    return fetch(CFG.url+'/'+path,{headers:headers()}).then(function(r){
      var d=r.headers.get('date');if(d){var sv=Date.parse(d);if(sv){var k=sv-Date.now();state.skew=Math.abs(k)<3000?0:k;}} // antetul Date are rezoluție de 1s: ignorăm diferențele mici (aceeași mașină)
      if(!r.ok)return r.text().then(function(t){var e=new Error('HTTP '+r.status);e.status=r.status;e.body=t;throw e;});
      return r.json();
    });
  }

  /* ── cronometrul: azi, pentru acest proiect ── */
  function load(){
    var day=dayOf(now());state.day=day;
    return get('time_sessions?project_id=eq.'+encodeURIComponent(CFG.project)+'&date=eq.'+day+'&select=id,started_at,last_seen_at,ended_at,duration_seconds')
      .then(function(rows){state.sessions=rows||[];state.loaded=true;state.error=null;paint();})
      .catch(function(e){state.error=e;state.loaded=true;paint();});
  }
  function total(){
    var t=now(),sum=0,live=false;
    state.sessions.forEach(function(s){
      var d=s.duration_seconds||0;
      if(!s.ended_at){var age=(t-Date.parse(s.last_seen_at))/1000;if(age>-5&&age<=CFG.liveSeconds){d+=Math.max(0,age);live=true;}}
      sum+=d;
    });
    return{seconds:sum,live:live};
  }
  function paint(){
    if(!el.root)return;
    if(state.error){el.root.dataset.state='off';el.time.textContent='--:--:--';
      el.btn.title=(state.error.status===404||/42P01|time_sessions/.test(state.error.body||''))?'Time tracking neactivat: rulează migration_time_tracking.sql în Supabase.':'Nu pot citi timpul acum — se reîncearcă automat.';return;}
    if(dayOf(now())!==state.day){load();return;}   // s-a schimbat ziua: „Timp azi" repornește de la 00:00:00, istoricul rămâne în bază
    var r=total();
    el.root.dataset.state=r.live?'live':'idle';
    el.time.textContent=clock(r.seconds);
    el.btn.title=r.live?'Se lucrează acum la acest proiect — click pentru statistici':'Timp lucrat azi la acest proiect — click pentru statistici';
    if(state.panel&&r.live)paintPanelToday();
  }

  /* ── statistici (panou) ── */
  function colorOf(id,i){var p=(state.projects||{})[id];return(p&&p.color)||PALETTE[i%PALETTE.length];}
  function nameOf(id){var p=(state.projects||{})[id];return(p&&p.name)||id;}
  function loadStats(){
    return Promise.all([
      get('time_daily?select=project_id,date,seconds&order=date.desc&limit=5000'),
      get('time_projects?select=id,name,color,sort').catch(function(){return[];})
    ]).then(function(res){
      state.daily=res[0]||[];state.projects={};(res[1]||[]).forEach(function(p){state.projects[p.id]=p;});
      state.statsError=null;paintPanel();
    }).catch(function(e){state.statsError=e;paintPanel();});
  }
  function rangeTotals(range){
    var today=dayOf(now()),out={};
    var from;
    if(range==='today')from=today;
    else if(range==='7d')from=dayOf(now()-6*86400000);
    else if(range==='month')from=today.slice(0,8)+'01';
    else from='0000-00-00';
    (state.daily||[]).forEach(function(r){if(r.date>=from&&r.date<=today)out[r.project_id]=(out[r.project_id]||0)+(r.seconds||0);});
    // pentru ACEST proiect, „azi" include și minutele curente (sesiunea deschisă nu e încă în agregatul pe zi)
    var daily=0;(state.daily||[]).forEach(function(r){if(r.project_id===CFG.project&&r.date===today)daily+=r.seconds||0;});
    var extra=Math.max(0,total().seconds-daily);
    if(extra>0)out[CFG.project]=(out[CFG.project]||0)+extra;
    return out;
  }
  function icon(){ // cronometru (stil linie, ca iconițele din meniu) — moștenește culoarea textului
    var ns='http://www.w3.org/2000/svg',s=document.createElementNS(ns,'svg');
    s.setAttribute('viewBox','0 0 24 24');s.setAttribute('class','tt-ic');s.setAttribute('aria-hidden','true');
    s.innerHTML='<line x1="10" x2="14" y1="2" y2="2"/><line x1="12" x2="15" y1="14" y2="11"/><circle cx="12" cy="14" r="8"/>';
    return s;
  }
  function h(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!=null)e.textContent=text;return e;}
  function paintPanelToday(){if(state.panel&&state.range==='today'&&state.daily)paintPanel();}
  function paintPanel(){
    var body=el.body;body.textContent='';
    if(state.statsError){body.appendChild(h('div','tt-empty','Statisticile nu se pot citi încă. Rulează migration_time_tracking.sql în Supabase.'));return;}
    if(!state.daily){body.appendChild(h('div','tt-empty','Se încarcă…'));return;}
    var tabs=h('div','tt-tabs');
    [['today','Azi'],['7d','7 zile'],['month','Luna aceasta'],['all','Total']].forEach(function(t){
      var b=h('button','tt-tab'+(state.range===t[0]?' on':''),t[1]);b.type='button';b.onclick=function(){state.range=t[0];paintPanel();};tabs.appendChild(b);
    });
    body.appendChild(tabs);
    var totals=rangeTotals(state.range),ids=Object.keys(totals).sort(function(a,b){return totals[b]-totals[a];}),sum=0,max=0;
    ids.forEach(function(id){sum+=totals[id];max=Math.max(max,totals[id]);});
    var list=h('div','tt-list');
    if(!ids.length)list.appendChild(h('div','tt-empty','Nimic înregistrat în această perioadă.'));
    ids.forEach(function(id,i){
      var row=h('div','tt-row'+(id===CFG.project?' me':''));
      var top=h('div','tt-row-top');var nm=h('span','tt-nm');var dot=h('span','tt-pdot');dot.style.background=colorOf(id,i);nm.appendChild(dot);nm.appendChild(document.createTextNode(nameOf(id)));
      top.appendChild(nm);top.appendChild(h('span','tt-val',hm(totals[id])));row.appendChild(top);
      var bar=h('div','tt-bar');var fill=h('i');fill.style.width=(max?Math.max(2,totals[id]/max*100):0)+'%';fill.style.background=colorOf(id,i);bar.appendChild(fill);row.appendChild(bar);
      list.appendChild(row);
    });
    if(ids.length>1){var t=h('div','tt-row tt-total');var tp=h('div','tt-row-top');tp.appendChild(h('span','tt-nm','TOTAL'));tp.appendChild(h('span','tt-val',hm(sum)));t.appendChild(tp);list.appendChild(t);}
    body.appendChild(list);
    // istoric pe zile pentru ACEST proiect (ultimele 14 zile) — graficul de distribuție în timp
    var days=[],today=dayOf(now()),map={};
    (state.daily||[]).forEach(function(r){if(r.project_id===CFG.project)map[r.date]=(map[r.date]||0)+(r.seconds||0);});
    var liveTot=total().seconds;if(liveTot>(map[today]||0))map[today]=liveTot;
    for(var i=13;i>=0;i--){var d=dayOf(now()-i*86400000);days.push({d:d,s:map[d]||0});}
    var dmax=Math.max.apply(null,days.map(function(x){return x.s;}).concat([1]));
    var sec=h('div','tt-sec');sec.appendChild(h('div','tt-sec-t','Pe zile — '+nameOf(CFG.project)));
    var chart=h('div','tt-chart');
    days.forEach(function(x){var c=h('div','tt-col'+(x.d===today?' today':''));c.title=x.d+' — '+hm(x.s);
      var b=h('i');b.style.height=(x.s?Math.max(4,x.s/dmax*100):0)+'%';c.appendChild(b);c.appendChild(h('span','',x.d.slice(8)));chart.appendChild(c);});
    sec.appendChild(chart);
    var hist=h('div','tt-hist');
    days.slice().reverse().filter(function(x){return x.s>0;}).slice(0,7).forEach(function(x){
      var r=h('div','tt-hist-row');r.appendChild(h('span','',x.d.slice(8)+'.'+x.d.slice(5,7)+'.'+x.d.slice(0,4)));r.appendChild(h('b','',hm(x.s)));hist.appendChild(r);});
    sec.appendChild(hist);body.appendChild(sec);
  }
  function openStats(open){
    state.panel=open==null?!state.panel:!!open;
    el.panel.hidden=!state.panel;
    if(state.panel){el.root.classList.add('open');paintPanel();loadStats();}else el.root.classList.remove('open');
  }

  /* ── UI ── */
  var CSS=[
    '.tt-widget{position:fixed;left:14px;bottom:14px;z-index:150;font-family:var(--font,system-ui,sans-serif)}',
    '.tt-widget.tt-inline{position:static}',
    '.tt-btn{display:flex;flex-direction:column;align-items:flex-start;gap:2px;width:100%;text-align:left;background:var(--surf,#fff);border:1px solid var(--b2,#e4e7ec);border-radius:var(--r2,14px);padding:8px 14px 9px;cursor:pointer;box-shadow:var(--sh,0 1px 2px rgba(16,24,40,.06));font-family:inherit;transition:border-color .15s,box-shadow .15s}',
    '.tt-btn:hover{border-color:var(--acc,#7657F6)}',
    '.tt-lbl{display:flex;align-items:center;gap:7px;font-size:13px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:var(--t3,#667085)}',
    '.tt-time{font-family:var(--mono,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:24px;font-weight:700;letter-spacing:.01em;color:var(--t1,#101828);font-variant-numeric:tabular-nums;line-height:1.15}',
    '.tt-ic{width:1.15em;height:1.15em;flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}',
    '.tt-ttl{display:flex;align-items:center;gap:8px}',
    '.tt-dot{width:8px;height:8px;border-radius:50%;background:var(--b3,#d0d5dd);flex:none}',
    '.tt-widget[data-state=live] .tt-btn{border-color:var(--acc,#7657F6);box-shadow:0 0 0 3px var(--acc-light,rgba(118,87,246,.12))}',
    '.tt-widget[data-state=live] .tt-time{color:var(--acc,#7657F6)}',
    '.tt-widget[data-state=live] .tt-dot{background:#12B76A;animation:ttPulse 1.6s ease-in-out infinite}',
    '.tt-widget[data-state=off] .tt-time{color:var(--t3,#98a2b3)}',
    '@keyframes ttPulse{0%,100%{box-shadow:0 0 0 0 rgba(18,183,106,.5)}50%{box-shadow:0 0 0 5px rgba(18,183,106,0)}}',
    '.tt-panel{position:absolute;left:0;bottom:calc(100% + 8px);width:min(380px,92vw);max-height:72vh;overflow:auto;background:var(--surf,#fff);border:1px solid var(--b2,#e4e7ec);border-radius:var(--r2,14px);box-shadow:0 18px 50px rgba(16,24,40,.18);padding:14px 16px 16px;z-index:160;font-size:15px;color:var(--t1,#101828)}',
    '.tt-panel[hidden]{display:none}',
    '.tt-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:10px}',
    '.tt-head b{font-size:16px;font-weight:800}',
    '.tt-x{border:0;background:none;font-size:20px;line-height:1;cursor:pointer;color:var(--t3,#667085);padding:2px 6px}',
    '.tt-tabs{display:flex;gap:4px;background:var(--surf2,#f2f4f7);border-radius:10px;padding:3px;margin-bottom:12px}',
    '.tt-tab{flex:1;border:0;background:none;border-radius:8px;padding:6px 4px;font:inherit;font-size:13px;font-weight:700;color:var(--t2,#475467);cursor:pointer}',
    '.tt-tab.on{background:var(--surf,#fff);color:var(--acc,#7657F6);box-shadow:0 1px 2px rgba(16,24,40,.1)}',
    '.tt-row{margin-bottom:11px}.tt-row-top{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:5px}',
    '.tt-nm{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}.tt-row.me .tt-nm{color:var(--acc,#7657F6)}',
    '.tt-pdot{width:9px;height:9px;border-radius:3px;flex:none}',
    '.tt-val{font-family:var(--mono,ui-monospace,monospace);font-weight:700;font-size:14px}',
    '.tt-bar{height:7px;background:var(--surf2,#f2f4f7);border-radius:99px;overflow:hidden}.tt-bar i{display:block;height:100%;border-radius:99px;transition:width .4s}',
    '.tt-total{border-top:1px dashed var(--b2,#e4e7ec);padding-top:9px;margin-top:4px}.tt-total .tt-nm{color:var(--t3,#667085);font-size:12px;letter-spacing:.08em}',
    '.tt-sec{margin-top:14px;border-top:1px solid var(--b1,#eaecf0);padding-top:12px}.tt-sec-t{font-size:12px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--t3,#667085);margin-bottom:8px}',
    '.tt-chart{display:flex;align-items:flex-end;gap:4px;height:74px}',
    '.tt-col{flex:1;height:100%;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:3px;min-width:0}',
    '.tt-col i{display:block;width:100%;background:var(--acc-light,#e9e3ff);border-radius:4px 4px 0 0;min-height:0}.tt-col.today i{background:var(--acc,#7657F6)}',
    '.tt-col span{font-size:10px;color:var(--t3,#98a2b3);line-height:1}',
    '.tt-hist{margin-top:10px}.tt-hist-row{display:flex;justify-content:space-between;font-size:13px;padding:3px 0;color:var(--t2,#475467)}.tt-hist-row b{font-family:var(--mono,ui-monospace,monospace);color:var(--t1,#101828)}',
    '.tt-empty{padding:10px 2px;color:var(--t3,#667085);font-size:14px}',
    '@media print{.tt-widget{display:none!important}}'
  ].join('\n');
  function build(){
    var st=document.createElement('style');st.textContent=CSS;document.head.appendChild(st);
    var root=h('div','tt-widget');root.dataset.state='idle';
    var btn=h('button','tt-btn');btn.type='button';
    var lbl=h('span','tt-lbl');lbl.appendChild(h('span','tt-dot'));lbl.appendChild(icon());lbl.appendChild(document.createTextNode(CFG.label));
    var time=h('span','tt-time','00:00:00');btn.appendChild(lbl);btn.appendChild(time);
    var panel=h('div','tt-panel');panel.hidden=true;
    var head=h('div','tt-head');var ttl=h('b','tt-ttl');ttl.appendChild(icon());ttl.appendChild(document.createTextNode('Time tracking'));head.appendChild(ttl);var x=h('button','tt-x','×');x.type='button';x.setAttribute('aria-label','Închide');x.onclick=function(){openStats(false);};head.appendChild(x);
    var body=h('div','tt-body');panel.appendChild(head);panel.appendChild(body);
    root.appendChild(btn);root.appendChild(panel);
    btn.onclick=function(e){e.stopPropagation();openStats();};
    panel.onclick=function(e){e.stopPropagation();};
    document.addEventListener('click',function(){if(state.panel)openStats(false);});
    document.addEventListener('keydown',function(e){if(e.key==='Escape'&&state.panel)openStats(false);});
    var host=CFG.mount?document.querySelector(CFG.mount):null;
    if(host){root.classList.add('tt-inline');host.appendChild(root);}else document.body.appendChild(root);
    el={root:root,btn:btn,time:time,panel:panel,body:body};
  }
  function start(){
    build();load();
    setInterval(function(){if(!document.hidden)paint();},1000);
    setInterval(function(){if(!document.hidden)load();},CFG.refreshMs);
    document.addEventListener('visibilitychange',function(){if(!document.hidden)load();});
    window.TimeTracking={project:CFG.project,refresh:load,openStats:openStats,seconds:function(){return total().seconds;}};
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start);else start();
})();
