const MAX_HTML=2*1024*1024,MAX_LINKS=20;
const VAT=0.21;
const MIN_PRICE_ASSUMPTIONS='TVA 21%, comision marketplace 20%, costuri fixe estimate 23 RON';

function n(v){return Number.isFinite(Number(v))?Number(v):0;}
function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||
    /^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||
    /^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
function minSellFromBuy(priceBuy){
  const buy=n(priceBuy);
  if(buy<=0)return 0;
  const buyNet=buy/(1+VAT),commission=.20,fixed=23;
  let lo=0,hi=Math.max(buy*3,100);
  const profit=gross=>{
    const revenue=gross/(1+VAT);
    const commissionNet=gross*commission/(1+VAT);
    const grossProfit=revenue-buyNet-commissionNet-fixed;
    const tax=Math.max(0,grossProfit)*.16;
    return grossProfit-tax;
  };
  while(profit(hi)<0)hi*=1.5;
  for(let i=0;i<70;i++){
    const mid=(lo+hi)/2;
    if(profit(mid)>=0)hi=mid;else lo=mid;
  }
  return Math.round(hi*100)/100;
}
function extractPnk(url){
  const m=String(url||'').match(/\/pd\/([A-Z0-9]+)\/?/i);
  return m?m[1].toUpperCase():'';
}

function extractPageData(html,url){
  const d={url,pnk:extractPnk(url),title:'',price:0,rating:0,reviewCount:0,imageCount:0,hasBullets:false,hasSpecs:false,descLength:0,badges:[],seller:'',error:null};

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

  const competitors=await Promise.all(urls.slice(0,MAX_LINKS).map(async url=>{
    try{
      const parsed=new URL(url);
      if(!['http:','https:'].includes(parsed.protocol)||isPrivateHost(parsed.hostname.toLowerCase()))return{url,pnk:extractPnk(url),error:'URL nepermis',title:'',price:0};
      const ctrl=new AbortController();
      const t=setTimeout(()=>ctrl.abort(),12000);
      const r=await fetch(url,{headers:hdrs,signal:ctrl.signal,redirect:'follow'});
      clearTimeout(t);
      if(!r.ok)return{url,pnk:extractPnk(url),error:`HTTP ${r.status}`,title:'',price:0};
      const html=(await r.text()).slice(0,MAX_HTML);
      return extractPageData(html,url);
    }catch(e){return{url,pnk:extractPnk(url),error:e.message,title:'',price:0};}
  }));

  const valid=competitors.filter(c=>!c.error&&(c.title||c.price>0));
  let analysis=null;
  const minSellPrice=minSellFromBuy(priceBuy);
  const prices=valid.map(c=>c.price).filter(v=>v>0).sort((a,b)=>a-b);
  const avg=prices.length?prices.reduce((s,x)=>s+x,0)/prices.length:0;
  const ratingVals=valid.map(c=>c.rating).filter(v=>v>0);
  const ratingAvg=ratingVals.length?ratingVals.reduce((s,x)=>s+x,0)/ratingVals.length:0;
  const reviewSum=valid.reduce((s,c)=>s+(c.reviewCount||0),0);
  const demandScore=Math.max(0,Math.min(100,Math.round(Math.log10(reviewSum+1)*28+(ratingAvg>=4.4?18:ratingAvg>=4?10:0)+valid.filter(c=>c.badges?.length).length*5)));
  const competitionScore=Math.max(0,Math.min(100,Math.round(valid.length*12+(prices.length>2?12:0)+valid.filter(c=>c.imageCount>=5&&c.hasSpecs).length*12)));
  const suggestedPrice=prices.length?Math.round((prices[Math.floor(prices.length/2)]||avg)*100)/100:0;
  const maxBuyPrice=suggestedPrice>0?Math.round((suggestedPrice/1.21*0.52)*100)/100:0;
  const pricePressure=minSellPrice&&suggestedPrice?Math.min(20,Math.max(-25,(suggestedPrice-minSellPrice)/Math.max(minSellPrice,1)*55)):8;
  const opportunityScore=Math.max(0,Math.min(100,Math.round(demandScore*.55+(100-competitionScore)*.25+pricePressure+(priceBuy&&maxBuyPrice?Math.min(12,Math.max(-8,(maxBuyPrice-priceBuy)/Math.max(priceBuy,1)*18)):0))));
  valid.forEach(c=>{
    c.priceGapToMin=c.price>0&&minSellPrice>0?Math.round((c.price-minSellPrice)*100)/100:0;
    c.priceVsMin=c.price>0&&minSellPrice>0?(c.price>=minSellPrice?'peste prag':'sub prag'):'necunoscut';
  });
  const fallbackAnalysis={
    demandScore,competitionScore,opportunityScore,
    verdict:opportunityScore>=75?'Testează produsul - oportunitate bună':opportunityScore>=55?'Testează prudent 5-10 buc':opportunityScore>=35?'Intră doar cu preț foarte bun':'Evită momentan',
    productName:productName||'',priceBuy:n(priceBuy),minSellPrice,minSellAssumptions:MIN_PRICE_ASSUMPTIONS,
    priceMin:prices[0]||0,priceMax:prices[prices.length-1]||0,priceAvg:avg,suggestedPrice,ratingAvg,maxBuyPrice,
    returnRisk:'mediu',riskNotes:'Estimare automată; verifică manual review-urile negative.',
    positioning:'Poziționare AB HOMES: listare mai completă, poze clare cu dimensiuni și beneficii explicate.',
    opportunities:['Îmbunătățește titlul SEO și pune beneficiile principale în primele cuvinte','Adaugă poze cu dimensiuni, utilizare și detalii de material','Completează specificațiile mai clar decât competitorii'],
    recommendations:['Titlu cu brand AB HOMES + tip produs + dimensiuni/material/culoare','Descriere amplă cu utilizări concrete și avantaje','Preț poziționat în jurul medianei, nu cel mai mic'],
    photoRecommendations:['poză principală curată pe fundal alb','poză cu dimensiuni vizibile','poză de utilizare/lifestyle','poză cu detalii/material','poză cu conținutul pachetului'],
    listingStrengths:valid.slice(0,3).map(c=>`${c.title||'Competitor'}: ${c.price?c.price+' RON':''}${c.reviewCount?' · '+c.reviewCount+' review-uri':''}`),
    bundleIdeas:['set 2 buc / pachet economic dacă prețul e prea competitiv','bundle cu produs complementar din aceeași categorie'],
    toVerify:['review-uri negative recurente','cost real transport/retur','dacă imaginile competitorilor arată același produs'],
    priceGapNotes:minSellPrice&&prices.length?`Pragul minim AB HOMES este ${minSellPrice.toFixed(2)} RON; competitorul median este la ${suggestedPrice.toFixed(2)} RON.`:'',
    summary:`Au fost analizați ${valid.length} competitori pentru ${productName||'produs'}. Cererea pare ${demandScore>=65?'bună':demandScore>=40?'medie':'slabă'}, iar competiția este ${competitionScore>=65?'ridicată':competitionScore>=40?'medie':'redusă'}.${minSellPrice?' Prag minim estimat AB HOMES: '+minSellPrice.toFixed(2)+' RON.':''}`
  };

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
          input:`Ești expert în research produse și optimizare listing eMAG/Trendyol România pentru brandul AB HOMES. Analizează competitorii pentru produsul "${productName||'?'}" (prețul meu de achiziție: ${priceBuy||'?'} RON; preț minim estimat AB HOMES: ${minSellPrice||'?'} RON, ipoteze: ${MIN_PRICE_ASSUMPTIONS}):\n\n${rows}\n\nDă un scorecard clar pentru decizie de cumpărare/listare. Ia explicit în calcul titlul introdus și pragul minim AB HOMES când compari prețurile competitorilor. Răspunde STRICT cu JSON valid:\n{"demandScore":0,"competitionScore":0,"opportunityScore":0,"verdict":"Testează / Evită / Cumpără doar sub X lei","productName":"...","priceBuy":0,"minSellPrice":0,"minSellAssumptions":"...","priceGapNotes":"...","priceMin":0,"priceMax":0,"priceAvg":0,"suggestedPrice":0,"maxBuyPrice":0,"ratingAvg":0,"returnRisk":"scăzut/mediu/ridicat","riskNotes":"...","positioning":"cum să poziționăm AB HOMES","titleInsights":["..."],"listingStrengths":["..."],"opportunities":["..."],"recommendations":["..."],"photoRecommendations":["poză principală","poză dimensiuni","poză funcționalitate"],"bundleIdeas":["..."],"toVerify":["..."],"summary":"2 propoziții sinteză"}`,
          max_output_tokens:1500
        })
      });
      if(resp.ok){
        const d=await resp.json();
        const text=d?.output?.[0]?.content?.[0]?.text||'';
        const m=text.match(/\{[\s\S]*\}/);
        if(m)analysis={...fallbackAnalysis,...JSON.parse(m[0])};
      }
    }catch(e){}
  }

  const finalAnalysis={...fallbackAnalysis,...(analysis||{})};
  finalAnalysis.priceBuy=n(priceBuy);
  finalAnalysis.minSellPrice=minSellPrice;
  finalAnalysis.minSellAssumptions=MIN_PRICE_ASSUMPTIONS;
  if(!finalAnalysis.priceGapNotes&&minSellPrice&&prices.length)finalAnalysis.priceGapNotes=`Pragul minim AB HOMES este ${minSellPrice.toFixed(2)} RON; competitorul median este la ${suggestedPrice.toFixed(2)} RON.`;
  res.json({competitors,valid:valid.length,analysis:finalAnalysis});
};
