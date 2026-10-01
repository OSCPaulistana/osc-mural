// Gera o instalador do Windows e publica na página de instalação.
//   npm run instalador
// Precisa de: MURAL_SITE_URL, MURAL_CHAVE_PCS, BLOB_READ_WRITE_TOKEN e DATABASE_URL
// (no .env.local, que sai de "vercel env pull .env.local --environment production").
import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { conferirAcesso } from './conferir-desktop.mjs';

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

// Não empacotar placeholders de "vercel env pull" nem chaves que o site rejeita.
const site = await conferirAcesso(process.env.MURAL_SITE_URL, process.env.MURAL_CHAVE_PCS);
const { version } = JSON.parse(fs.readFileSync(path.join(desktop, 'package.json'), 'utf8'));

// 1. O instalador leva o endereço do site e a chave dos PCs (config.json não vai para o Git).
fs.writeFileSync(path.join(desktop, 'config.json'), JSON.stringify({ url: site, chave: process.env.MURAL_CHAVE_PCS }, null, 2));

// 2. Empacota
console.log(`Gerando o instalador ${version}...`);
execSync('npm run dist', { cwd: desktop, stdio: 'inherit' });
const exe = path.join(desktop, 'dist', `MuralOSC-Setup-${version}.exe`);
const tamanho = fs.statSync(exe).size;
const asar = require('../desktop/node_modules/@electron/asar');
const pacote = path.join(desktop, 'dist', 'win-unpacked', 'resources', 'app.asar');
const embutido = JSON.parse(asar.extractFile(pacote, 'config.json'));
if (embutido.url !== site || embutido.chave !== process.env.MURAL_CHAVE_PCS) {
  throw new Error('A configuração empacotada não corresponde à configuração validada.');
}
// Koffi carrega JS de src/koffi em produção: excluir src inteiro quebra a
// fixação no desktop, embora o código fora do ASAR funcione normalmente.
asar.extractFile(pacote, path.join('node_modules', 'koffi', 'src', 'koffi', 'index.cjs'));
if (process.env.MURAL_TESTAR_INSTALADOR === '1') {
  console.log('Testando renderer e Win+D com o código empacotado...');
  const processo = spawnSync(path.join(desktop, 'node_modules', 'electron', 'dist', 'electron.exe'),
    ['tests/smoke.cjs', '--packed'], { cwd: desktop, stdio: 'inherit', timeout: 45_000 });
  if (processo.status !== 0) throw new Error('O teste do app empacotado falhou. Nada foi publicado.');
  const teste = JSON.parse(fs.readFileSync(path.join(desktop, 'dist', 'smoke-result.json')));
  if (!teste.ok) throw new Error('O teste do app empacotado falhou. Nada foi publicado.');
}

// 3. Envia para um nome estável: o Blob não acrescenta um sufixo aleatório
// ao nome que aparece para o colaborador ao baixar.
console.log(`Enviando ${(tamanho / 1024 / 1024).toFixed(0)} MB para o Vercel Blob...`);
const { put } = await import('@vercel/blob');
const blob = await put(`instalador/MuralOSC-Setup-${version}.exe`, fs.createReadStream(exe), {
  access: 'public',
  addRandomSuffix: false,
  allowOverwrite: true,
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
// Preservar versões anteriores permite reverter uma publicação, se necessário.
await obterPool().end();
console.log(`Publicado: versão ${version}. A página ${site} já entrega este instalador.`);
