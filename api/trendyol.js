const BASE=String(process.env.TRENDYOL_API_BASE_URL||'https://apigw.trendyol.com').replace(/\/$/,'');
const OPEN_STATUSES=['Created','Picking','Invoiced'];

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function day(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null;}
function timestamp(date,end=false){return Date.parse(`${date}T${end?'23:59:59.999':'00:00:00.000'}Z`);}
function number(value){const n=Number(value);return Number.isFinite(n)?n:0;}
function round(value){return Math.round(number(value)*100)/100;}

function config(){
  const sellerId=String(process.env.TRENDYOL_SELLER_ID||'').trim(),key=String(process.env.TRENDYOL_API_KEY||'').trim(),secret=String(process.env.TRENDYOL_API_SECRET||'').trim();
  if(!sellerId||!key||!secret)throw new Error('Integrarea Trendyol nu este configurată în Vercel. Adaugă TRENDYOL_SELLER_ID, TRENDYOL_API_KEY și TRENDYOL_API_SECRET.');
  return{sellerId,authorization:'Basic '+Buffer.from(`${key}:${secret}`).toString('base64')};
}
async function requestPackages(sellerId,authorization,status,startDate,endDate){
  const rows=[];
  for(let page=0;page<50;page++){
    const q=new URLSearchParams({status,startDate:String(timestamp(startDate)),endDate:String(timestamp(endDate,true)),orderByField:'PackageLastModifiedDate',orderByDirection:'DESC',page:String(page),size:'200'});
    const r=await fetch(`${BASE}/integration/order/sellers/${encodeURIComponent(sellerId)}/v2/orders?${q}`,{headers:{authorization,'user-agent':`${sellerId} - SelfIntegration`,accept:'application/json'}});
    const text=await r.text();let data={};try{data=text?JSON.parse(text):{};}catch(e){data={message:text};}
    if(!r.ok)throw new Error(data.message||data.error||`Trendyol API ${r.status}`);
    const content=Array.isArray(data.content)?data.content:[];rows.push(...content);
    if(content.length===0||page+1>=Number(data.totalPages||0))break;
  }
  return rows;
}
function packageLines(pack){
  const customer=[pack.customerFirstName,pack.customerLastName].filter(Boolean).join(' ').trim()||pack.deliveryAddress?.fullName||'';
  const lines=Array.isArray(pack.lines)?pack.lines:[];
  return lines.filter(line=>number(line.quantity)>0).map(line=>{
    const qty=number(line.quantity),vat=number(line.vatRate)>1?number(line.vatRate)/100:number(line.vatRate);
    const gross=number(line.lineUnitPrice)||number(line.lineGrossAmount)/(qty||1);
    return{comandaId:String(pack.orderNumber||pack.shipmentPackageId||''),pachetId:String(pack.shipmentPackageId||pack.id||''),data:new Date(number(pack.orderDate)||number(pack.createdDate)||Date.now()).toISOString().slice(0,10),pnk:String(line.barcode||''),codProdus:String(line.stockCode||line.barcode||''),clientNume:customer,titluExtern:String(line.productName||''),cantitate:qty,pretFaraTva:round(gross/(1+(vat||0))),pretTotalCuTva:round(gross*qty),moneda:String(line.currencyCode||pack.currencyCode||'RON').toUpperCase(),tara:String(pack.shipmentAddress?.countryCode||pack.deliveryAddress?.countryCode||'RO').toUpperCase(),awb:String(pack.cargoTrackingNumber||''),status:String(pack.status||pack.shipmentPackageStatus||'')};
  });
}

module.exports=async function handler(req,res){
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Folosește POST'});
    const body=bodyOf(req);if(String(body.action||'')!=='orders')return res.status(400).json({error:'Acțiune Trendyol necunoscută'});
    const startDate=day(body.startDate),endDate=day(body.endDate)||startDate;
    if(!startDate||!endDate||endDate<startDate)return res.status(400).json({error:'Alege un interval de date valid'});
    if((timestamp(endDate)-timestamp(startDate))/86400000>13)return res.status(400).json({error:'Trendyol permite maximum 14 zile într-un singur import'});
    const {sellerId,authorization}=config(),seen=new Set(),packages=[];
    for(const status of OPEN_STATUSES){
      const result=await requestPackages(sellerId,authorization,status,startDate,endDate);
      for(const pack of result){const id=String(pack.shipmentPackageId||pack.id||'');if(id&&!seen.has(id)){seen.add(id);packages.push(pack);}}
    }
    const lines=packages.flatMap(packageLines).filter(x=>x.comandaId&&x.titluExtern);
    return res.status(200).json({startDate,endDate,packages:packages.length,lines,statuses:OPEN_STATUSES});
  }catch(e){return res.status(500).json({error:e.message||'Eroare integrare Trendyol'});}
};
