const MAX_BODY_BYTES=8*1024*1024;
const DEEPSEEK_API_URL='https://api.deepseek.com/v1/chat/completions';
const DEFAULT_MODEL='deepseek-chat';

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:{message:'Metodă nepermisă'}});
  if(!process.env.DEEPSEEK_API_KEY)return res.status(503).json({error:{message:'DEEPSEEK_API_KEY nu este configurată în Vercel'}});

  try{
    const raw=typeof req.body==='string'?req.body:JSON.stringify(req.body||{});
    if(Buffer.byteLength(raw)>MAX_BODY_BYTES)return res.status(413).json({error:{message:'Cererea AI este prea mare'}});
    const input=typeof req.body==='string'?JSON.parse(req.body):req.body;
    if(!Array.isArray(input?.messages)||!input.messages.length)return res.status(400).json({error:{message:'Lipsesc mesajele pentru DeepSeek'}});

    const body={
      model:process.env.DEEPSEEK_MODEL||DEFAULT_MODEL,
      max_tokens:Math.min(Math.max(Number(input.max_tokens)||400,1),4000),
      messages:input.messages,
      temperature:0.1,
      response_format:{type:'json_object'}
    };
    if(typeof input.system==='string')body.messages.unshift({role:'system',content:input.system.slice(0,20000)});

    const response=await fetch(DEEPSEEK_API_URL,{
      method:'POST',
      headers:{
        'content-type':'application/json',
        'authorization':`Bearer ${process.env.DEEPSEEK_API_KEY}`
      },
      body:JSON.stringify(body)
    });
    const data=await response.json();
    
    if(!response.ok){
      console.error('DeepSeek API error:',data);
      return res.status(response.status).json({error:{message:data.error?.message||'Eroare DeepSeek API'}});
    }
    
    // Extract text from response
    const text=data.choices?.[0]?.message?.content||'';
    return res.status(200).json({content:[{type:'text',text}]});
  }catch(err){
    console.error('DeepSeek proxy error:',err);
    return res.status(500).json({error:{message:'Eroare internă la conectarea cu DeepSeek'}});
  }
};
