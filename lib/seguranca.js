'use strict';
// Administradores (e-mail e senha), sessão em cookie assinado, chave dos PCs e
// limite de tentativas de senha.
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { consulta } = require('./db');
const { ErroEntrada } = require('./validar');

const scrypt = promisify(crypto.scrypt);
const SESSAO_S = 8 * 3600;
const NOME_COOKIE = 'mural_sessao';

function exigirVariavel(nome) {
  const v = process.env[nome];
  if (!v || v.length < 12) throw new Error(`A variável ${nome} não está configurada (mínimo de 12 caracteres).`);
  return v;
}

function iguais(a, b) {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
}

function assinar(texto) {
  return crypto.createHmac('sha256', exigirVariavel('MURAL_SEGREDO')).update(texto).digest('base64url');
}

// ---------- Senhas ----------

async function gerarHash(senha) {
  const sal = crypto.randomBytes(16);
  const hash = await scrypt(senha, sal, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$${sal.toString('base64url')}$${hash.toString('base64url')}`;
}

async function senhaConfere(senha, guardado) {
  const [tipo, sal, hash] = String(guardado || '').split('$');
  if (tipo !== 'scrypt' || !sal || !hash) return false;
  const calculado = await scrypt(String(senha), Buffer.from(sal, 'base64url'), 64, { N: 16384, r: 8, p: 1 });
  const esperado = Buffer.from(hash, 'base64url');
  return esperado.length === calculado.length && crypto.timingSafeEqual(esperado, calculado);
}

function validarSenhaNova(senha) {
  if (typeof senha !== 'string' || senha.length < 10) throw new ErroEntrada('A senha precisa ter pelo menos 10 caracteres.');
  if (senha.length > 200) throw new ErroEntrada('Senha longa demais.');
  return senha;
}

// ---------- Sessão ----------

function cookieDaSessao(adminId) {
  const expira = Math.floor(Date.now() / 1000) + SESSAO_S;
  const valor = `${adminId}.${expira}.${assinar(`admin.${adminId}.${expira}`)}`;
  return `${NOME_COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSAO_S}`;
}

function cookieDeSaida() {
  return `${NOME_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

/** Devolve o administrador da sessão (ativo no banco) ou null. */
async function adminDaSessao(req) {
  const m = new RegExp(`(?:^|;\\s*)${NOME_COOKIE}=([0-9a-f-]{36})\\.(\\d+)\\.([A-Za-z0-9_-]+)`).exec(req.headers.cookie || '');
  if (!m || Number(m[2]) < Date.now() / 1000 || !iguais(m[3], assinar(`admin.${m[1]}.${m[2]}`))) return null;
  if (req._admin !== undefined) return req._admin;
  const [admin] = await consulta('select id, nome, email from admins where id = $1 and ativo', [m[1]]);
  req._admin = admin || null;
  return req._admin;
}

/** O app instalado manda a chave dos PCs em todo pedido ao site. */
function ehPc(req) {
  const chave = req.headers['x-mural-chave'];
  return typeof chave === 'string' && chave.length > 0 && iguais(chave, exigirVariavel('MURAL_CHAVE_PCS'));
}

function ipDe(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim().slice(0, 64);
}

// ---------- Login com limite de tentativas ----------

async function exigirTentativasDisponiveis(req) {
  const [{ n }] = await consulta(
    "select count(*)::int as n from tentativas_login where ip = $1 and em > now() - interval '15 minutes'", [ipDe(req)]);
  if (n >= 10) throw new ErroEntrada('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
}

async function registrarFalha(req) {
  await consulta('insert into tentativas_login (ip) values ($1)', [ipDe(req)]);
  await consulta("delete from tentativas_login where em < now() - interval '1 day'");
}

/** Confere e-mail e senha. Até 10 erros por IP a cada 15 minutos. */
async function entrar(req, email, senha) {
  await exigirTentativasDisponiveis(req);
  const [admin] = await consulta('select id, nome, email, senha_hash from admins where lower(email) = lower($1) and ativo', [String(email || '').trim()]);
  if (admin && typeof senha === 'string' && (await senhaConfere(senha, admin.senha_hash))) {
    await consulta('update admins set ultimo_acesso = now() where id = $1', [admin.id]);
    return { id: admin.id, nome: admin.nome, email: admin.email };
  }
  await registrarFalha(req);
  return null;
}

/** A senha de instalação (variável MURAL_SENHA_ADMIN) só serve para criar o primeiro administrador. */
async function conferirSenhaMestra(req, senha) {
  await exigirTentativasDisponiveis(req);
  if (typeof senha === 'string' && senha && iguais(senha, exigirVariavel('MURAL_SENHA_ADMIN'))) return true;
  await registrarFalha(req);
  return false;
}

module.exports = {
  cookieDaSessao, cookieDeSaida, adminDaSessao, ehPc, entrar, conferirSenhaMestra,
  gerarHash, senhaConfere, validarSenhaNova,
};
