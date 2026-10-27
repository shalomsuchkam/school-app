// Serves an Expo web export with SPA fallback on :8085. usage: node serve.js <distDir>

const http=require('http'),fs=require('fs'),path=require('path');const dist=process.argv[2];
const types={'.js':'application/javascript','.html':'text/html','.png':'image/png','.ttf':'font/ttf','.json':'application/json','.css':'text/css','.ico':'image/x-icon'};
http.createServer((req,res)=>{let p=path.join(dist,decodeURIComponent(req.url.split('?')[0]));if(!fs.existsSync(p)||fs.statSync(p).isDirectory())p=path.join(dist,'index.html');res.writeHead(200,{'content-type':types[path.extname(p)]||'application/octet-stream'});fs.createReadStream(p).pipe(res);}).listen(8085);
