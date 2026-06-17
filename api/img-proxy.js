// Proxy imagini — bypass hotlink protection prin setarea Referer corect
// Securitate: no private IPs, max 8MB, content-type image only

const MAX_SIZE=8*1024*1024;

function isPrivateHost(h){
  return h==='localhost'||h.endsWith('.localhost')||h==='0.0.0.0'||h==='::1'
    ||/^127\./.test(h)||/^10\./.test(h)||/^192\.168\./.test(h)
    ||/^172\.(1[6-9]|2\d|3[01])\./.test(h)||/^169\.254\./.test(h);
}

module.exports=async function handler(req,res){
  if(req.method==='OPTIONS'){
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('Access-Control-Allow-Methods','GET');
    return res.status(204).end();
  }
  if(req.method!=='GET')return res.status(405).end('Metodă nepermisă');

  const url=String(req.query?.url||'').trim();
  if(!url)return res.status(400).end('URL lipsă');

  let parsed;
  try{parsed=new URL(url);}catch{return res.status(400).end('URL invalid');}
  if(!['http:','https:'].includes(parsed.protocol))return res.status(400).end('Protocol nepermis');
  if(isPrivateHost(parsed.hostname.toLowerCase()))return res.status(400).end('Host privat nepermis');

  const referer=`${parsed.protocol}//${parsed.hostname}/`;
  const ctrl=new AbortController();
  const t=setTimeout(()=>ctrl.abort(),10000);

  try{
    const r=await fetch(url,{
      headers:{
        'user-agent':'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'accept':'image/avif,image/webp,image/png,image/jpeg,image/gif,*/*;q=0.8',
        'accept-language':'ro-RO,ro;q=0.9,en;q=0.8',
        'referer':referer,
        'sec-fetch-dest':'image',
        'sec-fetch-mode':'no-cors',
        'sec-fetch-site':'cross-site',
      },
      signal:ctrl.signal,
      redirect:'follow'
    });
    clearTimeout(t);

    if(!r.ok)return res.status(r.status).end('Sursa a returnat HTTP '+r.status);

    const ct=r.headers.get('content-type')||'';
    if(!ct.startsWith('image/'))return res.status(415).end('Nu e o imagine ('+ct+')');

    const buf=await r.arrayBuffer();
    if(buf.byteLength>MAX_SIZE)return res.status(413).end('Imagine prea mare (max 8MB)');

    const filename=parsed.pathname.split('/').pop()||'imagine.jpg';
    const isDownload=req.query?.download==='1';

    res.setHeader('Content-Type',ct);
    res.setHeader('Content-Length',buf.byteLength);
    res.setHeader('Content-Disposition',isDownload?`attachment; filename="${filename}"`:'inline');
    res.setHeader('Cache-Control','public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Access-Control-Allow-Origin','*');
    res.setHeader('X-Proxy-Source',parsed.hostname);
    return res.send(Buffer.from(buf));
  }catch(e){
    clearTimeout(t);
    return res.status(502).end('Eroare proxy: '+e.message);
  }
};
