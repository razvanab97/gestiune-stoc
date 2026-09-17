const EMAG_MARKETS={
  RO:{base:process.env.EMAG_API_BASE_URL||'https://marketplace-api.emag.ro/api-3',currency:'RON'},
  BG:{base:process.env.EMAG_BG_API_BASE_URL||'https://marketplace-api.emag.bg/api-3',currency:'BGN'},
  HU:{base:process.env.EMAG_HU_API_BASE_URL||'https://marketplace-api.emag.hu/api-3',currency:'HUF'}
};

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function isoDay(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null;}
function nextDay(day){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}

function credentials(market='RO'){
  const user=process.env[`EMAG_${market}_API_USERNAME`]||process.env.EMAG_API_USERNAME,pass=process.env[`EMAG_${market}_API_PASSWORD`]||process.env.EMAG_API_PASSWORD;
  if(!user||!pass)throw new Error('Integrarea eMAG nu este configurată încă în Vercel. Adaugă EMAG_API_USERNAME și EMAG_API_PASSWORD.');
  return 'Basic '+Buffer.from(`${user}:${pass}`).toString('base64');
}
async function emag(market,path,payload){
  const cfg=EMAG_MARKETS[market]||EMAG_MARKETS.RO,base=String(cfg.base).replace(/\/$/,'');
  const r=await fetch(base+path,{method:'POST',headers:{'content-type':'application/json',authorization:credentials(market)},body:JSON.stringify(payload)});
  const text=await r.text();let data;
  try{data=text?JSON.parse(text):{};}catch(e){data={message:text};}
  if(!r.ok||data?.isError)throw new Error(data?.messages?.map(x=>x.message||x).join('; ')||data?.message||`eMAG API ${r.status}`);
  return data;
}
function orderLines(order,market='RO'){
  const customer=order.customer||{};
  const products=Array.isArray(order.products)?order.products:[];
  const vatRate=num(order.vat_percentage||order.vat||21)>1?num(order.vat_percentage||order.vat||21)/100:num(order.vat_percentage||order.vat||.21);
  return products.filter(p=>num(p.status||1)!==0&&num(p.quantity)>0).map(p=>{
    const qty=num(p.quantity),priceExVat=num(p.sale_price),currency=String(p.currency||order.currency||EMAG_MARKETS[market].currency).toUpperCase();
    return{
      comandaId:String(order.id||''),pachetId:String(order.id||''),data:String(order.date||order.created||'').slice(0,10),
      pnk:String(p.part_number||p.part_number_key||p.ext_part_number||''),codProdus:String(p.ext_part_number||p.product_id||''),
      clientNume:String(customer.name||customer.shipping_contact||''),titluExtern:String(p.name||''),cantitate:qty,
      pretFaraTva:priceExVat,pretTotalCuTva:Math.round(priceExVat*qty*(1+vatRate)*100)/100,moneda:currency,
      tara:market,orderId:String(order.id||'')
    };
  });
}
async function readOrders(market,day=null,status=null){
  const all=[];let page=1;
  while(page<=10){ // maximum 10.000 comenzi/zi; protecție pentru un apel manual
    // type:3 înseamnă livrare de seller; status:2 este adăugat numai pentru coada „În lucru”.
    const payload={currentPage:page,itemsPerPage:1000,type:3};
    if(status!==null)payload.status=status;
    if(day){payload.createdAfter=`${day} 00:00:00`;payload.createdBefore=`${nextDay(day)} 00:00:00`;}
    const data=await emag(market,'/order/read',payload);
    const rows=Array.isArray(data.results)?data.results:[];all.push(...rows);
    if(rows.length<1000)break;page++;
  }
  return all;
}
async function readAllMarkets(day=null,status=null){
  const markets=[];let lines=[];
  for(const market of Object.keys(EMAG_MARKETS)){
    try{const orders=await readOrders(market,day,status),marketLines=orders.flatMap(x=>orderLines(x,market)).filter(x=>x.comandaId&&x.titluExtern);markets.push({market,orders:orders.length,lines:marketLines.length,ok:true});lines=lines.concat(marketLines);}
    catch(e){markets.push({market,orders:0,lines:0,ok:false,error:e.message||'Eroare necunoscută'});}
  }
  if(!markets.some(x=>x.ok))throw new Error(markets.map(x=>`${x.market}: ${x.error}`).join(' · '));
  return{markets,lines};
}
// Ofertele active sunt citite separat de comenzi. eMAG trimite în mod normal `status: 1`; păstrăm
// și formele text pentru compatibilitate cu răspunsurile diferite RO/BG/HU. Un status necunoscut nu
// este presupus activ — scopul acestui apel este explicit să nu aducă listări inactive.
function activeOffer(offer){
  const value=offer?.status??offer?.offer_status??offer?.offerStatus??offer?.active??offer?.is_active;
  const text=String(value??'').trim().toLowerCase();
  return text==='1'||text==='true'||text==='active'||text==='activ'||text==='published'||text==='publicat';
}
function offerLine(offer,market){
  const product=offer?.product||offer?.details||{};
  return{
    titluExtern:String(offer?.name||offer?.validation_name||offer?.product_name||product?.name||''),
    pnk:String(offer?.part_number_key||offer?.part_number||offer?.pnk||product?.part_number_key||''),
    codProdus:String(offer?.vendor_ext_id||offer?.ext_id||offer?.product_id||''),
    stocExtern:num(offer?.stock??offer?.quantity??offer?.available_stock),
    tara:market
  };
}
async function readActiveOffers(market){
  const all=[];
  for(let page=1;page<=20;page++){
    const data=await emag(market,'/product_offer/read',{currentPage:page,itemsPerPage:1000});
    const rows=Array.isArray(data.results)?data.results:(Array.isArray(data.offers)?data.offers:[]);
    all.push(...rows);
    if(rows.length<1000)break;
  }
  return all.filter(activeOffer).map(x=>offerLine(x,market)).filter(x=>x.titluExtern);
}
async function readActiveOffersAllMarkets(){
  const markets=[],offers=[];
  for(const market of Object.keys(EMAG_MARKETS)){
    try{const rows=await readActiveOffers(market);markets.push({market,offers:rows.length,ok:true});offers.push(...rows);}
    catch(e){markets.push({market,offers:0,ok:false,error:e.message||'Eroare necunoscută'});}
  }
  if(!markets.some(x=>x.ok))throw new Error(markets.map(x=>`${x.market}: ${x.error}`).join(' · '));
  return{markets,offers};
}
function sender(){
  try{const data=JSON.parse(process.env.EMAG_AWB_SENDER_JSON||'');if(data?.name&&data?.contact&&data?.phone1&&(data?.address_id||data?.locality_id))return data;}catch(e){}
  throw new Error('Lipsește EMAG_AWB_SENDER_JSON în Vercel. Configurează adresa expeditorului înainte de emiterea AWB-urilor.');
}
function receiver(order){
  const c=order.customer||{};
  const street=c.shipping_street||order.shipping_street||order.shipping_address||c.billing_street;
  const localityId=Number(c.shipping_locality_id||order.shipping_locality_id||c.billing_locality_id||0);
  if(!street||!localityId)throw new Error('Comanda eMAG nu conține suficientă adresă pentru AWB. Verifică datele comenzii în Seller Center.');
  return{name:c.name||c.shipping_contact,contact:c.shipping_contact||c.name,phone1:String(c.shipping_phone||c.phone_1||'').replace(/\s/g,''),legal_entity:Number(c.legal_entity)||0,locality_id:localityId,street,zipcode:c.shipping_postal_code||c.billing_postal_code||''};
}

module.exports=async function handler(req,res){
  try{
    if(req.method!=='POST')return res.status(405).json({error:'Folosește POST'});
    const body=bodyOf(req),action=String(body.action||'');
    if(action==='egress-ip'){
      // Diagnostic temporar pentru allowlist eMAG; nu atinge API-ul sau credențialele eMAG.
      const r=await fetch('https://api.ipify.org?format=json',{headers:{accept:'application/json'}}),data=await r.json();
      if(!r.ok||!data?.ip)throw new Error('Nu s-a putut determina IP-ul de ieșire al funcției Vercel.');
      return res.status(200).json({ip:String(data.ip)});
    }
    if(action==='orders'){
      const day=isoDay(body.date);if(!day)return res.status(400).json({error:'Alege o dată validă'});
      const result=await readAllMarkets(day);
      return res.status(200).json({date:day,orders:result.markets.reduce((sum,x)=>sum+x.orders,0),lines:result.lines,markets:result.markets});
    }
    if(action==='orders-in-progress'){
      const result=await readAllMarkets(null,2);
      return res.status(200).json({scope:'in_progress',orders:result.markets.reduce((sum,x)=>sum+x.orders,0),lines:result.lines,markets:result.markets});
    }
    if(action==='offers-active'){
      const result=await readActiveOffersAllMarkets();
      return res.status(200).json({scope:'active_offers',offers:result.offers,markets:result.markets});
    }
    if(action==='awb'){
      const orderId=Number(body.orderId);if(!orderId)return res.status(400).json({error:'Alege o comandă eMAG validă'});
      const data=await emag('RO','/order/read',{id:orderId,currentPage:1,itemsPerPage:1,type:3});
      const order=(data.results||[])[0];if(!order)throw new Error('Comanda nu a fost găsită în eMAG sau nu aparține contului API.');
      const weight=Math.max(.01,num(body.weight)||1),parcelNumber=Math.max(0,Math.floor(num(body.parcelNumber)||1));
      const payload={order_id:orderId,sender:sender(),receiver:receiver(order),is_oversize:body.oversize?1:0,envelope_number:0,parcel_number:parcelNumber,cod:Math.max(0,num(body.cod)),weight,currency:'RON'};
      if(order.details?.locker_id)payload.locker_id=order.details.locker_id;
      const issued=await emag('RO','/awb/save',{data:[payload]});
      return res.status(200).json({orderId:String(orderId),result:issued.results||issued});
    }
    return res.status(400).json({error:'Acțiune eMAG necunoscută'});
  }catch(e){return res.status(500).json({error:e.message||'Eroare integrare eMAG'});}
};
