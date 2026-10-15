'use strict';
// Assinatura de upload da Cloudinary (o segredo nunca sai do servidor).
// O navegador envia o arquivo direto para a Cloudinary com essa assinatura.
const crypto = require('node:crypto');
const { ErroEntrada } = require('./validar');

const REGRAS_PASTA = {
  fotos: { tipos: ['image/jpeg', 'image/png', 'image/webp'], maximo: 20 * 1024 * 1024, recurso: 'image' },
  logos: { tipos: ['image/jpeg', 'image/png', 'image/webp'], maximo: 2 * 1024 * 1024, recurso: 'image' },
  anexos: {
    tipos: [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
    maximo: 10 * 1024 * 1024,
  },
};

function config() {
  const cloud = process.env.CLOUDINARY_CLOUD || '';
  const chave = process.env.CLOUDINARY_KEY || '';
  const segredo = process.env.CLOUDINARY_SECRET || '';
  if (!cloud || !chave || !segredo) throw new ErroEntrada('Envio de arquivos indisponível. Fale com o TI.', 503);
  return { cloud, chave, segredo };
}

function nomeSeguro(nome) {
  const base = String(nome || 'arquivo').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9.]+/g, '-').replace(/^-+|-+$/g, '').slice(-80) || 'arquivo';
  return base;
}

/** Assina um upload: o navegador manda o arquivo direto para a Cloudinary. */
function assinar(pasta, nome, tipo, tamanho) {
  const regra = REGRAS_PASTA[pasta];
  if (!regra) throw new ErroEntrada('Destino inválido.');
  if (!regra.tipos.includes(tipo)) throw new ErroEntrada('Formato não aceito.');
  if (!(tamanho > 0) || tamanho > regra.maximo) throw new ErroEntrada('Arquivo grande demais.');
  const { cloud, chave, segredo } = config();
  const publicId = `${pasta}/${Date.now()}-${nomeSeguro(nome).replace(/[.][a-z0-9]+$/i, '')}`;
  const timestamp = Math.floor(Date.now() / 1000);
  const recurso = pasta === 'anexos' && !tipo.startsWith('image/') ? 'raw' : 'image';
  const paraAssinar = `folder=${pasta}&public_id=${publicId}&timestamp=${timestamp}${segredo}`;
  const signature = crypto.createHash('sha1').update(paraAssinar).digest('hex');
  return { cloud, apiKey: chave, timestamp, signature, folder: pasta, publicId, recurso };
}

module.exports = { REGRAS_PASTA, assinar };
