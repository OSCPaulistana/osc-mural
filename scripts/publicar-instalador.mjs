// Gera o instalador do Windows e publica na página de instalação.
//   npm run instalador
// Precisa de: MURAL_SITE_URL, MURAL_CHAVE_PCS, BLOB_READ_WRITE_TOKEN e DATABASE_URL
// (no .env.local, que sai de "vercel env pull .env.local --environment production").
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const desktop = path.join(raiz, 'desktop');
if (fs.existsSync(path.join(raiz, '.env.local'))) process.loadEnvFile(path.join(raiz, '.env.local'));

for (const nome of ['MURAL_SITE_URL', 'MURAL_CHAVE_PCS', 'BLOB_READ_WRITE_TOKEN', 'DATABASE_URL']) {
  if (!process.env[nome]) {
    console.error(`Falta a variável ${nome}.`);
    process.exit(1);
  }
}

const site = process.env.MURAL_SITE_URL.replace(/\/$/, '');
const { version } = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));

// 1. O instalador leva o endereço do site e a chave dos PCs (config.json não vai para o Git).
fs.writeFileSync(path.join(desktop, 'config.json'), JSON.stringify({ url: site, chave: process.env.MURAL_CHAVE_PCS }, null, 2));

// 2. Empacota
console.log(`Gerando o instalador ${version}...`);
execSync('npm run dist', { cwd: desktop, stdio: 'inherit' });
const exe = path.join(desktop, 'dist', `MuralOSC-Setup-${version}.exe`);
const tamanho = fs.statSync(exe).size;

// 3. Envia para o Vercel Blob
console.log(`Enviando ${(tamanho / 1024 / 1024).toFixed(0)} MB para o Vercel Blob...`);
const { put } = await import('@vercel/blob');
const blob = await put(`instalador/MuralOSC-Setup-${version}.exe`, fs.createReadStream(exe), {
  access: 'public',
  addRandomSuffix: true,
  multipart: true,
  contentType: 'application/octet-stream',
  token: process.env.BLOB_READ_WRITE_TOKEN,
});

// 4. A página de instalação passa a entregar esta versão
const { consulta, obterPool } = require('../lib/db.js');
await consulta(
  `insert into config (chave, valor) values ('instalador', $1)
   on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`,
  [{ url: blob.downloadUrl, versao: version, tamanho, publicadoEm: new Date().toISOString() }]);
await obterPool().end();
console.log(`Publicado: versão ${version}. A página ${site} já entrega este instalador.`);
