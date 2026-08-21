const MAX_BODY_BYTES=10*1024*1024;
// Selectare model pe 2 niveluri (al 3-lea, "listing", trăiește separat în api/listing-builder.js,
// care nu trece prin acest proxy) — vezi Environment Variables în Vercel:
//   OPENAI_MODEL          -> gpt-5.6-luna  (implicit: traduceri, reformulări, clasificări simple)
//   OPENAI_MODEL_ANALYSIS -> gpt-5.6-terra (analiză imagini, PDF-uri, research, extrageri complexe)
// Fallback în lanț: analysis -> OPENAI_MODEL_ANALYSIS, apoi OPENAI_MODEL, apoi implicitul din cod.
function simpleModel(){return process.env.OPENAI_MODEL||'gpt-5.6-luna';}
function analysisModel(){return process.env.OPENAI_MODEL_ANALYSIS||simpleModel();}
function modelForTier(tier){return tier==='analysis'?analysisModel():simpleModel();}

function contentParts(content){
  if(typeof content==='string')return[{type:'input_text',text:content}];
  if(!Array.isArray(content))return[{type:'input_text',text:String(content||'')}];
  return content.flatMap(part=>{
    if(part?.type==='text')return[{type:'input_text',text:String(part.text||'')}];
    if(part?.type==='image'){
      const src=part.source||{},image_url=src.type==='base64'?`data:${src.media_type||'image/jpeg'};base64,${src.data||''}`:src.url;
      return image_url?[{type:'input_image',image_url}]:[];
    }
    if(part?.type==='document'){
      const src=part.source||{},file_data=src.type==='base64'?`data:${src.media_type||'application/pdf'};base64,${src.data||''}`:src.url;
      return file_data?[{type:'input_file',filename:'factura.pdf',file_data}]:[];
    }
    return[];
  });
}

function outputText(data){
  if(typeof data?.output_text==='string')return data.output_text;
  return(data?.output||[]).flatMap(item=>item?.content||[]).filter(x=>x?.type==='output_text').map(x=>x.text||'').join('\n');
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:{message:'Metodă nepermisă'}});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:{message:'OPENAI_API_KEY nu este configurată în Vercel'}});
  try{
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
    if(Buffer.byteLength(raw)>MAX_BODY_BYTES)return res.status(413).json({error:{message:'Cererea AI este prea mare'}});
    const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!Array.isArray(input?.messages)||!input.messages.length)return res.status(400).json({error:{message:'Lipsesc mesajele pentru OpenAI'}});
    const body={
      model:modelForTier(input.tier),
      // reasoning:effort 'low' — bug real găsit (23.08.2026): modelele gpt-5.6-* fac raționament intern
      // înainte de răspuns (niveluri none/low/medium/high/xhigh/max); fără să setăm explicit unul JOS,
      // modelul poate consuma TOT bugetul de tokeni pe raționament, fără să mai apuce să scrie vreun
      // text vizibil — output_text iese gol, callAI() întoarce '', iar orice apelant care așteaptă JSON
      // (ex. citirea unui screenshot Trendyol/furnizor) eșuează cu „Răspuns invalid de la AI", deși
      // cererea a reușit tehnic (HTTP 200). Același fix era deja aplicat DOAR în api/listing-builder.js
      // (endpoint separat) — lipsea aici, în proxy-ul folosit de callAI() pentru restul aplicației
      // (sugestie categorie, citire poze, PDF facturi, Visual DNA galerie etc.). Task de redactare
      // simplă (citește o poză/extrage JSON), nu de logică multi-pas — un nivel mai mare adaugă doar
      // latență și risc de răspuns gol, fără beneficiu real.
      reasoning:{effort:'low'},
      // Plafon ridicat de la 4000 la 8000 — bug real găsit: planul Galeriei AI produs (8 cadre, câmpuri
      // multiple per cadru) cerea deja exact 4000 (cel mai mare dintre toți apelanții din index.html)
      // și tot ieșea trunchiat ("JSON Parse error: Expected ']'"), pentru că răspunsul complet depășea
      // plafonul vechi. Restul apelanților cer mult sub 4000, deci nu sunt afectați de ridicarea limitei.
      max_output_tokens:Math.min(Math.max(Number(input.max_tokens)||400,1),8000),
      input:input.messages.map(m=>({role:m.role==='assistant'?'assistant':'user',content:contentParts(m.content)}))
    };
    if(typeof input.system==='string'&&input.system.trim())body.instructions=input.system.slice(0,20000);
    const response=await fetch('https://api.openai.com/v1/responses',{method:'POST',headers:{'content-type':'application/json','authorization':'Bearer '+process.env.OPENAI_API_KEY},body:JSON.stringify(body)});
    const data=await response.json();
    if(!response.ok)return res.status(response.status).json(data);
    return res.status(200).json({content:[{type:'text',text:outputText(data)}],model:data.model,id:data.id});
  }catch(err){
    console.error('OpenAI proxy error:',err);
    return res.status(500).json({error:{message:'Eroare internă la conectarea cu OpenAI'}});
  }
};
