'use strict';
// Validação de tudo que o admin envia. Nada entra no banco sem passar por aqui.
const { ICONES_SISTEMA } = require('./icones');

class ErroEntrada extends Error {
  constructor(mensagem, status = 400) {
    super(mensagem);
    this.status = status;
  }
}

const UNIDADES = ['todas', 'assis', 'sao-paulo'];
const PRIORIDADES = ['urgente', 'importante', 'info'];
const SECOES = ['agenda', 'elogios'];
const CORES = ['azul', 'petroleo', 'grafite', 'verde', 'ambar', 'vermelho', 'roxo', 'ciano'];

// Arquivos enviados ficam no Vercel Blob do projeto; logos padrão ficam no próprio site.
const URL_BLOB = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/(midias|logos|fotos|anexos)\/[A-Za-z0-9._-]+$/;
// Fotos, logos e anexos novos ficam na Cloudinary (plano grátis); os do Blob continuam válidos.
const URL_NUVEM = /^https:\/\/res\.cloudinary\.com\/[^/]+\/(image|raw)\/upload\/(?:[^?]*\/)?(fotos|logos|anexos)\/[^?]+$/;
const LOGO_DO_SITE = /^\/assets\/branding\/[a-z0-9-]+\.png$/;

function ehArquivoNosso(url, pasta) {
  return typeof url === 'string'
    && ((URL_BLOB.test(url) || URL_NUVEM.test(url)) && url.includes(`/${pasta}/`));
}

// Anexo de aviso: 1 por aviso. Foto, PDF, Word ou Excel de até 10 MB.
const TIPOS_ANEXO = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];
const LIMITE_ANEXO_BYTES = 10 * 1024 * 1024;

function texto(valor, max, obrigatorio, rotulo) {
  const v = typeof valor === 'string' ? valor.trim() : '';
  if (obrigatorio && !v) throw new ErroEntrada(`Preencha o campo ${rotulo}.`);
  if (v.length > max) throw new ErroEntrada(`${rotulo} aceita no máximo ${max} caracteres.`);
  return v;
}

function umDe(valor, opcoes, rotulo) {
  if (!opcoes.includes(valor)) throw new ErroEntrada(`Valor inválido em ${rotulo}.`);
  return valor;
}

function data(valor, obrigatorio, rotulo) {
  if (!valor) {
    if (obrigatorio) throw new ErroEntrada(`Preencha o campo ${rotulo}.`);
    return null;
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor) || Number.isNaN(Date.parse(valor))) throw new ErroEntrada(`Data inválida em ${rotulo}.`);
  return valor;
}

function hora(valor) {
  if (!valor) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(valor)) throw new ErroEntrada('Horário inválido.');
  return valor;
}

function endereco(tipo, valor) {
  const v = texto(valor, 400, true, 'Endereço');
  if (tipo === 'site') {
    let url;
    try { url = new URL(v); } catch { throw new ErroEntrada('Endereço do site inválido. Use https://...'); }
    if (!['http:', 'https:'].includes(url.protocol)) throw new ErroEntrada('O site precisa começar com http:// ou https://');
    return url.href;
  }
  // Programa: só executáveis ou atalhos com caminho absoluto; o app nunca roda comando livre.
  if (!/^[a-zA-Z]:\\[^<>"|?*]+\.(exe|lnk)$/i.test(v)) throw new ErroEntrada('Informe o caminho completo do programa, terminando em .exe ou .lnk');
  return v;
}

function logo(valor) {
  if (!valor) return '';
  if (typeof valor !== 'string' || !(LOGO_DO_SITE.test(valor) || ehArquivoNosso(valor, 'logos'))) {
    throw new ErroEntrada('Logo inválido. Envie a imagem de novo.');
  }
  return valor;
}

function anexo(valor, nome) {
  const url = typeof valor === 'string' ? valor.trim() : '';
  const rotulo = typeof nome === 'string' ? nome.trim() : '';
  if (!url) return { anexoUrl: '', anexoNome: '' };
  if (!ehArquivoNosso(url, 'anexos')) throw new ErroEntrada('Anexo inválido. Envie o arquivo de novo.');
  const v = texto(rotulo || url.split('/').pop().split('?')[0], 120, true, 'Nome do anexo');
  return { anexoUrl: url, anexoNome: v };
}

const VALIDAR = {
  sistemas: (e) => {
    const tipo = umDe(e.tipo, ['site', 'programa'], 'Tipo');
    return {
      nome: texto(e.nome, 24, true, 'Nome'),
      descricao: texto(e.descricao, 60, false, 'Descrição'),
      tipo,
      endereco: endereco(tipo, e.endereco),
      icone: umDe(e.icone, ICONES_SISTEMA, 'Ícone'),
      cor: umDe(e.cor, CORES, 'Cor'),
      logo: logo(e.logo),
      unidade: umDe(e.unidade, UNIDADES, 'Quem vê'),
    };
  },
  avisos: (e) => ({
    titulo: texto(e.titulo, 90, true, 'Título'),
    texto: texto(e.texto, 600, false, 'Mensagem'),
    prioridade: umDe(e.prioridade, PRIORIDADES, 'Prioridade'),
    unidade: umDe(e.unidade, UNIDADES, 'Quem vê'),
    fixado: e.fixado === true,
    expiraEm: data(e.expiraEm, false, 'Mostrar até'),
    ...anexo(e.anexoUrl, e.anexoNome),
  }),
  eventos: (e) => ({
    titulo: texto(e.titulo, 90, true, 'Título'),
    data: data(e.data, true, 'Data'),
    hora: hora(e.hora),
    local: texto(e.local, 60, false, 'Local'),
    unidade: umDe(e.unidade, UNIDADES, 'Quem vê'),
  }),
  elogios: (e) => {
    const inicioEm = data(e.inicioEm, false, 'Mostrar de');
    const fimEm = data(e.fimEm, false, 'Até');
    if (inicioEm && fimEm && fimEm < inicioEm) throw new ErroEntrada('A data de fim é anterior à data de início.');
    return {
      titulo: texto(e.titulo, 90, true, 'Título'),
      texto: texto(e.texto, 300, true, 'Mensagem'),
      unidade: umDe(e.unidade, UNIDADES, 'Quem vê'),
      inicioEm,
      fimEm,
    };
  },
  albuns: (e) => ({
    titulo: texto(e.titulo, 90, true, 'Título do álbum'),
    data: data(e.data, true, 'Data'),
    unidade: umDe(e.unidade, UNIDADES, 'Quem vê'),
  }),
  fotos: (e) => ({
    legenda: texto(e.legenda, 140, false, 'Legenda'),
  }),
};

function presenca(e) {
  const id = texto(e.id, 64, true, 'id');
  if (!/^[a-f0-9-]{16,64}$/.test(id)) throw new ErroEntrada('Identificador do PC inválido.');
  return {
    id,
    computador: texto(e.computador, 64, false, 'Computador'),
    usuario: texto(e.usuario, 64, false, 'Usuário'),
    unidade: UNIDADES.includes(e.unidade) ? e.unidade : 'todas',
    versao: texto(e.versao, 20, false, 'Versão'),
  };
}

function email(valor) {
  const v = texto(valor, 120, true, 'E-mail').toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) throw new ErroEntrada('E-mail inválido.');
  return v;
}

function admin(e) {
  return { nome: texto(e.nome, 80, true, 'Nome'), email: email(e.email) };
}

function secao(valor) {
  return umDe(valor, SECOES, 'Seção');
}

module.exports = { ErroEntrada, VALIDAR, UNIDADES, SECOES, URL_BLOB, URL_NUVEM, TIPOS_ANEXO, LIMITE_ANEXO_BYTES, presenca, texto, admin, secao };
