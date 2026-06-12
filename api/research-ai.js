const UA='Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

async function fetchPage(url){
  const r=await fetch(url,{headers:{'User-Agent':UA,'Accept':'text/html'},signal:AbortSignal.timeout(10000)});
  if(!r.ok)throw new Error('HTTP '+r.status);
  const html=await r.text();
  return html.replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').slice(0,6000);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:'Metodă nepermisă'});
  if(!process.env.OPENAI_API_KEY)return res.status(503).json({error:'OPENAI_API_KEY lipsă'});
  const {productName}=req.body||{};
  if(!productName)return res.status(400).json({error:'productName lipsă'});

  const emagUrl=`https://www.emag.ro/search/${encodeURIComponent(productName)}`;
  const trendyolUrl=`https://www.trendyol.com/sr?q=${encodeURIComponent(productName)}&culture=ro-RO&currency=RON`;

  const [emagText,trendyolText]=await Promise.allSettled([fetchPage(emagUrl),fetchPage(trendyolUrl)]);

  const prompt=`Din textele de mai jos (pagini de search eMAG și Trendyol pentru produsul "${productName}"), extrage:
- prețul minim găsit pe fiecare platformă (în RON)
- numărul aproximativ de oferte/produse similare

Răspunde DOAR cu JSON:
{"emag":{"minPrice":0,"offerCount":0,"link":"${emagUrl}"},"trendyol":{"minPrice":0,"offerCount":0,"link":"${trendyolUrl}"}}

Dacă nu găsești date pentru o platformă, pune null în loc de obiect.

TEXT eMAG:
${emagText.status==='fulfilled'?emagText.value.slice(0,3000):'N/A'}

TEXT Trendyol:
${trendyolText.status==='fulfilled'?trendyolText.value.slice(0,3000):'N/A'}`;

  try{
    const aiRes=await fetch('https://api.openai.com/v1/chat/completions',{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':'Bearer '+process.env.OPENAI_API_KEY},
      body:JSON.stringify({model:'gpt-4o-mini',max_tokens:300,messages:[{role:'user',content:prompt}]})
    });
    const aiData=await aiRes.json();
    const text=aiData.choices?.[0]?.message?.content||'{}';
    const json=JSON.parse(text.replace(/```json|```/g,'').trim());
    res.json(json);
  }catch(e){
    res.status(500).json({error:'Eroare AI: '+e.message});
  }
};
