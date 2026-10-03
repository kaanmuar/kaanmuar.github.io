const http = require('http');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const types = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.ico': 'image/x-icon'
};

function localBase(port) {
  const base = process.env.BASE_URL || ('http://127.0.0.1:' + port);
  let url;
  try { url = new URL(base); } catch (err) {
    throw new Error('BASE_URL is not a URL');
  }
  if (!/^(127\.0\.0\.1|localhost)$/i.test(url.hostname)) {
    throw new Error('This load test only runs against the local static server');
  }
  return { base: url.origin, hostname: url.hostname, port: Number(url.port || port) };
}

function startLoadServer(port) {
  const target = localBase(port);
  const server = http.createServer((req, res) => {
    let rel = '/';
    try {
      rel = decodeURIComponent(new URL(req.url, target.base).pathname);
    } catch (err) {
      res.writeHead(400);
      res.end();
      return;
    }
    if (rel.endsWith('/')) rel += 'index.html';
    const file = path.normalize(path.join(root, rel));
    if (file !== root && !file.startsWith(root + path.sep)) {
      res.writeHead(403);
      res.end();
      return;
    }
    fs.readFile(file, (err, buf) => {
      if (err) {
        res.writeHead(err.code === 'ENOENT' ? 404 : 500);
        res.end();
        return;
      }
      const type = types[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type, 'Cache-Control': 'no-store' });
      res.end(buf);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(target.port, '127.0.0.1', () => resolve({ server, base: target.base, port: target.port }));
  });
}

module.exports = { root, startLoadServer };
