import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export async function serve(port = 4173) {
  const root = path.resolve('tests/fixtures');
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/health') return res.end('ok');
    const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
    try {
      const data = await readFile(file);
      res.setHeader('Content-Type', ({'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
      if (url.searchParams.has('csp')) res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-src http://localhost:4173 http://127.0.0.1:4173");
      res.end(data);
    } catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise((resolve, reject) => server.once('error', reject).listen(port, '0.0.0.0', resolve));
  return server;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await serve();
  console.log('LumaShift fixtures: http://localhost:4173');
}
