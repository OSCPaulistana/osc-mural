// Gera o instalador do Windows e publica na página de instalação.
//   npm run instalador
// Precisa de: MURAL_SITE_URL, MURAL_CHAVE_PCS, GH_TOKEN e DATABASE_URL
// (no .env.local; o GH_TOKEN é um token fino só com acesso ao repo do mural).
// O instalador vai para o GitHub Releases (download grátis, fora da franquia do Blob).
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

for (const nome of ['MURAL_SITE_URL', 'MURAL_CHAVE_PCS', 'GH_TOKEN', 'DATABASE_URL']) {
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

// 3. Publica no GitHub Releases: download grátis, fora da franquia de tráfego do Blob.
const REPO = process.env.GH_REPO || 'OSCPaulistana/osc-mural';
const cabecalhosGH = {
  Authorization: `Bearer ${process.env.GH_TOKEN}`,
  Accept: 'application/vnd.github+json',
  'X-GitHub-Api-Version': '2022-11-28',
};
async function gh(caminho, opcoes = {}) {
  const r = await fetch(`https://api.github.com${caminho}`, { ...opcoes, headers: { ...cabecalhosGH, ...opcoes.headers } });
  const corpo = await r.json().catch(() => null);
  if (!r.ok) throw new Error(`GitHub (${r.status}): ${corpo?.message || 'falhou'}`);
  return corpo;
}
const etiqueta = `v${version}`;
const nomeExe = `MuralOSC-Setup-${version}.exe`;
let lancamento;
try {
  lancamento = await gh('/repos/' + REPO + '/releases', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ tag_name: etiqueta, name: `Mural OSC ${version}`, draft: false, prerelease: false }),
  });
} catch (erro) {
  if (!/already_exists|already exists/i.test(erro.message)) throw erro;
  lancamento = await gh('/repos/' + REPO + `/releases/tags/${etiqueta}`);
}
for (const antigo of (lancamento.assets || []).filter((a) => a.name === nomeExe)) {
  await gh('/repos/' + REPO + `/releases/assets/${antigo.id}`, { method: 'DELETE' });
}
console.log(`Enviando ${(tamanho / 1024 / 1024).toFixed(0)} MB para o GitHub Releases...`);
const subida = await fetch(`https://uploads.github.com/repos/${REPO}/releases/${lancamento.id}/assets?name=${encodeURIComponent(nomeExe)}`, {
  method: 'POST',
  headers: { ...cabecalhosGH, 'Content-Type': 'application/octet-stream', 'Content-Length': String(tamanho) },
  body: fs.createReadStream(exe),
  duplex: 'half',
});
const ativo = await subida.json().catch(() => null);
if (!subida.ok || !ativo?.browser_download_url) throw new Error(`GitHub (${subida.status}): ${ativo?.message || 'não enviou o instalador'}`);
const urlDownload = ativo.browser_download_url;

// 4. A página de instalação passa a entregar esta versão
const { consulta, obterPool } = require('../lib/db.js');
await consulta(
  `insert into config (chave, valor) values ('instalador', $1)
   on conflict (chave) do update set valor = excluded.valor, atualizado_em = now()`,
  [{ url: urlDownload, versao: version, tamanho, publicadoEm: new Date().toISOString() }]);
// Preservar versões anteriores permite reverter uma publicação, se necessário.
await obterPool().end();
console.log(`Publicado: versão ${version}. A página ${site} já entrega este instalador.`);
