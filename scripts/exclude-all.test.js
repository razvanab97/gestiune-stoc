#!/usr/bin/env node
/* Test al „↺ Debifează toate" (Comenzi Platforme → Previzualizare): funcțiile reale din index.html, bază simulată.
   Rulează: node scripts/exclude-all.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',i);for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1)}}};
const code='let pcomExcluding=false;\n'+['pcomExcludeProtection','excludeAllPcom','uncommitPcomLine'].map(grab).join('\n');
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
function world(opts={}){
  const log=[];
  const PCOM=[
    {id:1,awb:'AWB111',efecteAplicate:false,impachetat:false},                 // creată, sigură de debifat
    {id:2,awb:'',efecteAplicate:false,impachetat:false},                       // creată, sigură
    {id:3,awb:'',efecteAplicate:true,impachetat:false},                        // stoc DEJA scăzut → protejată
    {id:4,awb:'',efecteAplicate:false,impachetat:true},                        // împachetată → protejată
    {id:5,awb:'',efecteAplicate:false,impachetat:false,staffBlocked:true,staffIssueResolved:false}, // problemă Staff → protejată
    {id:6,awb:'',efecteAplicate:false,impachetat:false}                        // creată, dar ștergerea va EȘUA (opts.failId)
  ];
  const mk=(o)=>({include:true,produsId:1,...o});
  const pcImpParsed=[mk({_committedId:1}),mk({_committedId:2}),mk({_committedId:3}),mk({_committedId:4}),mk({_committedId:5}),mk({_committedId:6}),
    mk({}),                                 // doar bifată, necomisă
    {include:false,produsId:1,_committedId:null}, // neinclusă — nu se atinge
    mk({_committing:true})];                // în curs de scriere — nu se atinge
  const env={PCOM,pcImpParsed,
    toast:(m,t)=>log.push(['toast',t||'ok',m]),confirm:m=>{log.push(['confirm',m]);return opts.confirm!==false;},
    renderPcomImportPreview(){},
    dbDelete:async p=>{const id=Number(p.match(/id=eq\.(\d+)/)[1]);log.push(['DELETE',id]);if(id===opts.failId)throw new Error('rețea');return[];},
    console:{error(){}}};
  const keys=Object.keys(env);
  return{log,PCOM,pcImpParsed,api:new Function(...keys,code+';return {excludeAllPcom,uncommitPcomLine}')(...keys.map(k=>env[k]))};
}
(async()=>{
  console.log('\n— Debifare în bloc —');
  {const w=world();await w.api.excludeAllPcom();
   const del=w.log.filter(l=>l[0]==='DELETE').map(l=>l[1]).sort();
   eq('șterge DOAR comenzile create și sigure (1, 2, 6)',del,[1,2,6]);
   eq('stoc scăzut (3) / împachetată (4) / problemă Staff (5): neatinse',[w.pcImpParsed[2].include,w.pcImpParsed[3].include,w.pcImpParsed[4].include],[true,true,true]);
   eq('comenzile din bază 3,4,5 rămân în PCOM',w.PCOM.filter(o=>[3,4,5].includes(o.id)).length,3);
   eq('liniile sigure sunt acum debifate',[w.pcImpParsed[0].include,w.pcImpParsed[1].include],[false,false]);
   eq('linia doar bifată (necomisă) se debifează, fără nicio ștergere în bază',[w.pcImpParsed[6].include,w.log.filter(l=>l[0]==='DELETE').length],[false,3]);
   eq('linia neinclusă și cea „în curs” nu se ating',[w.pcImpParsed[7].include,w.pcImpParsed[8].include],[false,true]);
   eq('AWB-ul comenzii șterse rămâne reținut pe linie (revine la re-bifare)',w.pcImpParsed[0].awb,'AWB111');
   eq('linia fără _committedId după ștergere',w.pcImpParsed[0]._committedId,null);
   const c=w.log.find(l=>l[0]==='confirm')[1];
   eq('confirmarea arată numerele corecte (3 create, 1 bifată, 3 neatinse)',[/3 deja create/.test(c),/1 doar bifate/.test(c),/3 RĂMÂN neatinse/.test(c)],[true,true,true]);}
  {const w=world({failId:6});await w.api.excludeAllPcom();
   eq('ștergere eșuată (6): linia rămâne INCLUSĂ, restul se debifează',[w.pcImpParsed[5].include,w.pcImpParsed[0].include,w.pcImpParsed[1].include],[true,false,false]);
   eq('...comanda 6 rămâne în bază/PCOM',w.PCOM.some(o=>o.id===6),true);
   const t=w.log.filter(l=>l[0]==='toast').pop();
   eq('mesajul final spune câte au eșuat, ca eroare',[t[1],/1 nu s-au putut debifa/.test(t[2])],['err',true]);}
  {const w=world({confirm:false});await w.api.excludeAllPcom();
   eq('confirmare refuzată: nimic nu se șterge și nimic nu se debifează',[w.log.some(l=>l[0]==='DELETE'),w.pcImpParsed[0].include,w.pcImpParsed[6].include],[false,true,true]);}
  {const w=world();w.pcImpParsed.forEach(x=>{x.include=false});await w.api.excludeAllPcom();
   eq('nimic inclus: mesaj, fără confirmare',[w.log.some(l=>l[0]==='confirm'),w.log.filter(l=>l[0]==='toast').pop()[2]],[false,'Nu există comenzi incluse de debifat']);}
  {const w=world();w.pcImpParsed.splice(0,w.pcImpParsed.length,{include:true,produsId:1,_committedId:3},{include:true,produsId:1,_committedId:4});await w.api.excludeAllPcom();
   eq('toate incluse sunt protejate: nu cere confirmare, nu șterge, explică de ce',[w.log.some(l=>l[0]==='confirm'),w.log.some(l=>l[0]==='DELETE'),/stocul deja scăzut/.test(w.log.filter(l=>l[0]==='toast').pop()[2])],[false,false,true]);}
  console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE „DEBIFEAZĂ TOATE” AU TRECUT');
  process.exit(failed?1:0);
})().catch(e=>{console.error('EROARE TEST',e);process.exit(1)});
