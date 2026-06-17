const MAX_HTML=2*1024*1024;

function extractPageData(html,url){
  const d={url,title:'',price:0,rating:0,reviewCount:0,imageCount:0,hasBullets:false,hasSpecs:false,descLength:0,badges:[],seller:'',error:null};

  // Titlu
  const tm=html.match(/<h1[^>]*class="[^"]*page-title[^"]*"[^>]*>([\s\S]*?)<\/h1>/i)
    ||html.match(/<meta[^>]+property="og:title"[^>]+content="([^"]+)"/i)
    ||html.match(/<title>([^|<]+)/i);
  if(tm)d.title=tm[1].replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,200);

  // Preț
  const pp=[
    /data-price-product=["']([\d.]+)["']/,
    /"price"\s*:\s*([\d.]+)/,
    /class="[^"]*product-new-price[^"]*"[^>]*>[^<]*<span[^>]*>([\d,.]+)<\/span>/,
    /"priceValue"\s*:\s*([\d.]+)/,
    /<span[^>]*class="[^"]*price[^"]*"[^>]*>([\d,.]+)\s*(?:RON|lei)/i
  ];
  for(const p of pp){const m=html.match(p);if(m){d.price=parseFloat(m[1].replace(',','.'));if(d.price>0)break;}}

  // Rating
  const rm=html.match(/"ratingValue"\s*:\s*"?([\d.]+)"?/)
    ||html.match(/class="[^"]*average-rating[^"]*"[^>]*>([\d.]+)</i)
    ||html.match(/class="[^"]*rating-value[^"]*"[^>]*>([\d.]+)</i);
  if(rm)d.rating=parseFloat(rm[1]);

  // Recenzii
  const rcm=html.match(/"reviewCount"\s*:\s*"?(\d+)"?/)
    ||html.match(/(\d[\d,.]*)\s*(?:recenzii|recenzie|review)/i)
    ||html.match(/class="[^"]*review-count[^"]*"[^>]*>([\d,. ]+)</i);
  if(rcm)d.reviewCount=parseInt(String(rcm[1]).replace(/[,. ]/g,''))||0;

  // Imagini (număr aproximativ)
  const imgUrls=new Set();
  for(const m of html.matchAll(/"(?:image|imageUrl|bigImage)":\s*"(https?[^"]+)"/gi))imgUrls.add(m[1]);
  for(const m of html.matchAll(/data-(?:zoom-image|large-image|src)=["']([^"']+)["']/gi))imgUrls.add(m[1]);
  d.imageCount=Math.max(imgUrls.size,[...html.matchAll(/class="[^"]*(?:gallery-image|product-img)/gi)].length);

  // Bullets / specificații
  d.hasBullets=html.includes('product-bullets')||html.includes('bullet-point')||(html.match(/<li[^>]*>/g)||[]).length>5;
  d.hasSpecs=html.includes('product-specifications')||html.includes('specifications-table')||html.includes('tech-specs')||html.includes('caracteristici-produs');

  // Descriere
  const dm=html.match(/class="[^"]*(?:product-description|description-body)[^"]*"[^>]*>([\s\S]{0,8000}?)<\/div>/i);
  if(dm)d.descLength=dm[1].replace(/<[^>]+>/g,' ').trim().length;

  // Badge-uri
  if(/bestseller/i.test(html))d.badges.push('Bestseller');
  if(/recomandat/i.test(html))d.badges.push('Recomandat');
  if(/livrare\s*rapid[aă]/i.test(html))d.badges.push('Livrare rapidă');
  if(/stoc\s*limitat/i.test(html))d.badges.push('Stoc limitat');
  if(/easybox|deschis\s*la\s*livrare/i.test(html))d.badges.push('Plată la livrare');

  // Vânzător
  const sm=html.match(/"seller"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"/i)
    ||html.match(/class="[^"]*seller-name[^"]*"[^>]*>([^<]+)</i);
  if(sm)d.seller=sm[1].trim();

  return d;
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).end();
  const{urls,productName,priceBuy}=req.body||{};
  if(!Array.isArray(urls)||!urls.length)return res.status(400).json({error:'URLs lipsă'});

  const apiKey=process.env.OPENAI_API_KEY;
  const hdrs={
    'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'accept':'text/html,application/xhtml+xml,*/*;q=0.9',
    'accept-language':'ro-RO,ro;q=0.9,en;q=0.8',
    'sec-fetch-dest':'document','sec-fetch-mode':'navigate','sec-fetch-site':'none'
  };

  const competitors=await Promise.all(urls.slice(0,6).map(async url=>{
    try{
      const ctrl=new AbortController();
      const t=setTimeout(()=>ctrl.abort(),12000);
      const r=await fetch(url,{headers:hdrs,signal:ctrl.signal,redirect:'follow'});
      clearTimeout(t);
      if(!r.ok)return{url,error:`HTTP ${r.status}`,title:'',price:0};
      const html=(await r.text()).slice(0,MAX_HTML);
      return extractPageData(html,url);
    }catch(e){return{url,error:e.message,title:'',price:0};}
  }));

  const valid=competitors.filter(c=>!c.error&&(c.title||c.price>0));
  let analysis=null;

  if(apiKey&&valid.length){
    try{
      const rows=valid.map((c,i)=>{
        const parts=[
          `"${c.title.slice(0,100)}"`,
          `${c.price>0?c.price.toFixed(2)+' RON':'preț necunoscut'}`,
          c.rating>0?`★${c.rating}/5 (${c.reviewCount} recenzii)`:'fără rating',
          `${c.imageCount} imagini`,
          c.hasBullets?'cu bullets':'fără bullets',
          c.hasSpecs?'cu specificații':'fără specificații',
          c.descLength>0?`desc ${c.descLength} chars`:'',
          c.badges.length?`badge: ${c.badges.join(', ')}`:'',
          c.seller?`vânzător: ${c.seller}`:''
        ].filter(Boolean);
        return`${i+1}. ${parts.join(' | ')}`;
      }).join('\n');

      const resp=await fetch('https://api.openai.com/v1/responses',{
        method:'POST',
        headers:{'Content-Type':'application/json','Authorization':`Bearer ${apiKey}`},
        body:JSON.stringify({
          model:'gpt-4o-mini',
          input:`Ești expert în optimizare listing eMAG România. Analizează competitorii pentru produsul "${productName||'?'}" (prețul meu de achiziție: ${priceBuy||'?'} RON):\n\n${rows}\n\nRăspunde STRICT cu JSON:\n{"priceMin":<nr>,"priceMax":<nr>,"priceAvg":<nr>,"suggestedPrice":<nr>,"ratingAvg":<nr>,"titleInsights":["<obs1>","<obs2>"],"listingStrengths":["<ce fac bine>"],"opportunities":["<unde poți câștiga>"],"recommendations":["<rec1>","<rec2>","<rec3>"],"summary":"<2 propoziții sinteză>"}`,
          max_output_tokens:900
        })
      });
      if(resp.ok){
        const d=await resp.json();
        const text=d?.output?.[0]?.content?.[0]?.text||'';
        const m=text.match(/\{[\s\S]*\}/);
        if(m)analysis=JSON.parse(m[0]);
      }
    }catch(e){}
  }

  res.json({competitors,valid:valid.length,analysis});
};
