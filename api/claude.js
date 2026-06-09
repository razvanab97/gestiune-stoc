const MAX_BODY_BYTES=8*1024*1024;
const WEB_FETCH_TOOL='web_fetch_20260309';
const WEB_SEARCH_TOOL='web_search_20260209';
const DEFAULT_MODEL='claude-sonnet-4-6';

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:{message:'Metodă nepermisă'}});
  if(!process.env.ANTHROPIC_API_KEY)return res.status(503).json({error:{message:'ANTHROPIC_API_KEY nu este configurată în Vercel'}});

  try{
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
    if(Buffer.byteLength(raw)>MAX_BODY_BYTES)return res.status(413).json({error:{message:'Cererea AI este prea mare'}});
    const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!Array.isArray(input?.messages)||!input.messages.length)return res.status(400).json({error:{message:'Lipsesc mesajele pentru Claude'}});

    const body={
      model:process.env.ANTHROPIC_MODEL||DEFAULT_MODEL,
      max_tokens:Math.min(Math.max(Number(input.max_tokens)||400,1),4000),
      messages:input.messages
    };
    if(typeof input.system==='string')body.system=input.system.slice(0,20000);
    if(Array.isArray(input.tools)){
      body.tools=input.tools.flatMap(t=>{
        if(t?.name==='web_fetch'&&String(t?.type||'').startsWith('web_fetch_'))return[{type:WEB_FETCH_TOOL,name:'web_fetch'}];
        if(t?.name==='web_search'&&String(t?.type||'').startsWith('web_search_'))return[{type:WEB_SEARCH_TOOL,name:'web_search'}];
        return[];
      });
    }

    const headers={
      'content-type':'application/json',
      'x-api-key':process.env.ANTHROPIC_API_KEY,
      'anthropic-version':'2023-06-01'
    };
    if(input.anthropic_beta)headers['anthropic-beta']=String(input.anthropic_beta);

    const response=await fetch('https://api.anthropic.com/v1/messages',{method:'POST',headers,body:JSON.stringify(body)});
    const data=await response.json();
    return res.status(response.status).json(data);
  }catch(err){
    console.error('Claude proxy error:',err);
    return res.status(500).json({error:{message:'Eroare internă la conectarea cu Claude'}});
  }
};
