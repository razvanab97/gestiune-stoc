const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';

async function supa(method,path,body){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{
    method,
    headers:{
      'content-type':'application/json',
      'apikey':SUPA_KEY,
      'authorization':'Bearer '+SUPA_KEY,
      'prefer':'return=representation,resolution=merge-duplicates'
    },
    body:body?JSON.stringify(body):undefined
  });
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data={message:text};}
  if(!r.ok){
    const err=new Error(data?.message||data?.error||`Supabase ${r.status}`);
    err.status=r.status;
    err.details=data;
    throw err;
  }
  return data;
}

module.exports=async function handler(req,res){
  try{
    if(req.method==='GET'){
      const key=String(req.query?.key||'').trim();
      if(!key)return res.status(400).json({error:'Lipsește cheia setării'});
      const rows=await supa('GET',`setari_app?key=eq.${encodeURIComponent(key)}&select=key,value`);
      return res.status(200).json({key,value:rows?.[0]?.value||''});
    }
    if(req.method==='POST'){
      const body=typeof req.body==='string'?JSON.parse(req.body||'{}'):(req.body||{});
      const key=String(body.key||'').trim();
      const value=String(body.value??'');
      if(!key)return res.status(400).json({error:'Lipsește cheia setării'});
      const rows=await supa('POST','setari_app?on_conflict=key',{key,value});
      return res.status(200).json({key,value:rows?.[0]?.value??value,row:rows?.[0]||null});
    }
    return res.status(405).json({error:'Metodă nepermisă'});
  }catch(e){
    const details=e.details?JSON.stringify(e.details):e.message;
    return res.status(e.status||500).json({error:e.message||'Eroare setări',details});
  }
};
