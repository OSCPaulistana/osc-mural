'use strict';
// Sessão do administrador (cookie assinado, sem estado no servidor), chave dos PCs e
// limite de tentativas de senha.
const crypto = require('node:crypto');
const { consulta } = require('./db');
const { ErroEntrada } = require('./validar');

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

function cookieDaSessao() {
  const expira = Math.floor(Date.now() / 1000) + SESSAO_S;
  const valor = `${expira}.${assinar(`admin.${expira}`)}`;
  return `${NOME_COOKIE}=${valor}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSAO_S}`;
}

function cookieDeSaida() {
  return `${NOME_COOKIE}=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0`;
}

function ehAdmin(req) {
  const m = new RegExp(`(?:^|;\\s*)${NOME_COOKIE}=(\\d+)\\.([A-Za-z0-9_-]+)`).exec(req.headers.cookie || '');
  if (!m) return false;
  if (Number(m[1]) < Date.now() / 1000) return false;
  return iguais(m[2], assinar(`admin.${m[1]}`));
}

/** O app instalado manda a chave dos PCs em todo pedido ao site. */
function ehPc(req) {
  const chave = req.headers['x-mural-chave'];
  return typeof chave === 'string' && chave.length > 0 && iguais(chave, exigirVariavel('MURAL_CHAVE_PCS'));
}

function ipDe(req) {
  return String(req.headers['x-real-ip'] || req.headers['x-forwarded-for'] || req.socket?.remoteAddress || '?').split(',')[0].trim().slice(0, 64);
}

/** Até 10 senhas erradas por IP a cada 15 minutos. */
async function conferirSenha(req, senha) {
  const ip = ipDe(req);
  const [{ n }] = await consulta(
    "select count(*)::int as n from tentativas_login where ip = $1 and em > now() - interval '15 minutes'", [ip]);
  if (n >= 10) throw new ErroEntrada('Muitas tentativas. Espere 15 minutos e tente de novo.', 429);
  if (typeof senha === 'string' && senha && iguais(senha, exigirVariavel('MURAL_SENHA_ADMIN'))) return true;
  await consulta('insert into tentativas_login (ip) values ($1)', [ip]);
  await consulta("delete from tentativas_login where em < now() - interval '1 day'");
  return false;
}

module.exports = { cookieDaSessao, cookieDeSaida, ehAdmin, ehPc, conferirSenha };
