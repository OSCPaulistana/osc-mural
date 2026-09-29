// Build do site (roda na Vercel antes de publicar):
//  - copia para public/icones só os ícones Lucide usados;
//  - empacota o cliente de upload do Vercel Blob para o admin.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const require = createRequire(import.meta.url);
const raiz = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { TODOS } = require('../lib/icones.js');

const origem = path.join(raiz, 'node_modules', 'lucide-static', 'icons');
const destino = path.join(raiz, 'public', 'icones');
fs.rmSync(destino, { recursive: true, force: true });
fs.mkdirSync(destino, { recursive: true });
for (const nome of TODOS) fs.copyFileSync(path.join(origem, `${nome}.svg`), path.join(destino, `${nome}.svg`));
console.log(`ícones: ${TODOS.length}`);

await build({
  stdin: { contents: "import { upload } from '@vercel/blob/client'; window.muralUpload = upload;", resolveDir: raiz },
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['chrome110', 'edge110'],
  outfile: path.join(raiz, 'public', 'assets', 'upload.js'),
  logLevel: 'warning',
});
console.log('cliente de upload: public/assets/upload.js');
