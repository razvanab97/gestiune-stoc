// Servește o imagine generată cu AI (stocată base64 în ai_images) ca URL public stabil — necesar ca
// pozele recreate de image-generate.js să poată fi folosite direct în exportul XLSX/ghidul eMAG
// (care au nevoie de un URL http(s) real, nu de un data: URI).

const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';

async function supa(path){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{headers:{'apikey':SUPA_KEY,'authorization':'Bearer '+SUPA_KEY}});
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data=null;}
  if(!r.ok){const err=new Error((data&&(data.message||data.error))||`Supabase ${r.status}`);err.status=r.status;throw err;}
  return data;
}

module.exports=async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end('Metodă nepermisă');
  const id=Number(req.query?.id);
  if(!id)return res.status(400).end('id lipsă');
  try{
    const rows=await supa(`ai_images?id=eq.${id}&select=image_data,mime`);
    const row=rows?.[0];
    if(!row)return res.status(404).end('Imagine negăsită');
    const buf=Buffer.from(row.image_data,'base64');
    res.setHeader('Content-Type',row.mime||'image/png');
    res.setHeader('Content-Length',buf.byteLength);
    res.setHeader('Cache-Control','public, max-age=31536000, immutable');
    res.setHeader('Access-Control-Allow-Origin','*');
    return res.send(buf);
  }catch(e){
    return res.status(500).end('Eroare la servirea imaginii: '+(e.message||e));
  }
};
