'use strict';
// Servidor local que imita a Vercel: arquivos de public/ com "clean URLs" e /api/* na mesma função.
//   npm run dev   (lê .env.local)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const raiz = path.join(__dirname, '..');
if (fs.existsSync(path.join(raiz, '.env.local'))) process.loadEnvFile(path.join(raiz, '.env.local'));
const { handler } = require('../lib/app');

const PUBLICO = path.join(raiz, 'public');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.svg': 'image/svg+xml' };
const porta = Number(process.env.PORT) || 3000;

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/api/')) return handler(req, res);
  let alvo = path.normalize(path.join(PUBLICO, decodeURIComponent(url.pathname)));
  if (!alvo.startsWith(PUBLICO)) { res.writeHead(404); return res.end(); }
  if (fs.existsSync(alvo) && fs.statSync(alvo).isDirectory()) alvo = path.join(alvo, 'index.html');
  else if (!path.extname(alvo)) alvo += '.html';
  fs.readFile(alvo, (erro, conteudo) => {
    if (erro) { res.writeHead(404); return res.end('Não encontrado'); }
    res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
    res.end(conteudo);
  });
}).listen(porta, () => console.log(`[mural] local em http://localhost:${porta}`));
