// Extrage titlu/sursă/dată/text dintr-o pagină de știre, pentru News Intelligence — fetch server-side
// (evită CORS), același schelet de request ca api/product-import.js, dar generic (nu schemă de produs):
// text curățat de script/style/nav/header/footer, trimis apoi la AI pentru enrichment (index.html).
const MAX_HTML_BYTES=3*1024*1024;
const MAX_TEXT_CHARS=12000;

function isPrivateHost(host){
  return host==='localhost'||host.endsWith('.localhost')||host==='0.0.0.0'||host==='::1'||
    /^127\./.test(host)||/^10\./.test(host)||/^192\.168\./.test(host)||
    /^169\.254\./.test(host)||/^172\.(1[6-9]|2\d|3[01])\./.test(host);
}
function decode(s=''){
  return String(s).replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}
function meta(html,key){
  const safe=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  const patterns=[
    new RegExp('<meta[^>]+(?:property|name)=["\']'+safe+'["\'][^>]+content=["\']([^"\']+)["\'][^>]*>','i'),
    new RegExp('<meta[^>]+content=["\']([^"\']+)["\'][^>]+(?:property|name)=["\']'+safe+'["\'][^>]*>','i')
  ];
  for(const p of patterns){const m=html.match(p);if(m)return decode(m[1]);}
  return '';
}
function extractReadableText(html){
  let t=html
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<nav[\s\S]*?<\/nav>/gi,' ')
    .replace(/<header[\s\S]*?<\/header>/gi,' ')
    .replace(/<footer[\s\S]*?<\/footer>/gi,' ')
    .replace(/<aside[\s\S]*?<\/aside>/gi,' ')
    .replace(/<!--[\s\S]*?-->/g,' ');
  // Preferă conținutul din <article> dacă există (de regulă corpul real al știrii, fără meniuri/reclame)
  const articleMatch=t.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if(articleMatch&&articleMatch[1].length>400)t=articleMatch[1];
  t=t.replace(/<\/(p|div|li|h[1-6]|br)>/gi,'\n').replace(/<[^>]+>/g,' ');
  t=decode(t).replace(/[ \t]+/g,' ').replace(/\n{3,}/g,'\n\n').trim();
  return t.slice(0,MAX_TEXT_CHARS);
}

module.exports=async function handler(req,res){
  if(req.method!=='POST')return res.status(405).json({error:{message:'Metodă nepermisă'}});
  try{
    const url=String(req.body?.url||'').trim(),parsed=new URL(url);
    if(!['http:','https:'].includes(parsed.protocol))throw new Error('URL invalid');
    if(isPrivateHost(parsed.hostname.toLowerCase()))throw new Error('Adresa nu este permisă');

    const headers={
      'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'accept':'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language':'ro-RO,ro;q=0.9,en;q=0.8'
    };
    const response=await fetch(url,{headers});
    if(!response.ok)throw new Error('Pagina a răspuns cu status '+response.status);
    const html=(await response.text()).slice(0,MAX_HTML_BYTES);

    const titleMatch=html.match(/<title[^>]*>([^<]+)<\/title>/i);
    const title=meta(html,'og:title')||(titleMatch?decode(titleMatch[1]):'');
    const source=meta(html,'og:site_name')||parsed.hostname.replace(/^www\./,'');
    const publishedAt=meta(html,'article:published_time')||meta(html,'og:article:published_time')||meta(html,'datePublished')||'';
    const rawText=extractReadableText(html);
    if(!title&&rawText.length<200)throw new Error('Nu am putut extrage conținut util de pe această pagină');

    return res.status(200).json({title,source,publishedAt,rawText,url});
  }catch(err){
    return res.status(422).json({error:{message:err.message||'Pagina nu a putut fi citită'}});
  }
};
