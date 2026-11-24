#!/usr/bin/env node
/* Test al citirii etichetelor AWB (Comenzi Platforme → Asociază AWB-uri): parserul REAL din index.html, pe texte SINTETICE
   (structura etichetelor reale, fără date personale). Rulează: node scripts/awb-parse.test.js */
const fs=require('fs'),path=require('path');
const src=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const grab=n=>{let i=src.indexOf('function '+n+'(');if(i<0)throw new Error('lipsește '+n);let d=0,j=src.indexOf('{',src.indexOf(')',i));for(let k=j;k<src.length;k++){if(src[k]==='{')d++;else if(src[k]==='}'){d--;if(d===0)return src.slice(i,k+1);}}throw new Error('neînchis '+n);};
const cst=n=>{const m=src.match(new RegExp('const '+n+'=.*?;\\n','s'));if(!m)throw new Error('lipsește '+n);return m[0];};
const code=[cst('AWB_CANCEL_RE'),cst('AWB_KNOWN_FALSE_POSITIVES'),...['awbNorm','awbLooksPlausible','awbFromFilename','awbApplyFilenameOrderId','parseAwbLabelText'].map(grab)].join('\n')+';return{parseAwbLabelText,awbLooksPlausible,awbFromFilename,awbApplyFilenameOrderId};';
const A=new Function(code)();
let failed=0;const eq=(n,a,b)=>{const ok=JSON.stringify(a)===JSON.stringify(b);if(!ok)failed++;console.log((ok?'OK   ':'FAIL ')+n+(ok?'':`\n       primit:   ${JSON.stringify(a)}\n       așteptat: ${JSON.stringify(b)}`));};

console.log('\n— FAN Courier de hub, Trendyol 3P (BoxNow BG/GR) —');
const hub=(country,awb,content)=>`${country} 13/11/2026 Trendyol 3P SHIP FROM\nFirma Test, Iasi, RO\nF81567140\n1 of 1\nDESTINATAR ROMANIA\nHub Destinatar\nHub International Arad\nAg. FAN: HUB International\n${awb}\nContent: ${content}\nScaneaza codul FAN Courier\nREFERENCE: (FAN)5198640840\nWWW.BOXNOW.${country}\nPrimitor Test\nBSOF 001\n4676729895\n1 | COD | 1.00 kg`;
eq('BG: AWB = codul FAN complet, comanda = Content (nu codul BoxNow 4676729895)',A.parseAwbLabelText(hub('BG','7000182844419001F6821','11824254420')),{awb:'7000182844419001F6821',comandaId:'11824254420',courier:'FAN Courier / BoxNow'});
eq('GR: același format',A.parseAwbLabelText(hub('GR','7000183532653001F6821','11832148613')),{awb:'7000183532653001F6821',comandaId:'11832148613',courier:'FAN Courier / BoxNow'});
eq('etichetă anulată: nu se asociază (courierCanceled)',A.parseAwbLabelText('CANCELED\n'+hub('BG','7000182844419001F6821','11824254420')),{courierCanceled:true,awb:'7000182844419001F6821'});
eq('fără codul FAN complet: nu ghicește (cade pe alt flux)',A.parseAwbLabelText(hub('BG','','11824254420').replace('4676729895','x'))?.awb,undefined);

console.log('\n— Formatele existente rămân neschimbate —');
eq('FAN clasic („AWB:" + „Continut:")',A.parseAwbLabelText('AWB: 7000181277640\nServiciu: Standard\nContinut: 11818371559'),{awb:'7000181277640',comandaId:'11818371559',courier:'FAN Courier'});
eq('nume fișier eMAG: comandă_curier_AWB',A.awbFromFilename('568193459_Cargus_1213629115.pdf'),{comandaId:'568193459',courier:'Cargus',awb:'1213629115'});
eq('nume fișier cu numerotare în față și sufix (1)',A.awbFromFilename('64 - 582414896_Cargus_1213470361 (1).pdf'),{comandaId:'582414896',courier:'Cargus',awb:'1213470361'});
eq('o potrivire indirectă (pe nume) devine determinist când AWB-ul din nume = AWB-ul de pe etichetă',A.awbApplyFilenameOrderId({awb:'1213629115',cargusEmagLabel:true,destinatar:'X',courier:'Cargus'},'568193459_Cargus_1213629115.pdf',1).comandaId,'568193459');
eq('AWB diferit între nume și etichetă: nu se atinge',A.awbApplyFilenameOrderId({awb:'999',cargusEmagLabel:true,courier:'Cargus'},'568193459_Cargus_1213629115.pdf',1).comandaId,undefined);

console.log('\n— Fișiere numerotate „NNN_…” (Update #770, lotul AWB_numerotate_49) —');
{
  const f=A.awbFromFilename;
  eq('„018_582410751_Cargus_1214069732.pdf" → comanda 582410751 (înainte: null → etichetă Cargus ambiguă la 2 comenzi către același client, fără AWB, fără Staff)',f('018_582410751_Cargus_1214069732.pdf'),{comandaId:'582410751',courier:'Cargus',awb:'1214069732'});
  eq('Sameday BG numerotat: „015_1028046067_Sameday_012EMGXB23960265001.pdf" → AWB complet (19 caractere), nu cel trunchiat de AI',f('015_1028046067_Sameday_012EMGXB23960265001.pdf'),{comandaId:'1028046067',courier:'Sameday',awb:'012EMGXB23960265001'});
  eq('numerotat + sufix „(1)" din browser',f('030_583304927_eMAG_Courier_4EMGLN199690149001 (1).pdf'),{comandaId:'583304927',courier:'eMAG Courier',awb:'4EMGLN199690149001'});
  eq('numai codul AWB în nume, numerotat: „007_012EMGXL23176005001.pdf"',f('007_012EMGXL23176005001.pdf'),{comandaId:'',courier:'',awb:'012EMGXL23176005001'});
  eq('numerotarea veche „64 - …” rămâne',f('64 - 582414896_Cargus_1213470361.pdf'),{comandaId:'582414896',courier:'Cargus',awb:'1213470361'});
  eq('un număr de comandă (≥ 6 cifre) NU se confundă cu numerotarea și nu se taie',f('582410751_Cargus_1214069732.pdf').comandaId,'582410751');
  eq('nume cu numerotare dar fără structură de etichetă (042_ksaiiqwq.pdf) → tot null (are comanda pe etichetă)',f('042_ksaiiqwq.pdf'),null);
  // fluxul complet: Cargus, 2 comenzi către același client (ambiguu pe nume) → numele fișierului hotărăște
  const amb={awb:'1214069732',cargusEmagLabel:true,cargusEmagAmbiguous:true,destinatar:'RO-FIRMA TEST SA',courier:'Cargus'};
  const r=A.awbApplyFilenameOrderId(amb,'018_582410751_Cargus_1214069732.pdf',1);
  eq('2 comenzi cu același destinatar: numele fișierului numerotat rezolvă ambiguitatea (comanda din nume, fără steagul „ambiguu")',[r.comandaId,r.cargusEmagAmbiguous,r._filenameOrderId],['582410751',undefined,true]);
  const r2=A.awbApplyFilenameOrderId({...amb,awb:'1214069727'},'018_582410751_Cargus_1214069732.pdf',1);
  eq('AWB-ul din nume diferit de cel de pe etichetă (fișier redenumit greșit) → ignorat, rămâne ambiguu',[r2.comandaId,r2.cargusEmagAmbiguous],[undefined,true]);
}

console.log('\n— Plauzibilitate AWB (plasa de siguranță pentru AI) —');
const ok=(a,c)=>A.awbLooksPlausible(a,c);
eq('ACS: AWB numeric 11 cifre / 10 cifre acceptate',[ok('81408625808','ACS'),ok('2876470645','ACS'),ok('81410458531','DPD')],[true,true,true]);
eq('ACS: „codul de client" cu litere grecești NU e AWB (bug real, 2ΘΣ232960)',[ok('2ΘΣ232960','ACS'),ok('2ΘΣ232960','DPD')],[false,false]);
eq('Foxpost/furgefutar: Z + 9-10 cifre',[ok('Z2843859323','furgefutar.hu'),ok('X2843859323','furgefutar.hu'),ok('2843859323','furgefutar.hu')],[true,false,false]);
eq('Cargus: exact 10 cifre; telefonul fix Cargus (0219282) respins',[ok('1213629115','Cargus'),ok('12136291','Cargus'),ok('0219282','Cargus')],[true,false,false]);
eq('curier fără regulă specifică: acceptat (neschimbat)',ok('ABC123','Sameday'),true);
eq('gol → respins',ok('','ACS'),false);

console.log(failed?`\nESUATE: ${failed}`:'\nTOATE TESTELE CITIRII AWB AU TRECUT');
process.exit(failed?1:0);
