'use strict';
// API do Mural OSC. Uma função só na Vercel (api/index.js) atende todas as rotas /api/*.
const crypto = require('node:crypto');
const { consulta } = require('./db');
const seg = require('./seguranca');
const { ErroEntrada, VALIDAR, UNIDADES, URL_BLOB, presenca } = require('./validar');

// ---------- Utilidades HTTP ----------

function json(res, status, corpo, cabecalhos = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cabecalhos });
  res.end(JSON.stringify(corpo));
}

async function lerCorpo(req) {
  const tipo = req.headers['content-type'] || '';
  if (req.body !== undefined && req.body !== null && !Buffer.isBuffer(req.body)) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return tipo.includes('json') ? JSON.parse(req.body || '{}') : Object.fromEntries(new URLSearchParams(req.body));
  }
  const partes = [];
  let total = 0;
  for await (const parte of req) {
    total += parte.length;
    if (total > 100_000) throw new ErroEntrada('Conteúdo grande demais.');
    partes.push(parte);
  }
  const bruto = Buffer.concat(partes).toString('utf8');
  if (tipo.includes('application/x-www-form-urlencoded')) return Object.fromEntries(new URLSearchParams(bruto));
  try { return bruto ? JSON.parse(bruto) : {}; } catch { throw new ErroEntrada('JSON inválido.'); }
}

/** Mudanças só aceitam JSON: junto com o cookie SameSite=Strict, isso barra envio de outro site. */
async function lerJson(req) {
  if (!/^application\/json/.test(req.headers['content-type'] || '')) throw new ErroEntrada('Envie JSON.');
  return lerCorpo(req);
}

// ---------- Consultas ----------

const HOJE_SP = "(now() at time zone 'America/Sao_Paulo')::date";

const COLUNAS = {
  sistemas: 'id, nome, descricao, tipo, endereco, icone, cor, logo, ordem',
  avisos: 'id, titulo, texto, prioridade, unidade, fixado, expira_em as "expiraEm", criado_em as "criadoEm"',
  eventos: 'id, titulo, data, hora, local, unidade, criado_em as "criadoEm"',
  midias: 'id, tipo, url, legenda, data, unidade, criado_em as "criadoEm"',
};

const ORDEM_AVISOS = `(prioridade <> 'urgente'), fixado desc,
  case prioridade when 'urgente' then 0 when 'importante' then 1 else 2 end, criado_em desc`;

async function visaoPublica(unidade) {
  const filtro = unidade ? "and (unidade = 'todas' or unidade = $1)" : '';
  const p = unidade ? [unidade] : [];
  const [sistemas, avisos, eventos, midias] = await Promise.all([
    consulta(`select ${COLUNAS.sistemas} from sistemas order by ordem, criado_em`),
    consulta(`select ${COLUNAS.avisos} from avisos where (expira_em is null or expira_em >= ${HOJE_SP}) ${filtro} order by ${ORDEM_AVISOS}`, p),
    consulta(`select ${COLUNAS.eventos} from eventos where data >= ${HOJE_SP} ${filtro} order by data, nullif(hora, '') nulls last`, p),
    consulta(`select ${COLUNAS.midias} from midias where true ${filtro} order by data desc, criado_em desc limit 30`, p),
  ]);
  return { sistemas, avisos, eventos, midias };
}

async function visaoAdmin() {
  const [sistemas, avisos, eventos, midias, pcs, config] = await Promise.all([
    consulta(`select ${COLUNAS.sistemas} from sistemas order by ordem, criado_em`),
    consulta(`select ${COLUNAS.avisos} from avisos order by criado_em desc`),
    consulta(`select ${COLUNAS.eventos} from eventos order by data`),
    consulta(`select ${COLUNAS.midias} from midias order by data desc, criado_em desc`),
    consulta(`select id, computador, usuario, unidade, versao, visto_em as "vistoEm", primeiro_contato as "primeiroContato",
      visto_em > now() - interval '10 minutes' as online from pcs order by visto_em desc`),
    consulta(`select valor from config where chave = 'instalador'`),
  ]);
  return { sistemas, avisos, eventos, midias, pcs, conectados: pcs.filter((p) => p.online).length, instalador: config[0]?.valor || null };
}

// ---------- Escrita ----------

const COLUNAS_DB = { expiraEm: 'expira_em' };
const col = (campo) => COLUNAS_DB[campo] || campo;

async function inserir(colecao, dados) {
  const campos = Object.keys(dados);
  const extra = colecao === 'sistemas' ? ', ordem' : '';
  const valorExtra = colecao === 'sistemas' ? ', (select coalesce(max(ordem), 0) + 1 from sistemas)' : '';
  const [linha] = await consulta(
    `insert into ${colecao} (${campos.map(col).join(', ')}${extra}) values (${campos.map((_, i) => `$${i + 1}`).join(', ')}${valorExtra})
     returning ${COLUNAS[colecao]}`,
    Object.values(dados));
  return linha;
}

async function atualizar(colecao, id, dados) {
  const campos = Object.keys(dados);
  const [linha] = await consulta(
    `update ${colecao} set ${campos.map((c, i) => `${col(c)} = $${i + 2}`).join(', ')}, atualizado_em = now()
     where id = $1 returning ${COLUNAS[colecao]}`,
    [id, ...Object.values(dados)]);
  return linha;
}

async function apagarDoBlob(url) {
  if (!url || !URL_BLOB.test(url)) return;
  try { await require('@vercel/blob').del(url); } catch (erro) { console.warn('[mural] não apagou do Blob:', erro.message); }
}

/** Confere no Blob que o arquivo existe, é deste projeto e é mesmo foto ou vídeo. */
async function conferirArquivo(url, pasta) {
  if (typeof url !== 'string' || !URL_BLOB.test(url) || !url.includes(`/${pasta}/`)) throw new ErroEntrada('Arquivo inválido. Envie de novo.');
  let info;
  try { info = await require('@vercel/blob').head(url); } catch { throw new ErroEntrada('Arquivo não encontrado no armazenamento. Envie de novo.'); }
  const tipo = info.contentType || '';
  if (pasta === 'midias' && /^image\/(jpeg|png|webp)$/.test(tipo)) return 'foto';
  if (pasta === 'midias' && /^video\/(mp4|webm)$/.test(tipo)) return 'video';
  if (pasta === 'logos' && /^image\/(jpeg|png|webp)$/.test(tipo)) return 'logo';
  await apagarDoBlob(url);
  throw new ErroEntrada('Formato não aceito.');
}

// ---------- Upload direto do navegador para o Blob ----------

const REGRAS_UPLOAD = {
  midias: { tipos: ['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm'], maximo: 200 * 1024 * 1024 },
  logos: { tipos: ['image/jpeg', 'image/png', 'image/webp'], maximo: 2 * 1024 * 1024 },
};

async function tokenDeUpload(req, res) {
  const { handleUpload } = require('@vercel/blob/client');
  const corpo = await lerJson(req);
  const resposta = await handleUpload({
    body: corpo,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!seg.ehAdmin(req)) throw new ErroEntrada('Faça login novamente.', 401);
      const pasta = pathname.split('/')[0];
      const regra = REGRAS_UPLOAD[pasta];
      if (!regra || !/^(midias|logos)\/[A-Za-z0-9._-]{1,120}$/.test(pathname)) throw new ErroEntrada('Destino inválido.');
      return { allowedContentTypes: regra.tipos, maximumSizeInBytes: regra.maximo, addRandomSuffix: true };
    },
  });
  return json(res, 200, resposta);
}

// ---------- Roteador ----------

async function rotear(req, res) {
  const url = new URL(req.url, 'http://local');
  const rota = url.searchParams.get('rota') ?? url.pathname.replace(/^\/api\/?/, '');
  const partes = rota.split('/').filter(Boolean);
  const caminho = '/' + partes.join('/');
  const metodo = req.method;

  // Leitura do mural: app instalado (chave do PC) ou admin logado (pré-visualização)
  if (metodo === 'GET' && caminho === '/dados') {
    if (!seg.ehPc(req) && !seg.ehAdmin(req)) return json(res, 401, { erro: 'Este acesso é só pelo app instalado nos PCs.' });
    const unidade = url.searchParams.get('unidade');
    const dados = await visaoPublica(UNIDADES.includes(unidade) && unidade !== 'todas' ? unidade : null);
    const etag = '"' + crypto.createHash('sha1').update(JSON.stringify(dados)).digest('base64url') + '"';
    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'private, no-cache' });
      return res.end();
    }
    return json(res, 200, dados, { ETag: etag, 'Cache-Control': 'private, no-cache' });
  }

  if (metodo === 'POST' && caminho === '/presenca') {
    if (!seg.ehPc(req)) return json(res, 401, { erro: 'Não autorizado.' });
    const p = presenca(await lerJson(req));
    await consulta(
      `insert into pcs (id, computador, usuario, unidade, versao) values ($1, $2, $3, $4, $5)
       on conflict (id) do update set computador = $2, usuario = $3, unidade = $4, versao = $5, visto_em = now()`,
      [p.id, p.computador, p.usuario, p.unidade, p.versao]);
    return json(res, 200, { ok: true });
  }

  // Instalador: informações públicas; o download pede a senha do admin (sem criar sessão no PC da pessoa).
  if (metodo === 'GET' && caminho === '/instalador/info') {
    const [linha] = await consulta(`select valor from config where chave = 'instalador'`);
    const v = linha?.valor;
    return json(res, 200, v ? { versao: v.versao, tamanho: v.tamanho, publicadoEm: v.publicadoEm } : null);
  }
  if (metodo === 'POST' && caminho === '/instalador') {
    const corpo = await lerCorpo(req);
    const [linha] = await consulta(`select valor from config where chave = 'instalador'`);
    const volta = (erro) => { res.writeHead(303, { Location: `/?erro=${encodeURIComponent(erro)}` }); res.end(); };
    try {
      if (!(await seg.conferirSenha(req, corpo.senha))) return volta('Senha incorreta.');
    } catch (erro) {
      if (erro instanceof ErroEntrada) return volta(erro.message);
      throw erro;
    }
    if (!linha?.valor?.url) return volta('O instalador ainda não foi publicado.');
    res.writeHead(303, { Location: linha.valor.url, 'Cache-Control': 'no-store' });
    return res.end();
  }

  // Sessão do admin
  if (metodo === 'GET' && caminho === '/sessao') return json(res, 200, { logado: seg.ehAdmin(req) });
  if (metodo === 'POST' && caminho === '/login') {
    const { senha } = await lerJson(req);
    if (!(await seg.conferirSenha(req, senha))) return json(res, 401, { erro: 'Senha incorreta.' });
    return json(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieDaSessao() });
  }
  if (metodo === 'POST' && caminho === '/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieDeSaida() });

  // O Blob confere a sessão dentro de onBeforeGenerateToken.
  if (metodo === 'POST' && caminho === '/upload') return tokenDeUpload(req, res);

  // Daqui para baixo, só o administrador
  if (!seg.ehAdmin(req)) return json(res, 401, { erro: 'Faça login novamente.' });

  if (metodo === 'GET' && caminho === '/admin/dados') return json(res, 200, await visaoAdmin());

  if (partes[0] === 'pcs' && partes.length === 2 && metodo === 'DELETE') {
    await consulta('delete from pcs where id = $1', [partes[1]]);
    return json(res, 200, { ok: true });
  }

  const colecao = partes[0];
  if (!VALIDAR[colecao]) return json(res, 404, { erro: 'Não encontrado.' });
  const id = partes[1];
  if (id && !/^[0-9a-f-]{36}$/.test(id)) return json(res, 404, { erro: 'Item não encontrado.' });

  if (metodo === 'POST' && partes.length === 1) {
    const corpo = await lerJson(req);
    const dados = VALIDAR[colecao](corpo);
    if (colecao === 'midias') {
      dados.tipo = await conferirArquivo(corpo.url, 'midias');
      dados.url = corpo.url;
    }
    return json(res, 201, await inserir(colecao, dados));
  }

  if (metodo === 'PUT' && partes.length === 2) {
    const dados = VALIDAR[colecao](await lerJson(req));
    const [anterior] = colecao === 'sistemas' ? await consulta('select logo from sistemas where id = $1', [id]) : [];
    const linha = await atualizar(colecao, id, dados);
    if (!linha) return json(res, 404, { erro: 'Item não encontrado.' });
    if (anterior?.logo && anterior.logo !== linha.logo) await apagarDoBlob(anterior.logo);
    return json(res, 200, linha);
  }

  if (metodo === 'DELETE' && partes.length === 2) {
    const campoArquivo = colecao === 'midias' ? 'url' : colecao === 'sistemas' ? 'logo' : null;
    const [removido] = await consulta(`delete from ${colecao} where id = $1 returning ${campoArquivo || 'id'} as arquivo`, [id]);
    if (!removido) return json(res, 404, { erro: 'Item não encontrado.' });
    if (campoArquivo) await apagarDoBlob(removido.arquivo);
    return json(res, 200, { ok: true });
  }

  if (metodo === 'POST' && colecao === 'sistemas' && partes[2] === 'mover') {
    const { direcao } = await lerJson(req);
    const lista = await consulta('select id, ordem from sistemas order by ordem, criado_em');
    const i = lista.findIndex((s) => s.id === id);
    const j = i + (direcao === -1 ? -1 : 1);
    if (i >= 0 && j >= 0 && j < lista.length) {
      [lista[i], lista[j]] = [lista[j], lista[i]];
      await consulta(
        `update sistemas as s set ordem = v.ordem from (select unnest($1::uuid[]) as id, generate_series(1, $2::int) as ordem) as v where s.id = v.id`,
        [lista.map((s) => s.id), lista.length]);
    }
    return json(res, 200, { ok: true });
  }

  return json(res, 405, { erro: 'Método não permitido.' });
}

async function handler(req, res) {
  try {
    await rotear(req, res);
  } catch (erro) {
    if (res.headersSent) return res.end();
    if (erro instanceof ErroEntrada) return json(res, erro.status, { erro: erro.message });
    if (erro instanceof SyntaxError) return json(res, 400, { erro: 'Conteúdo inválido.' });
    console.error('[mural]', erro);
    return json(res, 500, { erro: 'Erro interno. Tente de novo em instantes.' });
  }
}

module.exports = { handler };
