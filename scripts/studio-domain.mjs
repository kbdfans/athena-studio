import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname} from 'node:path';

const origin = 'https://config.kbdfans.com';
const studioFiles = new URL('../public/studio/', import.meta.url);
const mime = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
};

const server = createServer(async (request, response) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Permissions-Policy', 'hid=(self), usb=(self), serial=(self)');
  response.setHeader('Cache-Control', 'no-cache');
  try {
    const {pathname} = new URL(request.url, origin);
    if (pathname === '/studio/api/feedback' && request.method === 'POST') {
      response.setHeader('Cache-Control', 'no-store');
      if (request.headers.origin !== origin) {
        response.writeHead(403).end();
        return;
      }
      const upstream = await fetch('https://kbd.cool/studio/api/feedback', {
        method: 'POST',
        headers: {origin: 'https://v.kbd.cool', 'content-type': request.headers['content-type'] || ''},
        body: request,
        duplex: 'half',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
      });
      const body = await upstream.text();
      response.writeHead(upstream.status, {'Content-Type': 'application/json; charset=utf-8'}).end(body);
      return;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      response.writeHead(405, {Allow: 'GET, HEAD'}).end();
      return;
    }

    const file = ['/', '/studio', '/studio/', '/studio-v2.html'].includes(pathname)
      ? 'index.html' : pathname.match(/^\/studio\/((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]+\.[A-Za-z0-9]+)$/)?.[1];
    if (!file || file === 'inbox.html' || file.startsWith('feedback/')) {
      response.writeHead(404).end();
      return;
    }
    const bytes = await readFile(new URL(file, studioFiles));
    response.writeHead(200, {
      'Content-Type': mime[extname(file)] || 'application/octet-stream',
      'Content-Length': bytes.length,
    });
    response.end(request.method === 'HEAD' ? undefined : bytes);
  } catch (error) {
    response.writeHead(error.code === 'ENOENT' ? 404 : 502).end();
  }
});
server.listen(Number(process.env.STUDIO_DOMAIN_PORT || 3001), '0.0.0.0');
