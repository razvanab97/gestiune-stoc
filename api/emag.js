const EMAG_BASE=(process.env.EMAG_API_BASE_URL||'https://marketplace-api.emag.ro/api-3').replace(/\/$/,'');

function bodyOf(req){return typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});}
function isoDay(value){return /^\d{4}-\d{2}-\d{2}$/.test(String(value||''))?String(value):null;}
function nextDay(day){const d=new Date(day+'T00:00:00Z');d.setUTCDate(d.getUTCDate()+1);return d.toISOString().slice(0,10);}
function num(value){const n=Number(value);return Number.isFinite(n)?n:0;}

function credentials(){
  const user=process.env.EMAG_API_USERNAME,pass=process.env.EMAG_API_PASSWORD;
  if(!user||!pass)throw new Error('Integrarea eMAG nu este configurată încă în Vercel. Adaugă EMAG_API_USERNAME și EMAG_API_PASSWORD.');
  return 'Basic '+Buffer.from(`${user}:${pass}`).toString('base64');
}
async function emag(path,payload){
  const r=await fetch(EMAG_BASE+path,{method:'POST',headers:{'content-type':'application/json',authorization:credentials()},body:JSON.stringify(payload)});
  const text=await r.text();let data;
  try{data=text?JSON.parse(text):{};}catch(e){data={message:text};}
  if(!r.ok||data?.isError)throw new Error(data?.messages?.map(x=>x.message||x).join('; ')||data?.message||`eMAG API ${r.status}`);
  return data;
}
function orderLines(order){
  const customer=order.customer||{};
  const products=Array.isArray(order.products)?order.products:[];
  const vatRate=num(order.vat_percentage||order.vat||21)>1?num(order.vat_percentage||order.vat||21)/100:num(order.vat_percentage||order.vat||.21);
  return products.filter(p=>num(p.status||1)!==0&&num(p.quantity)>0).map(p=>{
    const qty=num(p.quantity),priceExVat=num(p.sale_price),currency=String(p.currency||order.currency||'RON').toUpperCase();
    return{
      comandaId:String(order.id||''),pachetId:String(order.id||''),data:String(order.date||order.created||'').slice(0,10),
      pnk:String(p.part_number||p.part_number_key||p.ext_part_number||''),codProdus:String(p.ext_part_number||p.product_id||''),
      clientNume:String(customer.name||customer.shipping_contact||''),titluExtern:String(p.name||''),cantitate:qty,
      pretFaraTva:priceExVat,pretTotalCuTva:Math.round(priceExVat*qty*(1+vatRate)*100)/100,moneda:currency,
      tara:currency==='HUF'?'HU':currency==='EUR'?'BG':'RO',orderId:String(order.id||'')
    };
  });
}
async function readOrders(day){
  const all=[];let page=1;
  while(page<=10){ // maximum 10.000 comenzi/zi; protecție pentru un apel manual
    const data=await emag('/order/read',{createdAfter:`${day} 00:00:00`,createdBefore:`${nextDay(day)} 00:00:00`,currentPage:page,itemsPerPage:1000,type:3});
    const rows=Array.isArray(data.results)?data.results:[];all.push(...rows);
    if(rows.length<1000)break;page++;
  }
  return all;
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
    if(action==='orders'){
      const day=isoDay(body.date);if(!day)return res.status(400).json({error:'Alege o dată validă'});
      const orders=await readOrders(day),lines=orders.flatMap(orderLines).filter(x=>x.comandaId&&x.titluExtern);
      return res.status(200).json({date:day,orders:orders.length,lines});
    }
    if(action==='awb'){
      const orderId=Number(body.orderId);if(!orderId)return res.status(400).json({error:'Alege o comandă eMAG validă'});
      const data=await emag('/order/read',{id:orderId,currentPage:1,itemsPerPage:1,type:3});
      const order=(data.results||[])[0];if(!order)throw new Error('Comanda nu a fost găsită în eMAG sau nu aparține contului API.');
      const weight=Math.max(.01,num(body.weight)||1),parcelNumber=Math.max(0,Math.floor(num(body.parcelNumber)||1));
      const payload={order_id:orderId,sender:sender(),receiver:receiver(order),is_oversize:body.oversize?1:0,envelope_number:0,parcel_number:parcelNumber,cod:Math.max(0,num(body.cod)),weight,currency:'RON'};
      if(order.details?.locker_id)payload.locker_id=order.details.locker_id;
      const issued=await emag('/awb/save',{data:[payload]});
      return res.status(200).json({orderId:String(orderId),result:issued.results||issued});
    }
    return res.status(400).json({error:'Acțiune eMAG necunoscută'});
  }catch(e){return res.status(500).json({error:e.message||'Eroare integrare eMAG'});}
};
