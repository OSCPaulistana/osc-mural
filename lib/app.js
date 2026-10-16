'use strict';
// API do Mural OSC. Uma função só na Vercel (api/index.js) atende todas as rotas /api/*.
const crypto = require('node:crypto');
const { consulta } = require('./db');
const seg = require('./seguranca');
const V = require('./validar');
const { ErroEntrada, VALIDAR, UNIDADES, URL_BLOB, URL_NUVEM, presenca } = V;

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

const ehUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(v);

// ---------- Consultas ----------

const HOJE_SP = "(now() at time zone 'America/Sao_Paulo')::date";

const COLUNAS = {
  sistemas: 'id, nome, descricao, tipo, endereco, icone, cor, logo, ordem, unidade',
  avisos: 'id, titulo, texto, prioridade, unidade, fixado, expira_em as "expiraEm", criado_em as "criadoEm", anexo_url as "anexoUrl", anexo_nome as "anexoNome"',
  eventos: 'id, titulo, data, hora, local, unidade, criado_em as "criadoEm"',
  elogios: 'id, titulo, texto, unidade, inicio_em as "inicioEm", fim_em as "fimEm", criado_em as "criadoEm"',
  albuns: 'id, titulo, data, unidade, capa_id as "capaId", criado_em as "criadoEm"',
};

const ORDEM_AVISOS = `(prioridade <> 'urgente'), fixado desc,
  case prioridade when 'urgente' then 0 when 'importante' then 1 else 2 end, criado_em desc`;

function filtroUnidade(unidade, coluna = 'unidade') {
  return unidade ? { sql: `and (${coluna} = 'todas' or ${coluna} = $1)`, p: [unidade] } : { sql: '', p: [] };
}

async function secaoAtual() {
  const [linha] = await consulta(`select valor from config where chave = 'secao'`);
  const v = linha?.valor;
  return v === 'elogios' ? 'elogios' : 'agenda';
}

async function visaoPublica(unidade) {
  const f = filtroUnidade(unidade);
  const fa = filtroUnidade(unidade, 'a.unidade');
  const fa2 = filtroUnidade(unidade, 'a2.unidade');
  const [sistemas, avisos, eventos, elogios, fotos, secao] = await Promise.all([
    consulta(`select ${COLUNAS.sistemas} from sistemas where true ${f.sql} order by ordem, criado_em`, f.p),
    consulta(`select ${COLUNAS.avisos} from avisos
      where arquivado_em is null and (expira_em is null or expira_em >= ${HOJE_SP}) ${f.sql} order by ${ORDEM_AVISOS}`, f.p),
    consulta(`select ${COLUNAS.eventos} from eventos where data >= ${HOJE_SP} ${f.sql} order by data, nullif(hora, '') nulls last`, f.p),
    consulta(`select ${COLUNAS.elogios} from elogios
      where (inicio_em is null or inicio_em <= ${HOJE_SP}) and (fim_em is null or fim_em >= ${HOJE_SP}) ${f.sql}
      order by criado_em desc limit 20`, f.p),
    // No rodapé passam só as fotos do último evento (álbum mais recente com fotos);
    // o histórico completo de álbuns fica na galeria (/api/galeria).
    consulta(`select f.id, f.url, f.legenda, a.id as "albumId", a.titulo as "album", a.data
      from fotos f join albuns a on a.id = f.album_id
      where a.id = (select a2.id from albuns a2
        where exists (select 1 from fotos f2 where f2.album_id = a2.id) ${fa2.sql}
        order by a2.data desc, a2.criado_em desc limit 1) ${fa.sql}
      order by f.ordem, f.criado_em limit 40`, fa.p),
    secaoAtual(),
  ]);
  return { sistemas, avisos, eventos, elogios, secao, fotos };
}

async function albunsComFotos(unidade) {
  const f = filtroUnidade(unidade);
  const albuns = await consulta(`select ${COLUNAS.albuns} from albuns where true ${f.sql} order by data desc, criado_em desc`, f.p);
  if (!albuns.length) return [];
  const fotos = await consulta(
    `select id, album_id as "albumId", url, legenda, ordem from fotos where album_id = any($1::uuid[]) order by ordem, criado_em`,
    [albuns.map((a) => a.id)]);
  for (const a of albuns) {
    a.fotos = fotos.filter((x) => x.albumId === a.id);
    a.capa = (a.fotos.find((x) => x.id === a.capaId) || a.fotos[0])?.url || null;
  }
  return albuns;
}

async function visaoAdmin(eu) {
  const [sistemas, avisos, eventos, elogios, albuns, pcs, admins, config, secao] = await Promise.all([
    consulta(`select ${COLUNAS.sistemas} from sistemas order by ordem, criado_em`),
    consulta(`select av.id, av.titulo, av.texto, av.prioridade, av.unidade, av.fixado, av.expira_em as "expiraEm",
        av.criado_em as "criadoEm", av.arquivado_em as "arquivadoEm", av.anexo_url as "anexoUrl", av.anexo_nome as "anexoNome", c.nome as "criadoPor", r.nome as "arquivadoPor"
      from avisos av left join admins c on c.id = av.criado_por left join admins r on r.id = av.arquivado_por
      order by av.criado_em desc`),
    consulta(`select ${COLUNAS.eventos} from eventos order by data`),
    consulta(`select ${COLUNAS.elogios} from elogios order by criado_em desc`),
    albunsComFotos(null),
    consulta(`select id, computador, usuario, unidade, versao, visto_em as "vistoEm", primeiro_contato as "primeiroContato",
      visto_em > now() - interval '10 minutes' as online from pcs order by visto_em desc`),
    consulta(`select id, nome, email, ativo, criado_em as "criadoEm", ultimo_acesso as "ultimoAcesso" from admins order by ativo desc, nome`),
    consulta(`select valor from config where chave = 'instalador'`),
    secaoAtual(),
  ]);
  return {
    eu, sistemas, avisos, eventos, elogios, albuns, pcs, admins, secao,
    conectados: pcs.filter((p) => p.online).length, instalador: config[0]?.valor || null,
  };
}

// ---------- Escrita genérica (sistemas, eventos, elogios, avisos, álbuns) ----------

const COLUNAS_DB = { expiraEm: 'expira_em', anexoUrl: 'anexo_url', anexoNome: 'anexo_nome', inicioEm: 'inicio_em', fimEm: 'fim_em' };
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

async function apagarDoBlob(urls) {
  const lista = [].concat(urls).filter((u) => u && URL_BLOB.test(u));
  if (!lista.length) return;
  try { await require('@vercel/blob').del(lista); } catch (erro) { console.warn('[mural] não apagou do Blob:', erro.message); }
}

/** Apaga o arquivo de onde ele estiver (Blob antigo ou Cloudinary). */
async function apagarArquivo(urls) {
  await Promise.all([apagarDoBlob(urls), apagarDaNuvem(urls)]);
}

/** Confere no Blob que a foto existe, é deste projeto e é mesmo imagem. */
async function conferirImagem(url, pasta) {
  if (typeof url !== 'string' || !url.includes(`/${pasta}/`)
    || !(URL_BLOB.test(url) || URL_NUVEM.test(url))) throw new ErroEntrada('Arquivo inválido. Envie de novo.');
  if (URL_NUVEM.test(url)) return conferirNaNuvem(url, pasta, ['image/jpeg', 'image/png', 'image/webp'], 'Formato não aceito. Envie JPG, PNG ou WEBP.');
  let info;
  try { info = await require('@vercel/blob').head(url); } catch { throw new ErroEntrada('Arquivo não encontrado no armazenamento. Envie de novo.'); }
  if (/^image\/(jpeg|png|webp)$/.test(info.contentType || '')) return;
  await apagarDoBlob(url);
  throw new ErroEntrada('Formato não aceito. Envie JPG, PNG ou WEBP.');
}

/** Confere no Blob que o anexo do aviso existe, é deste projeto e é de um tipo aceito. */
async function conferirAnexo(url) {
  if (!url) return;
  if (typeof url !== 'string' || !url.includes('/anexos/')
    || !(URL_BLOB.test(url) || URL_NUVEM.test(url))) throw new ErroEntrada('Anexo inválido. Envie de novo.');
  if (URL_NUVEM.test(url)) return conferirNaNuvem(url, 'anexos', V.TIPOS_ANEXO, 'Formato de anexo não aceito. Envie foto, PDF, Word ou Excel.');
  let info;
  try { info = await require('@vercel/blob').head(url); } catch { throw new ErroEntrada('Anexo não encontrado no armazenamento. Envie de novo.'); }
  if (V.TIPOS_ANEXO.includes(info.contentType || '')) return;
  await apagarDoBlob(url);
  throw new ErroEntrada('Formato de anexo não aceito. Envie foto, PDF, Word ou Excel.');
}

/** Confere na Cloudinary que o arquivo existe e é de um tipo aceito. */
async function conferirNaNuvem(url, pasta, tipos, mensagem) {
  let tipo = '';
  try {
    const r = await fetch(url, { method: 'HEAD', redirect: 'follow', signal: AbortSignal.timeout(15_000) });
    if (!r.ok) throw new Error();
    tipo = (r.headers.get('content-type') || '').split(';')[0].trim();
  } catch { throw new ErroEntrada('Arquivo não encontrado no armazenamento. Envie de novo.'); }
  if (tipos.includes(tipo)) return;
  await apagarDaNuvem(url);
  throw new ErroEntrada(mensagem);
}

function publicIdDaUrl(url) {
  try {
    const m = /\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z0-9]+)?$/i.exec(new URL(url).pathname);
    return m ? decodeURIComponent(m[1]) : null;
  } catch { return null; }
}

/** Apaga um arquivo da Cloudinary (melhor esforço: erro aqui não barra o admin). */
async function apagarDaNuvem(urls) {
  const lista = [].concat(urls).filter((u) => u && URL_NUVEM.test(u));
  if (!lista.length) return;
  const cloud = process.env.CLOUDINARY_CLOUD || '';
  const chave = process.env.CLOUDINARY_KEY || '';
  const segredo = process.env.CLOUDINARY_SECRET || '';
  if (!cloud || !chave || !segredo) return;
  const crypto = require('node:crypto');
  await Promise.all(lista.map(async (u) => {
    try {
      const publicId = publicIdDaUrl(u);
      if (!publicId) return;
      const recurso = u.includes('/raw/upload/') ? 'raw' : 'image';
      const timestamp = Math.floor(Date.now() / 1000);
      const signature = crypto.createHash('sha1').update(`public_id=${publicId}&timestamp=${timestamp}${segredo}`).digest('hex');
      await fetch(`https://api.cloudinary.com/v1_1/${cloud}/${recurso}/destroy`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ public_id: publicId, api_key: chave, timestamp, signature }),
        signal: AbortSignal.timeout(15_000),
      });
    } catch {}
  }));
}

// ---------- Upload direto do navegador para o Blob ----------

const REGRAS_UPLOAD = {
  fotos: { tipos: ['image/jpeg', 'image/png', 'image/webp'], maximo: 20 * 1024 * 1024 },
  logos: { tipos: ['image/jpeg', 'image/png', 'image/webp'], maximo: 2 * 1024 * 1024 },
  anexos: { tipos: V.TIPOS_ANEXO, maximo: V.LIMITE_ANEXO_BYTES },
};

async function tokenDeUpload(req, res) {
  const { handleUpload } = require('@vercel/blob/client');
  const corpo = await lerJson(req);
  const resposta = await handleUpload({
    body: corpo,
    request: req,
    onBeforeGenerateToken: async (pathname) => {
      if (!(await seg.adminDaSessao(req))) throw new ErroEntrada('Faça login novamente.', 401);
      const pasta = pathname.split('/')[0];
      const regra = REGRAS_UPLOAD[pasta];
      if (!regra || !/^(fotos|logos|anexos)\/[A-Za-z0-9._-]{1,120}$/.test(pathname)) throw new ErroEntrada('Destino inválido.');
      return { allowedContentTypes: regra.tipos, maximumSizeInBytes: regra.maximo, addRandomSuffix: true };
    },
  });
  return json(res, 200, resposta);
}

// ---------- Rotas ----------

async function rotear(req, res) {
  const url = new URL(req.url, 'http://local');
  const rota = url.searchParams.get('rota') ?? url.pathname.replace(/^\/api\/?/, '');
  const partes = rota.split('/').filter(Boolean);
  const caminho = '/' + partes.join('/');
  const metodo = req.method;
  const unidadeDaUrl = () => {
    const u = url.searchParams.get('unidade');
    return UNIDADES.includes(u) && u !== 'todas' ? u : null;
  };

  // Leitura do mural e da galeria: app instalado (chave do PC) ou admin logado
  if (metodo === 'GET' && (caminho === '/dados' || caminho === '/galeria')) {
    if (!seg.ehPc(req) && !(await seg.adminDaSessao(req))) return json(res, 401, { erro: 'Este acesso é só pelo app instalado nos PCs.' });
    const dados = caminho === '/dados' ? await visaoPublica(unidadeDaUrl()) : { albuns: await albunsComFotos(unidadeDaUrl()) };
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

  // Página de instalação pública para os colaboradores.
  if (metodo === 'GET' && caminho === '/instalador/info') {
    const [linha] = await consulta(`select valor from config where chave = 'instalador'`);
    const v = linha?.valor;
    return json(res, 200, v ? { versao: v.versao, tamanho: v.tamanho, publicadoEm: v.publicadoEm } : null);
  }
  if (metodo === 'GET' && caminho === '/instalador') {
    const [linha] = await consulta(`select valor from config where chave = 'instalador'`);
    if (!linha?.valor?.url) return json(res, 404, { erro: 'O instalador ainda não foi publicado.' });
    res.writeHead(303, { Location: linha.valor.url, 'Cache-Control': 'no-store' });
    return res.end();
  }

  // Sessão
  if (metodo === 'GET' && caminho === '/sessao') {
    const admin = await seg.adminDaSessao(req);
    const [{ n }] = await consulta('select count(*)::int as n from admins');
    return json(res, 200, { logado: !!admin, admin, precisaPrimeiro: n === 0 });
  }
  if (metodo === 'POST' && caminho === '/login') {
    const { email, senha } = await lerJson(req);
    const admin = await seg.entrar(req, email, senha);
    if (!admin) return json(res, 401, { erro: 'E-mail ou senha incorretos.' });
    return json(res, 200, { ok: true, admin }, { 'Set-Cookie': seg.cookieDaSessao(admin.id) });
  }
  if (metodo === 'POST' && caminho === '/primeiro-admin') {
    const corpo = await lerJson(req);
    const [{ n }] = await consulta('select count(*)::int as n from admins');
    if (n > 0) return json(res, 409, { erro: 'O primeiro administrador já foi criado. Entre com e-mail e senha.' });
    if (!(await seg.conferirSenhaMestra(req, corpo.senhaMestra))) return json(res, 401, { erro: 'Senha de instalação incorreta.' });
    const dados = V.admin(corpo);
    const hash = await seg.gerarHash(seg.validarSenhaNova(corpo.senha));
    const [admin] = await consulta('insert into admins (nome, email, senha_hash) values ($1, $2, $3) returning id, nome, email',
      [dados.nome, dados.email, hash]);
    return json(res, 201, { ok: true, admin }, { 'Set-Cookie': seg.cookieDaSessao(admin.id) });
  }
  if (metodo === 'POST' && caminho === '/logout') return json(res, 200, { ok: true }, { 'Set-Cookie': seg.cookieDeSaida() });

  if (metodo === 'POST' && caminho === '/upload') return tokenDeUpload(req, res);

  // Daqui para baixo, só administradores
  const eu = await seg.adminDaSessao(req);
  if (!eu) return json(res, 401, { erro: 'Faça login novamente.' });

  if (metodo === 'GET' && caminho === '/admin/dados') return json(res, 200, await visaoAdmin(eu));

  // Assinatura de upload para a Cloudinary (fotos, logos e anexos).
  // O arquivo vai direto do navegador para lá; o segredo nunca sai do servidor.
  if (metodo === 'POST' && caminho === '/assinar') {
    const corpo = await lerJson(req);
    return json(res, 200, require('./nuvem').assinar(corpo.pasta, corpo.nome, corpo.tipo, corpo.tamanho));
  }

  if (metodo === 'POST' && caminho === '/minha-senha') {
    const { atual, nova } = await lerJson(req);
    const [linha] = await consulta('select senha_hash from admins where id = $1', [eu.id]);
    if (!(await seg.senhaConfere(atual, linha?.senha_hash))) return json(res, 400, { erro: 'A senha atual não confere.' });
    await consulta('update admins set senha_hash = $2, atualizado_em = now() where id = $1', [eu.id, await seg.gerarHash(seg.validarSenhaNova(nova))]);
    return json(res, 200, { ok: true });
  }

  // Qual seção aparece no mural abaixo dos avisos: agenda ou elogios.
  if (caminho === '/secao') {
    if (metodo === 'GET') return json(res, 200, { secao: await secaoAtual() });
    if (metodo === 'POST') {
      const v = V.secao((await lerJson(req)).secao);
      await consulta(`insert into config (chave, valor) values ('secao', to_jsonb($1::text))
        on conflict (chave) do update set valor = to_jsonb($1::text), atualizado_em = now()`, [v]);
      return json(res, 200, { ok: true, secao: v });
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  }

  const [colecao, id, acao] = partes;
  if (id && colecao !== 'pcs' && !ehUuid(id)) return json(res, 404, { erro: 'Item não encontrado.' });

  // Computadores
  if (colecao === 'pcs' && id && metodo === 'DELETE') {
    await consulta('delete from pcs where id = $1', [id]);
    return json(res, 200, { ok: true });
  }

  // Administradores
  if (colecao === 'admins') {
    if (metodo === 'POST' && !id) {
      const corpo = await lerJson(req);
      const dados = V.admin(corpo);
      const hash = await seg.gerarHash(seg.validarSenhaNova(corpo.senha));
      try {
        const [novo] = await consulta('insert into admins (nome, email, senha_hash) values ($1, $2, $3) returning id, nome, email, ativo',
          [dados.nome, dados.email, hash]);
        return json(res, 201, novo);
      } catch (erro) {
        if (erro.code === '23505') throw new ErroEntrada('Já existe um administrador com este e-mail.');
        throw erro;
      }
    }
    if (metodo === 'PUT' && id) {
      const corpo = await lerJson(req);
      const dados = V.admin(corpo);
      const ativo = corpo.ativo !== false;
      if (id === eu.id && !ativo) throw new ErroEntrada('Você não pode desativar o próprio acesso.');
      if (!ativo) {
        const [{ n }] = await consulta('select count(*)::int as n from admins where ativo and id <> $1', [id]);
        if (n === 0) throw new ErroEntrada('Precisa sobrar pelo menos um administrador ativo.');
      }
      const novaSenha = corpo.senha ? await seg.gerarHash(seg.validarSenhaNova(corpo.senha)) : null;
      try {
        const [linha] = await consulta(
          `update admins set nome = $2, email = $3, ativo = $4, senha_hash = coalesce($5, senha_hash), atualizado_em = now()
           where id = $1 returning id, nome, email, ativo`, [id, dados.nome, dados.email, ativo, novaSenha]);
        if (!linha) return json(res, 404, { erro: 'Administrador não encontrado.' });
        return json(res, 200, linha);
      } catch (erro) {
        if (erro.code === '23505') throw new ErroEntrada('Já existe um administrador com este e-mail.');
        throw erro;
      }
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  }

  // Avisos: retirar do mural guarda no histórico; nada é apagado.
  if (colecao === 'avisos') {
    if (metodo === 'POST' && !id) {
      const dados = VALIDAR.avisos(await lerJson(req));
      await conferirAnexo(dados.anexoUrl);
      const [linha] = await consulta(
        `insert into avisos (titulo, texto, prioridade, unidade, fixado, expira_em, anexo_url, anexo_nome, criado_por) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         returning ${COLUNAS.avisos}`, [dados.titulo, dados.texto, dados.prioridade, dados.unidade, dados.fixado, dados.expiraEm, dados.anexoUrl, dados.anexoNome, eu.id]);
      return json(res, 201, linha);
    }
    if (metodo === 'PUT' && id && !acao) {
      const dados = VALIDAR.avisos(await lerJson(req));
      await conferirAnexo(dados.anexoUrl);
      const [anterior] = await consulta('select anexo_url as "anexoUrl" from avisos where id = $1', [id]);
      const linha = await atualizar('avisos', id, dados);
      if (!linha) return json(res, 404, { erro: 'Aviso não encontrado.' });
      if (anterior?.anexoUrl && anterior.anexoUrl !== linha.anexoUrl) await apagarArquivo(anterior.anexoUrl);
      return json(res, 200, linha);
    }
    if (metodo === 'DELETE' && id) {
      const [linha] = await consulta('update avisos set arquivado_em = now(), arquivado_por = $2 where id = $1 and arquivado_em is null returning id', [id, eu.id]);
      return linha ? json(res, 200, { ok: true }) : json(res, 404, { erro: 'Aviso não encontrado ou já retirado.' });
    }
    if (metodo === 'POST' && id && acao === 'republicar') {
      const [linha] = await consulta(
        `update avisos set arquivado_em = null, arquivado_por = null,
           expira_em = case when expira_em < ${HOJE_SP} then null else expira_em end, atualizado_em = now()
         where id = $1 returning id`, [id]);
      return linha ? json(res, 200, { ok: true }) : json(res, 404, { erro: 'Aviso não encontrado.' });
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  }

  // Álbuns e fotos
  if (colecao === 'albuns') {
    if (metodo === 'POST' && !id) {
      const dados = VALIDAR.albuns(await lerJson(req));
      return json(res, 201, await inserir('albuns', { ...dados, criado_por: eu.id }));
    }
    if (metodo === 'PUT' && id && !acao) {
      const linha = await atualizar('albuns', id, VALIDAR.albuns(await lerJson(req)));
      return linha ? json(res, 200, linha) : json(res, 404, { erro: 'Álbum não encontrado.' });
    }
    if (metodo === 'DELETE' && id && !acao) {
      const fotos = await consulta('select url from fotos where album_id = $1', [id]);
      const [linha] = await consulta('delete from albuns where id = $1 returning id', [id]);
      if (!linha) return json(res, 404, { erro: 'Álbum não encontrado.' });
      await apagarArquivo(fotos.map((f) => f.url));
      return json(res, 200, { ok: true });
    }
    if (metodo === 'POST' && id && acao === 'fotos') {
      const corpo = await lerJson(req);
      await conferirImagem(corpo.url, 'fotos');
      const { legenda } = VALIDAR.fotos(corpo);
      const [foto] = await consulta(
        `insert into fotos (album_id, url, legenda, ordem)
         select $1, $2, $3, coalesce(max(ordem), 0) + 1 from fotos where album_id = $1
         returning id, album_id as "albumId", url, legenda, ordem`, [id, corpo.url, legenda]);
      return json(res, 201, foto);
    }
    if (metodo === 'POST' && id && acao === 'capa') {
      const { fotoId } = await lerJson(req);
      const [linha] = await consulta(
        'update albuns set capa_id = $2, atualizado_em = now() where id = $1 and exists (select 1 from fotos where id = $2 and album_id = $1) returning id',
        [id, ehUuid(fotoId) ? fotoId : null]);
      return linha ? json(res, 200, { ok: true }) : json(res, 400, { erro: 'Foto não pertence a este álbum.' });
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  }

  if (colecao === 'fotos' && id) {
    if (metodo === 'PUT') {
      const [linha] = await consulta('update fotos set legenda = $2, atualizado_em = now() where id = $1 returning id',
        [id, VALIDAR.fotos(await lerJson(req)).legenda]);
      return linha ? json(res, 200, { ok: true }) : json(res, 404, { erro: 'Foto não encontrada.' });
    }
    if (metodo === 'DELETE') {
      const [foto] = await consulta('delete from fotos where id = $1 returning url', [id]);
      if (!foto) return json(res, 404, { erro: 'Foto não encontrada.' });
      await apagarArquivo(foto.url);
      return json(res, 200, { ok: true });
    }
    return json(res, 405, { erro: 'Método não permitido.' });
  }

  // Sistemas, eventos e elogios
  if (!['sistemas', 'eventos', 'elogios'].includes(colecao)) return json(res, 404, { erro: 'Não encontrado.' });

  if (metodo === 'POST' && !id) return json(res, 201, await inserir(colecao, VALIDAR[colecao](await lerJson(req))));

  if (metodo === 'PUT' && id && !acao) {
    const dados = VALIDAR[colecao](await lerJson(req));
    const [anterior] = colecao === 'sistemas' ? await consulta('select logo from sistemas where id = $1', [id]) : [];
    const linha = await atualizar(colecao, id, dados);
    if (!linha) return json(res, 404, { erro: 'Item não encontrado.' });
    if (anterior?.logo && anterior.logo !== linha.logo) await apagarArquivo(anterior.logo);
    return json(res, 200, linha);
  }

  if (metodo === 'DELETE' && id) {
    const [removido] = await consulta(`delete from ${colecao} where id = $1 returning ${colecao === 'sistemas' ? 'logo' : 'id'} as arquivo`, [id]);
    if (!removido) return json(res, 404, { erro: 'Item não encontrado.' });
    if (colecao === 'sistemas') await apagarArquivo(removido.arquivo);
    return json(res, 200, { ok: true });
  }

  if (metodo === 'POST' && colecao === 'sistemas' && acao === 'mover') {
    const { direcao } = await lerJson(req);
    const lista = await consulta('select id from sistemas order by ordem, criado_em');
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
