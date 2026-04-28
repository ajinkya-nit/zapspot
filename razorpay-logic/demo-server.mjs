import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';

const rootDir = resolve(process.cwd());
const port = Number(process.env.RZP_PORT || 4173);
const host = '127.0.0.1';

const contentTypes = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
]);

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url || '/', `http://${host}:${port}`);
  const pathName = requestUrl.pathname === '/' ? '/razorpay-checkout-demo.html' : requestUrl.pathname;
  const filePath = resolve(join(rootDir, `.${pathName}`));

  if (!filePath.startsWith(rootDir)) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Forbidden');
    return;
  }

  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }

  response.writeHead(200, {
    'Content-Type': contentTypes.get(extname(filePath)) || 'application/octet-stream',
    'Cache-Control': 'no-store',
  });

  createReadStream(filePath).pipe(response);
});

server.listen(port, host, () => {
  console.log(`Serving ${rootDir} at http://${host}:${port}`);
  console.log('Open /razorpay-checkout-demo.html to run the Razorpay test checkout.');
});
