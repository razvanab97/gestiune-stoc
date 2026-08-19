// Poze de produs — un singur fișier, ramificat pe metodă HTTP + conținutul body-ului (consolidare
// pentru limita de 12 Serverless Functions pe planul Vercel Hobby — vezi vercel.json):
//   POST cu sourceImageUrl+prompt -> recreează/îmbunătățește o poză existentă cu AI (fundal curat,
//           prezentare profesională de tip e-commerce), PORNIND de la poza reală a produsului (image
//           edit, nu generare din imaginație). Rezultatul se salvează în ai_images.
//   POST cu imageData (base64)    -> upload DIRECT, fără AI — o poză de pe calculatorul utilizatorului
//           (fișier personal), inserată în descriere fără să treacă printr-un link extern.
//   GET  -> servește o imagine deja stocată (generată SAU încărcată manual), ca URL public stabil —
//           necesar ca poza să poată fi folosită direct în exportul XLSX/ghidul eMAG/og:image (care au
//           nevoie de un URL http(s) real, nu de un data: URI).

const SUPA_URL=process.env.SUPABASE_URL||'https://nuvgwytanlgvcffxeahs.supabase.co';
const SUPA_KEY=process.env.SUPABASE_SERVICE_ROLE_KEY||process.env.SUPABASE_ANON_KEY||'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im51dmd3eXRhbmxndmNmZnhlYWhzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk3MDI0OTAsImV4cCI6MjA5NTI3ODQ5MH0.lSy1CUJA9xlVv1isAyfTIxGUAbGMUIS7c3TXQ-5pcEg';
const MAX_SRC_SIZE=8*1024*1024;

function isPrivateHost(h){
  return h==='localhost'||h.endsWith('.localhost')||h==='0.0.0.0'||h==='::1'
    ||/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)
    ||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||/^169\.254\./.test(h);
}

async function supaWrite(method,path,body){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{
    method,
    headers:{'content-type':'application/json','apikey':SUPA_KEY,'authorization':'Bearer '+SUPA_KEY,'prefer':'return=representation'},
    body:body?JSON.stringify(body):undefined
  });
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data={message:text};}
  if(!r.ok){const err=new Error(data?.message||data?.error||`Supabase ${r.status}`);err.status=r.status;err.details=data;throw err;}
  return data;
}
async function supaRead(path){
  const r=await fetch(`${SUPA_URL}/rest/v1/${path}`,{headers:{'apikey':SUPA_KEY,'authorization':'Bearer '+SUPA_KEY}});
  const text=await r.text();
  let data=null;
  try{data=text?JSON.parse(text):null;}catch(e){data=null;}
  if(!r.ok){const err=new Error((data&&(data.message||data.error))||`Supabase ${r.status}`);err.status=r.status;throw err;}
  return data;
}

// Upload direct — fără AI, fără fetch extern. Utilizatorul alege un fișier de pe calculator (deja
// redimensionat/comprimat client-side, vezi resizeImageDataUrl în index.html), noi doar validăm și
// stocăm base64-ul brut, exact ca rezultatul unei generări AI (aceeași tabelă, același URL de servire).
const MAX_UPLOAD_SIZE=6*1024*1024;
async function handleUpload(req,res){
  try{
    const raw=String(req.body?.imageData||'');
    const m=raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if(!m)return res.status(400).json({error:'Format imagine invalid (aștept un data: URI base64)'});
    const mime=m[1],b64=m[2];
    const byteLength=Math.ceil(b64.length*3/4);
    if(byteLength>MAX_UPLOAD_SIZE)return res.status(413).json({error:'Imaginea e prea mare (max 6MB) — încearcă una mai mică sau lasă redimensionarea automată să lucreze'});
    const rows=await supaWrite('POST','ai_images',{image_data:b64,mime});
    const id=rows?.[0]?.id;
    if(!id)throw new Error('Nu am putut salva imaginea încărcată');
    return res.status(200).json({id,url:`/api/ai-image?id=${id}`});
  }catch(e){
    const details=e.details?JSON.stringify(e.details):e.message;
    return res.status(e.status||500).json({error:e.message||'Eroare la încărcarea imaginii',details});
  }
}
async function handleGenerate(req,res){
  if(req.body?.imageData)return handleUpload(req,res);
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY nu este configurată în Vercel'});
  try{
    const sourceUrl=String(req.body?.sourceImageUrl||'').trim();
    const prompt=String(req.body?.prompt||'').trim().slice(0,2000);
    if(!sourceUrl||!prompt)return res.status(400).json({error:'Lipsesc imaginea sursă sau instrucțiunea'});

    let parsed;
    try{parsed=new URL(sourceUrl);}catch(e){return res.status(400).json({error:'URL imagine invalid'});}
    if(!['http:','https:'].includes(parsed.protocol))return res.status(400).json({error:'Protocol nepermis'});
    if(isPrivateHost(parsed.hostname.toLowerCase()))return res.status(400).json({error:'Host privat nepermis'});

    const imgResp=await fetch(sourceUrl,{
      headers:{
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'referer':`${parsed.protocol}//${parsed.hostname}/`
      }
    });
    if(!imgResp.ok)return res.status(422).json({error:'Nu am putut descărca imaginea sursă (HTTP '+imgResp.status+')'});
    const ct=imgResp.headers.get('content-type')||'image/jpeg';
    if(!ct.startsWith('image/'))return res.status(422).json({error:'Sursa nu este o imagine ('+ct+')'});
    const srcBuf=Buffer.from(await imgResp.arrayBuffer());
    if(srcBuf.byteLength>MAX_SRC_SIZE)return res.status(413).json({error:'Imaginea sursă e prea mare (max 8MB)'});

    const form=new FormData();
    form.append('model','gpt-image-1');
    form.append('image',new Blob([srcBuf],{type:ct}),'sursa.'+(ct.split('/')[1]||'jpg'));
    form.append('prompt',prompt);
    form.append('size','1024x1024');
    form.append('n','1');

    const aiResp=await fetch('https://api.openai.com/v1/images/edits',{
      method:'POST',
      headers:{'authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:form
    });
    const aiData=await aiResp.json();
    if(!aiResp.ok)return res.status(aiResp.status===429?429:502).json({error:aiData?.error?.message||'Eroare la generarea imaginii cu AI'});
    const b64=aiData?.data?.[0]?.b64_json;
    if(!b64)return res.status(502).json({error:'Răspuns invalid de la OpenAI (fără imagine)'});

    const rows=await supaWrite('POST','ai_images',{image_data:b64,mime:'image/png'});
    const id=rows?.[0]?.id;
    if(!id)throw new Error('Imaginea a fost generată, dar nu am putut-o salva');
    return res.status(200).json({id,url:`/api/ai-image?id=${id}`});
  }catch(e){
    const details=e.details?JSON.stringify(e.details):e.message;
    return res.status(e.status||500).json({error:e.message||'Eroare la generarea imaginii',details});
  }
}

async function handleServe(req,res){
  const id=Number(req.query?.id);
  if(!id)return res.status(400).end('id lipsă');
  try{
    const rows=await supaRead(`ai_images?id=eq.${id}&select=image_data,mime`);
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
}

module.exports=async function handler(req,res){
  if(req.method==='POST')return handleGenerate(req,res);
  if(req.method==='GET')return handleServe(req,res);
  return res.status(405).json({error:'Metodă nepermisă'});
};
