#!/usr/bin/env node
/* Test al „Status AWB eMAG (Livrările mele)": parsarea textului copiat de bookmark, îmbinarea cu citirile vechi, statusul ultimului AWB și chip-ul de pe card.
   Funcțiile REALE din index.html; date sintetice (structura reală a rândurilor din panou, fără date personale). Rulează: node scripts/livrari-emag.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('async function '+n+'(');if(i<0)i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const names=['pcxLivDate','pcxLivParse','pcxLivMerge','pcxLivIndex','pcxLivSetData','pcxLivInfo','pcxLivChipHtml','pcxLivSummary'];
const code='let EMAG_LIV=null,EMAG_LIV_IDX=new Map();'+names.map(grab).join('\n')+';return{pcxLivParse,pcxLivMerge,pcxLivIndex,pcxLivSetData,pcxLivInfo,pcxLivChipHtml,pcxLivSummary,pcxLivDate}';
const A=new Function('esc',code)(s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])));
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};
const R=(id,st,emis,o={})=>({t:'C',id,awb:'A'+id,cur:'Cargus',st,emis,ult:'',rid:'',...o});
const ago=h=>{const d=new Date(Date.now()-h*3600000),p=n=>String(n).padStart(2,'0');return`${p(d.getDate())}/${p(d.getMonth()+1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:00`;};
const payload=(rows,o={})=>JSON.stringify({app:'ab-livrari-emag',v:1,citit:new Date().toISOString(),piata:'ROMANIA',total:rows.length,rows,...o});

console.log('\n— Textul copiat de bookmark —');
{const ok=A.pcxLivParse(payload([R('582714814','AWB creat',ago(5)),R('581000001','Predat clientului',ago(90))]));
 eq('format valid: 2 rânduri, piața păstrată',[ok.ok,ok.rows.length,ok.piata],[true,2,'ROMANIA']);
 eq('JSON stricat → mesaj de eroare, nu excepție',!!A.pcxLivParse('nu e json').error,true);
 eq('alt JSON (nu vine de la bookmark) → respins',!!A.pcxLivParse('{"a":1}').error,true);
 eq('fără rânduri valide → respins',!!A.pcxLivParse(payload([{t:'C',id:'',st:''}])).error,true);
 const x=A.pcxLivParse(payload([{t:'X',id:'58-27<b>14814',awb:'A'.repeat(200),cur:'C',st:'AWB creat',emis:ago(1)}]));
 eq('curățare: tip necunoscut → C, id doar cifre, AWB tăiat la 40 de caractere',[x.rows[0].t,x.rows[0].id,x.rows[0].awb.length],['C','582714814',40]);}

console.log('\n— Îmbinarea cu citirile vechi —');
{const old=[R('1','AWB creat',ago(24)),R('2','In drum spre client',ago(24*40)),R('3','AWB creat',ago(24*3))];
 const nw=[R('1','Predat curierului',ago(24))];   // același AWB (A1) → înlocuit
 const m=A.pcxLivMerge(old,nw,Date.now());
 eq('același AWB: statusul nou înlocuiește pe cel vechi',m.find(r=>r.id==='1').st,'Predat curierului');
 eq('AWB vechi (ieșit din cele 500 afișate), sub 30 de zile → se păstrează',m.some(r=>r.id==='3'),true);
 eq('AWB mai vechi de 30 de zile → dispare',m.some(r=>r.id==='2'),false);}

console.log('\n— Statusul comenzii = al ULTIMULUI AWB emis —');
A.pcxLivSetData({citit:new Date().toISOString(),rows:[
  R('580764956','AWB creat',ago(30),{awb:'OLD1'}),R('580764956','Predat curierului',ago(2),{awb:'NEW1'}),   // reemis: contează ultimul
  R('582714814','AWB creat',ago(24*3)),R('582781939','In drum spre client',ago(24*3)),R('582326810','Asteapta preluarea clientului',ago(24*3)),
  R('581154471','Predat clientului',ago(24*5)),R('580000001','Refuz predare',ago(24*5)),R('580000002','Colet pierdut',ago(24*5)),
  R('580000003','Colet in curs de returnare',ago(24*5)),R('580000004','Returnat expeditorului',ago(24*9)),R('580000005','Colet deteriorat',ago(24*9)),
  {t:'R',id:'8195351',awb:'R1',cur:'eMAG Courier',st:'Predat curierului',emis:ago(10),ult:'',rid:''}]});
const info=id=>A.pcxLivInfo(id);
eq('comandă cu 2 AWB-uri: se ia cel mai recent (Predat curierului), n=2',[info('580764956').raw,info('580764956').n,info('580764956').awb],['Predat curierului',2,'NEW1']);
eq('AWB creat → ton „warn", formulat „nepredat curierului"',[info('582714814').tone,info('582714814').label],['warn','AWB creat — nepredat curierului']);
eq('în drum / așteaptă preluarea → informativ',[info('582781939').tone,info('582781939').label,info('582326810').tone,info('582326810').label],['info','În drum spre client','info','Așteaptă preluarea clientului']);
eq('predat clientului → verde („ok")',[info('581154471').tone,info('581154471').label],['ok','Livrat clientului']);
eq('refuz / pierdut / returnare / returnat / deteriorat → roșu („bad")',['580000001','580000002','580000003','580000004','580000005'].map(id=>info(id).tone),['bad','bad','bad','bad','bad']);
eq('rândurile „Retur" nu se indexează ca statusul comenzii',info('8195351'),null);
eq('comandă necunoscută → null',info('999'),null);
eq('vârsta AWB-ului în zile',info('582714814').days,3);

console.log('\n— Chip-ul de pe card și rezumatul —');
{const h=A.pcxLivChipHtml('582714814');
 eq('AWB creat de 3 zile: chip amber cu „de 3 zile"',[h.includes('pcx-liv-warn'),h.includes('AWB creat — nepredat curierului'),h.includes('de 3 zile')],[true,true,true]);
 A.pcxLivSetData({citit:new Date().toISOString(),rows:[R('7','AWB creat',ago(1))]});
 eq('AWB creat de azi: chip amber, fără „de N zile"',[A.pcxLivChipHtml('7').includes('pcx-liv-warn'),A.pcxLivChipHtml('7').includes(' zile')],[true,false]);
 eq('comandă necunoscută → fără chip',A.pcxLivChipHtml('999'),'');
 A.pcxLivSetData({citit:new Date(Date.now()-48*3600000).toISOString(),rows:[R('1','Predat curierului',ago(50))]});
 eq('citire mai veche de 36 de ore → chip estompat („stale"), cu avertisment în titlu',[A.pcxLivChipHtml('1').includes('stale'),A.pcxLivChipHtml('1').includes('vechi')],[true,true]);
 A.pcxLivSetData({citit:new Date().toISOString(),rows:[R('1','AWB creat',ago(80)),R('2','AWB creat',ago(2)),R('3','Predat clientului',ago(100)),R('4','Refuz predare',ago(100)),R('5','In drum spre client',ago(10))]});
 const s=A.pcxLivSummary();
 eq('rezumat: 2 nepredate (cea mai veche prima), 1 livrată, 1 problemă, 1 informativă',[s.warn.map(w=>w.id),s.ok,s.bad,s.info,s.total],[['1','2'],1,1,1,5]);}
console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE STATUSULUI DE LIVRARE eMAG AU TRECUT');
process.exit(failed?1:0);
