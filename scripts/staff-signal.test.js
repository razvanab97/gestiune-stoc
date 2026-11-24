#!/usr/bin/env node
/* Test „Semnal automat Admin → Staff" (Update #770) — funcțiile REALE din index.html (sb, staffAffectingWrite, staffSignalSoon), fetch și cronometre simulate.
   Staff își reîncarcă lista strict manual; semnalul (bulina „↻ Reîncarcă” + toast) trebuie să plece singur la orice scriere care schimbă coada Staff,
   o singură dată pentru un lot, și niciodată la scrieri care nu contează sau eșuate. Rulează: node scripts/staff-signal.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grabFn=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const grabConst=n=>{const i=src.indexOf('const '+n+'=');if(i<0)throw new Error('lipsește '+n);return src.slice(i,src.indexOf(';\n',i)+2);};
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

(async()=>{
  const world=(okFlag=true)=>{
    const log={pushes:0,fetches:[]};let timers=[];
    const env={
      SUPA_URL:'https://x.supabase.co',SUPA_KEY:'k',AbortController:class{constructor(){this.signal={};}abort(){}},
      fetch:async(url,opts)=>{log.fetches.push(opts.method+' '+url.replace(/^.*\/rest\/v1\//,''));return{ok:okFlag.v,json:async()=>okFlag.v?[{ok:1}]:{message:'eroare'}};},
      setTimeout:(f,ms)=>{const t={f,ms,dead:false};timers.push(t);return t;},clearTimeout:t=>{if(t)t.dead=true;},
      pushStaffRefresh:silent=>{log.pushes++;log.silent=silent;}
    };
    const code=`let staffSignalTimer=null;${grabConst('STAFF_SIGNAL_FIELDS')}${['staffAffectingWrite','staffSignalSoon','sb'].map(grabFn).join('\n')};return{sb,staffAffectingWrite,staffSignalSoon}`;
    const names=Object.keys(env);
    const api=new Function(...names,code)(...names.map(n=>env[n]));
    // rulează cronometrele rămase active (debounce-ul de 3 s), nu pe cele de 20 s ale timeout-ului de rețea
    const flush=()=>{const live=timers.filter(t=>!t.dead&&t.ms===3000);timers=[];live.forEach(t=>t.f());};
    return{api,log,flush};
  };

  console.log('\n— Ce scrieri schimbă coada Staff —');
  {
    const {api}=world({v:true}),W=api.staffAffectingWrite;
    eq('POST comandă NOUĂ trimisă efectiv în Staff (staff_trimis_at setat) → da',W('POST','platforma_comenzi',{comanda_id:'1',staff_trimis_at:'2026-11-24T10:00:00Z'}),true);
    eq('POST comandă comisă AUTOMAT, netrimisă (staff_trimis_at null) → nu',W('POST','platforma_comenzi',{comanda_id:'1',staff_trimis_at:null}),false);
    eq('POST fără câmpul staff_trimis_at → nu',W('POST','platforma_comenzi',{comanda_id:'1'}),false);
    eq('PATCH „Trimite în Staff” (staff_trimis_at) → da',W('PATCH','platforma_comenzi?id=eq.5',{staff_trimis_at:'2026-11-24T10:00:00Z'}),true);
    eq('PATCH AWB asociat (comanda intră din „Așteaptă AWB” în coadă) → da',W('PATCH','platforma_comenzi?id=eq.5',{awb:'1214069732',awb_courier:'Cargus'}),true);
    eq('PATCH anulare (anulata:true) → da',W('PATCH','platforma_comenzi?id=eq.5',{anulata:true,motiv_anulare:'x'}),true);
    eq('PATCH cantitate / produs schimbate (ce se împachetează) → da',[W('PATCH','platforma_comenzi?id=eq.5',{cantitate:10}),W('PATCH','platforma_comenzi?id=eq.5',{produs_id:9})],[true,true]);
    eq('PATCH reactivare (impachetat:false) → da',W('PATCH','platforma_comenzi?id=eq.5',{impachetat:false,impachetat_at:null,staff_trimis_at:'x'}),true);
    eq('ȘTERGERE a unei comenzi (decomitere / ștergere import) → da',W('DELETE','platforma_comenzi?id=eq.5'),true);
    eq('PATCH doar poza etichetei (awb_preview_url) sau sursa → nu (zgomot)',[W('PATCH','platforma_comenzi?id=eq.5',{awb_preview_url:'u'}),W('PATCH','platforma_comenzi?id=eq.5',{awb_source_file:'f',awb_source_page:1})],[false,false]);
    eq('PATCH efecte_aplicate (Aplică import) → nu',W('PATCH','platforma_comenzi?id=eq.5',{efecte_aplicate:true}),false);
    eq('vânzare directă nouă în Staff (jurnal cu staff_trimis_at) → da',W('POST','jurnal',{product_id:1,qty:2,staff_trimis_at:'2026-11-24T10:00:00Z'}),true);
    eq('alte tabele (produse, setari_app, comenzi_furnizor) → nu — inclusiv scrierea semnalului în sine (fără buclă)',['produse?id=eq.1','setari_app?key=eq.staff_push_refresh','comenzi_furnizor','platforma_mapari'].map(t=>W('PATCH',t,{awb:'x',cantitate:1})),[false,false,false,false]);
    eq('GET → niciodată',W('GET','platforma_comenzi?select=*'),false);
    eq('corp lipsă / ciudat → nu aruncă',[W('PATCH','platforma_comenzi?id=eq.5',null),W('POST','platforma_comenzi',undefined)],[false,false]);
    eq('corp ca listă (POST multiplu) se citește pe primul element',W('POST','platforma_comenzi',[{staff_trimis_at:'x'}]),true);
  }

  console.log('\n— Semnalul propriu-zis (cu sb() real) —');
  {
    const ok={v:true},{api,log,flush}=world(ok);
    await api.sb('PATCH','platforma_comenzi?id=eq.5',{awb:'1'});
    eq('nimic nu pleacă imediat (debounce de 3 s, ca un lot să dea un singur semnal)',log.pushes,0);
    flush();
    eq('după pauză: exact UN semnal, silențios (fără toast în Admin)',[log.pushes,log.silent],[1,true]);
  }
  {
    const ok={v:true},{api,log,flush}=world(ok);
    for(let i=0;i<36;i++)await api.sb('POST','platforma_comenzi',{comanda_id:String(i),staff_trimis_at:'x'});   // rutina zilnică: 36 de comenzi
    flush();
    eq('36 de comenzi trimise la rând → UN singur semnal (nu 36)',log.pushes,1);
  }
  {
    const ok={v:true},{api,log,flush}=world(ok);
    await api.sb('PATCH','platforma_comenzi?id=eq.5',{awb_preview_url:'u'});await api.sb('GET','platforma_comenzi?select=*');await api.sb('PATCH','produse?id=eq.1',{name:'x'});
    flush();
    eq('scrieri care nu schimbă coada Staff (poză etichetă, citiri, alte tabele) → niciun semnal',log.pushes,0);
  }
  {
    const ok={v:false},{api,log,flush}=world(ok);
    let threw=false;try{await api.sb('PATCH','platforma_comenzi?id=eq.5',{anulata:true});}catch(e){threw=true;}
    flush();
    eq('scriere EȘUATĂ (baza a respins-o) → eroarea se propagă ca înainte și NU se trimite semnal degeaba',[threw,log.pushes],[true,0]);
  }
  {
    const ok={v:true},{api,log,flush}=world(ok);
    await api.sb('PATCH','setari_app?key=eq.staff_push_refresh',{value:'now'});
    flush();
    eq('scrierea semnalului în setari_app nu declanșează alt semnal (fără buclă)',log.pushes,0);
  }

  console.log('\n— Integrare —');
  eq('sb() cheamă staffSignalSoon după o scriere reușită, nu înainte de verificarea erorii',/if\(!r\.ok\) throw new Error\(JSON\.stringify\(d\)\);\s*\/\/[^\n]*\n\s*if\(method!=='GET'&&staffAffectingWrite\(method,path,body\)\)staffSignalSoon\(\);/.test(src),true);
  eq('pushStaffRefresh rămâne cel existent (aceeași cheie setari_app.staff_push_refresh pe care o citește Staff)',/await dbPatch\('setari_app\?key=eq\.staff_push_refresh'/.test(src)&&/const STAFF_PUSH_KEY='staff_push_refresh'/.test(fs.readFileSync(path.join(__dirname,'..','staff.html'),'utf8')),true);
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE SEMNALULUI ADMIN → STAFF AU TRECUT');
  process.exit(failed?1:0);
})().catch(e=>{console.error(e);process.exit(1);});
